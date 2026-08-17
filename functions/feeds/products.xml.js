// Dynamic product feed for Google Merchant Center & Meta Commerce Manager —
// served fresh from the D1 catalog on every request, so creating, updating,
// unpublishing, or deleting a product instantly changes the feed with no
// redeploy.
//
// URL: /feeds/products.xml  (Pages Function route: feeds/products.xml.js)
//
// The payload is a Google Shopping RSS 2.0 feed (xmlns:g) with one <item>
// per active product. Meta's catalog data-source import accepts the same
// format, so the identical URL works for both marketing suites.
//
// Google Merchant Center compatibility (see google-merchant-feed-fix.md):
//   • Currency — prices are formatted as "1999.00 KES" (number + space + ISO
//     code), the exact shape Google accepts for the KE target market.
//   • Shipping — every item carries a feed-level <g:shipping> block using the
//     store's default delivery fee (KES 500 — functions/api/checkout.js
//     DELIVERY_FEES.Other, the rate for any location outside the dropdown),
//     so no item can report "missing shipping information".
//   • Availability — Google's machine values in_stock / out_of_stock.
//   • Images — g:image_link points at the R2 proxy (/products/...), which
//     returns real image bytes with a correct Content-Type. Products without
//     a primary image are refused (and logged loudly) instead of emitting a
//     broken image_link.
//   • Validation — every item is validated and deviations are logged with the
//     product id, field, and generated value, so source-data problems surface
//     in the Cloudflare logs instead of silently shipping bad items.
//
// Stock is summed from the `inventory` table (the single source of truth);
// products without inventory rows fall back to the legacy `product_variants`
// mirror. Images and brand/currency come from the same sources the rest of
// the storefront uses (functions/lib/edge-seo.js).

import { ensureSchema } from "../lib/schema.js";
import { BRAND, CURRENCY, buildImageUrl } from "../lib/edge-seo.js";

const getSiteUrl = (env) =>
  (env?.SITE_URL || env?.CF_PAGES_URL || "https://mambobeard.store").replace(
    /\/$/,
    "",
  );

const getR2PublicUrl = (env) =>
  (env?.R2_PUBLIC_URL || env?.VITE_R2_PUBLIC_URL || "").replace(/\/$/, "");

const xmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// ─────────────────────────────────────────────────────────────
// GOOGLE FEED VALUE FORMATTERS (feed-only — frontend formatting untouched)
// ─────────────────────────────────────────────────────────────

/**
 * Format a product price for Google: "1999.00 KES".
 * Returns null for missing / negative / non-numeric prices so callers can
 * refuse (and log) the product instead of emitting an invalid price.
 */
const formatGooglePrice = (price) => {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) return null;
  return `${numericPrice.toFixed(2)} ${CURRENCY || "KES"}`;
};

/** Google's machine availability values (spec: in_stock / out_of_stock). */
const formatAvailability = (stock) =>
  Number(stock) > 0 ? "in_stock" : "out_of_stock";

/**
 * Format a per-product weight (kg, from the products.weight column) for
 * Google's shipping_weight attribute. Returns null when unset/invalid so
 * callers fall back to the category-based default.
 */
const formatDbWeight = (weight) => {
  const numeric = Number(weight);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return `${parseFloat(numeric.toFixed(2))} kg`;
};

// Feed-level shipping for the KE target market. The store charges per-zone
// delivery fees (functions/api/checkout.js DELIVERY_FEES); the default for
// any location outside the configured dropdown — and the maximum — is KES 500,
// which is the honest flat rate to expose to Merchant Center.
const SHIPPING = {
  country: "KE",
  service: "Standard Delivery",
  price: 500,
};

const isAbsoluteHttps = (url) =>
  typeof url === "string" && /^https:\/\/[^/]/.test(url);

/**
 * Validate one feed item before it is emitted. Returns an array of
 * { field, value, problem } entries; callers log every entry so the product
 * is never silently dropped or shipped broken.
 */
