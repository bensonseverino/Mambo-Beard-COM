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

    const items = products
      .map((product) => {
        const availability =
          Number(product.total_stock) > 0 ? "in stock" : "out of stock";
        const formattedPrice = `${Number(product.price).toFixed(2)} ${
          CURRENCY || "USD"
        }`;
        const link = `${site}/product/${product.slug || product.id}`;
        const imageUrl = buildImageUrl(
          product.image_path,
          r2PublicUrl,
          site,
        );

        const googleCategory = mapGoogleCategory(product.category);

        return `    <item>
      <g:id>${xmlEscape(product.id)}</g:id>
      <title>${xmlEscape(product.name)}</title>
      <g:description>${xmlEscape(product.description)}</g:description>
      <link>${xmlEscape(link)}</link>${imageUrl ? `\n      <g:image_link>${xmlEscape(imageUrl)}</g:image_link>` : ""}${googleCategory ? `\n      <g:google_product_category>${xmlEscape(googleCategory)}</g:google_product_category>` : ""}
      <g:condition>new</g:condition>
      <g:availability>${availability}</g:availability>
      <g:identifier_exists>false</g:identifier_exists>
      <g:price>${formattedPrice}</g:price>
      <g:brand>${xmlEscape(BRAND)}</g:brand>
    </item>`;
      })
      .join("\n");

    const fullXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(BRAND)} Live Product Feed</title>
    <link>${xmlEscape(site)}</link>
    <description>Dynamic product sync for Google &amp; Meta</description>
${items}
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