const validateGoogleProduct = (product) => {
  const errors = [];
  const check = (field, value, problem) => {
    if (problem) errors.push({ field, value: String(value ?? ""), problem });
  };

  check("id", product.id, product.id ? "" : "missing id");
  check("title", product.title, product.title ? "" : "missing title");
  check(
    "link",
    product.link,
    isAbsoluteHttps(product.link) ? "" : "link must be an absolute https URL",
  );
  check(
    "image_link",
    product.image_link,
    !product.image_link
      ? "missing image_link (product has no primary image)"
      : isAbsoluteHttps(product.image_link)
        ? ""
        : "image_link must be an absolute https URL",
  );
  check("price", product.price, product.price ? "" : "missing price");
  check(
    "price",
    product.price,
    /^\d+\.\d{2} KES$/.test(product.price || "")
      ? ""
      : 'price must be formatted "1999.00 KES"',
  );
  check(
    "availability",
    product.availability,
    ["in_stock", "out_of_stock"].includes(product.availability)
      ? ""
      : "availability must be in_stock or out_of_stock",
  );
  check("shipping", product.shipping, product.shipping ? "" : "missing shipping");
  check(
    "shipping_price",
    product.shipping?.price,
    /^\d+\.\d{2} KES$/.test(product.shipping?.price || "")
      ? ""
      : 'shipping price must be formatted "1999.00 KES"',
  );
  check(
    "shipping_weight",
    product.shipping_weight,
    /^\d+(\.\d+)? (g|kg|lb|oz)$/.test(product.shipping_weight || "")
      ? ""
      : 'shipping_weight must be a value + unit, e.g. "0.5 kg"',
  );

  return errors;
};

// Map the store's free-form `products.category` strings to the official
// Google product taxonomy (taxonomy.en-US.txt, v2021-09-21 — the current
// version Google Merchant Center accepts). Rules are ordered most-specific
// first and matched case-insensitively. When nothing matches, the tag is
// omitted so Google auto-classifies rather than risk a wrong category.
//
// Note the taxonomy has no beard-care leaf: beard oils/balms land on the
// `Shaving & Grooming` umbrella, and trimmers/clippers on `Hair Clippers &
// Trimmers`. Clothing paths are the standard Apparel & Accessories branches.
const GOOGLE_CATEGORY_RULES = [
  [
    /trimmer|clipper|razor|tool/i,
    "Health & Beauty > Personal Care > Shaving & Grooming > Hair Clippers & Trimmers",
  ],
  [
    /beard|care|oil|balm|butter|groom|shav|moistur/i,
    "Health & Beauty > Personal Care > Shaving & Grooming",
  ],
  [
    /hoodie|sweatshirt|crewneck|jacket|coat|outerwear|windbreaker/i,
    "Apparel & Accessories > Clothing > Outerwear",
  ],
  [
    /tee|t-?shirt|shirt|top|polo/i,
    "Apparel & Accessories > Clothing > Shirts & Tops",
  ],
  [
    /pants|trousers|jeans|jogger|sweatpant/i,
    "Apparel & Accessories > Clothing > Pants",
  ],
  [/shorts/i, "Apparel & Accessories > Clothing > Shorts"],
  [
    /cap|hat|beanie/i,
    "Apparel & Accessories > Clothing Accessories > Hats",
  ],
  [
    /belt|scarf|shawl|glove|mitten/i,
    "Apparel & Accessories > Clothing Accessories",
  ],
  [
    /sock/i,
    "Apparel & Accessories > Clothing > Underwear & Socks > Socks",
  ],
  [
    /bag|backpack|tote/i,
    "Apparel & Accessories > Handbags, Wallets & Cases",
  ],
  [
    /apparel|clothing|wear|fashion|streetwear/i,
    "Apparel & Accessories > Clothing",
  ],
];

const mapGoogleCategory = (category) => {
  const value = String(category || "").trim();
  if (!value) return "";
  for (const [pattern, path] of GOOGLE_CATEGORY_RULES) {
    if (pattern.test(value)) return path;
  }
  return "";
};

// Representative packaged shipping weight per category, used for Google's
// shipping_weight attribute (the store charges flat-rate delivery, so weight
// is informational — it lets Merchant Center estimate shipping costs). Order
// matters: most-specific patterns first. Categories with no match fall back
// to a store-wide default.
const GOOGLE_WEIGHT_RULES = [
  [/hoodie|sweatshirt|crewneck|jacket|coat|outerwear|windbreaker/i, "0.8 kg"],
  [
    /trimmer|clipper|razor|tool/i,
    "0.6 kg",
  ],
  [
    /mug|ceramic|drinkware|tumbler/i,
    "0.6 kg",
  ],
  [
    /bag|backpack|tote/i,
    "0.5 kg",
  ],
  [
    /tee|t-?shirt|shirt|top|polo|pants|trousers|jeans|jogger|sweatpant|shorts|sock/i,
    "0.4 kg",
  ],
  [
    /beard|care|oil|balm|butter|groom|shav|moistur/i,
    "0.4 kg",
  ],
  [/cap|hat|beanie/i, "0.3 kg"],
  [/belt|scarf|shawl|glove|mitten/i, "0.3 kg"],
];
const DEFAULT_WEIGHT = "0.5 kg";

const mapGoogleWeight = (category) => {
  const value = String(category || "").trim();
  if (!value) return DEFAULT_WEIGHT;
  for (const [pattern, weight] of GOOGLE_WEIGHT_RULES) {
    if (pattern.test(value)) return weight;
  }
  return DEFAULT_WEIGHT;
};

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const db = env?.DB;
    if (!db) {
      // Never serve an empty feed (Google/Meta would remove every product) —
      // fail loudly so the fetch error surfaces in the merchant console.
      throw new Error("D1 binding (DB) is not configured");
    }

    // Self-healing schema, same as every other handler.
    await ensureSchema(env);

    const result = await db.prepare(
      `SELECT
         p.id,
         p.slug,
         p.name,
         p.description,
         p.price,
         p.category,
         p.weight,
         (SELECT pi.path
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.uploaded_at DESC
          LIMIT 1) AS image_path,
         COALESCE(
           (SELECT SUM(i.stock) FROM inventory i WHERE i.product_id = p.id),
           (SELECT SUM(v.stock) FROM product_variants v WHERE v.product_id = p.id),
           0
         ) AS total_stock
       FROM products p
       WHERE p.active = 1
       ORDER BY p.created_at DESC;`,
    ).all();

    const products = result?.results || [];
    const site = getSiteUrl(env);
    const r2PublicUrl = getR2PublicUrl(env);
    const shippingPrice = formatGooglePrice(SHIPPING.price);

    const items = [];
    for (const product of products) {
      const id = product.id;
      const title = product.name;
      const formattedPrice = formatGooglePrice(product.price);
      const link = `${site}/product/${product.slug || product.id}`;
      const imageUrl = buildImageUrl(
        product.image_path,
        r2PublicUrl,
        site,
      );
      const googleCategory = mapGoogleCategory(product.category);
      // Per-product weight wins when the admin has set one; otherwise fall
      // back to the category-based default.
      const shippingWeight =
        formatDbWeight(product.weight) || mapGoogleWeight(product.category);

      // Refuse to emit items that would generate guaranteed Google errors
      // (missing id/title/price, or a broken image_link) — log loudly instead
      // of shipping broken data. All other deviations are logged below.
      if (!id || !title || !formattedPrice || !imageUrl) {
        console.error(
          `[feed] skipping product ${id || "(no id)"}: missing required feed data ` +
            `(price=${formattedPrice ?? "null"}, image=${imageUrl ? "present" : "MISSING"})`,
        );
        continue;
      }

      const item = {
        id,
        title,
        link,
        image_link: imageUrl,
        price: formattedPrice,
        availability: formatAvailability(product.total_stock),
        shipping: { ...SHIPPING, price: shippingPrice },
        shipping_weight: shippingWeight,
      };

      // Validation layer: log every deviation with id, field, and value so
      // source-data problems surface in Cloudflare logs.
      for (const { field, value, problem } of validateGoogleProduct(item)) {
        console.warn(`[feed] product ${item.id} — ${field}: ${problem} (value: ${value})`);
      }

      items.push(`    <item>
      <g:id>${xmlEscape(item.id)}</g:id>
      <title>${xmlEscape(item.title)}</title>
      <g:description>${xmlEscape(product.description)}</g:description>
      <link>${xmlEscape(item.link)}</link>
      <g:image_link>${xmlEscape(item.image_link)}</g:image_link>${googleCategory ? `\n      <g:google_product_category>${xmlEscape(googleCategory)}</g:google_product_category>` : ""}
      <g:condition>new</g:condition>
      <g:availability>${item.availability}</g:availability>
      <g:identifier_exists>false</g:identifier_exists>
      <g:price>${item.price}</g:price>
      <g:shipping_weight>${item.shipping_weight}</g:shipping_weight>
      <g:brand>${xmlEscape(BRAND)}</g:brand>
      <g:shipping>
        <g:country>${SHIPPING.country}</g:country>
        <g:service>${xmlEscape(SHIPPING.service)}</g:service>
        <g:price>${item.shipping.price}</g:price>
      </g:shipping>
    </item>`);
    }

    const fullXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(BRAND)} Live Product Feed</title>
    <link>${xmlEscape(site)}</link>
    <description>Dynamic product sync for Google &amp; Meta</description>
${items.join("\n")}
  </channel>
</rss>
`;

    return new Response(fullXml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    // Return 500 (not an empty feed) so Google/Meta keep their last good
    // fetch and report a fetch error instead of removing every product.
    return new Response(`Error generating feed: ${error.message}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
