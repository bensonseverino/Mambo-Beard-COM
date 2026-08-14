// Edge SEO metadata builders.
//
// Mirrors src/utils/seo.js so the initial HTML served by the edge and the
// client-side react-helmet-async output agree. Identical tag content lets
// Helmet ADOPT the edge-injected tags in place (it matches DOM nodes by
// data-rh + isEqualNode) instead of duplicating them after hydration.
//
// All functions here are pure — no Workers runtime APIs — so they are
// directly unit-testable in Node.

import { getProductBySlug, listActiveProducts } from "./product.js";

// ─────────────────────────────────────────────────────────────
// CONSTANTS (keep in sync with src/utils/seo.js)
// ─────────────────────────────────────────────────────────────

export const BRAND = "Mambo Beard";
export const CURRENCY = "KES";
export const DEFAULT_TITLE = "Mambo Beard | Premium Kenyan Streetwear";
export const DEFAULT_DESCRIPTION =
  "Shop premium Kenyan streetwear drops from Mambo Beard — limited releases, exclusive designs and members-only offers.";
export const NOT_FOUND_TITLE = "Product Not Found | Mambo Beard";
export const TERMS_TITLE = "Terms of Service | Mambo Beard";
export const TERMS_DESCRIPTION =
  "Mambo Beard Club terms of service — rules for using our website, placing orders, shipping, returns, and more.";
export const PRIVACY_TITLE = "Privacy Policy | Mambo Beard";
export const PRIVACY_DESCRIPTION =
  "Mambo Beard Club privacy policy — what we collect, how we use your data, your rights, and our SMS/email marketing terms.";

/** Cache TTLs (seconds) per page type — home 5 min, product/collection 10 min. */
export const TTL = {
  home: 300,
  product: 600,
  collection: 600,
  static: 300,
  default: 300,
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const escapeAttr = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

const truncate = (text, max = 160) => {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
};

export const productTitle = (name) => `${name} | ${BRAND}`;

export const productDescription = (description, name) =>
  truncate(
    description ||
      `Shop the ${name} by ${BRAND}. Limited drops, premium quality.`,
  );

/** Build an absolute URL for an R2 image path (same rule as src/services/api.js). */
export const buildImageUrl = (path, r2PublicUrl, siteUrl) => {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  const base = (r2PublicUrl || siteUrl || "").replace(/\/$/, "");
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${clean}`;
};

export const canonicalUrl = (siteUrl, path = "/") => {
  const base = (siteUrl || "").replace(/\/$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
};

/**
 * Featured image → first gallery image → brand default. Never empty.
 * Returns { image, url } where `image` is the raw image object (for alt text).
 */
export const pickProductImageMeta = (product, r2PublicUrl, siteUrl) => {
  const images = product?.images || [];
  const image = images.find((img) => img.isPrimary) || images[0] || null;
  const raw = image?.path || product?.thumbnail;
  const url = raw
    ? buildImageUrl(raw, r2PublicUrl, siteUrl)
    : `${siteUrl}/hero.png`;
  return { image, url };
};

export const productImageAlt = (product, image) => {
  let color = image?.colorName;
  if (!color && image?.colorId && product?.colors) {
    color = product.colors.find((entry) => entry.id === image.colorId)?.name;
  }
  color = color || product?.colors?.[0]?.name;
  return [BRAND, product?.name, color, image?.type]
    .filter(Boolean)
    .join(" ");
};

// ─────────────────────────────────────────────────────────────
// JSON-LD (identical shapes to src/utils/seo.js)
// ─────────────────────────────────────────────────────────────

export const organizationJsonLd = (siteUrl) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND,
  url: canonicalUrl(siteUrl, "/"),
  logo: canonicalUrl(siteUrl, "/hero.png"),
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    email: "mambobeardclub@gmail.com",
    areaServed: "KE",
  },
});

export const websiteJsonLd = (siteUrl) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: BRAND,
  url: canonicalUrl(siteUrl, "/"),
  inLanguage: "en",
  publisher: {
    "@type": "Organization",
    name: BRAND,
    logo: canonicalUrl(siteUrl, "/hero.png"),
  },
});

export const productJsonLd = (product, slug, siteUrl, r2PublicUrl) => {
  const url = canonicalUrl(
    siteUrl,
    `/product/${slug || product.slug || product.id}`,
  );
  const images = [
    ...new Set(
      (product.images || [])
        .map((img) => buildImageUrl(img.path, r2PublicUrl, siteUrl))
        .filter(Boolean),
    ),
  ];
  if (!images.length) {
    images.push(pickProductImageMeta(product, r2PublicUrl, siteUrl).url);
  }

  // Simple products carry a single stock figure; everything else sums the
  // variant rows (color-only, size-only, color_size).
  const totalStock =
    product.variationType === "none"
      ? Number(product.stock) || 0
      : (product.variants || []).reduce(
          (sum, variant) => sum + Number(variant.stock || 0),
          0,
        );

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: productDescription(product.description, product.name),
    image: images,
    url,
    sku: product.id,
    brand: { "@type": "Brand", name: BRAND },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: CURRENCY,
      price: Number(product.price),
      itemCondition: "https://schema.org/NewCondition",
      availability:
        totalStock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };
  if (product.category) schema.category = product.category;
  return schema;
};

export const breadcrumbJsonLd = (items, siteUrl) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: canonicalUrl(siteUrl, item.path),
  })),
});

export const collectionJsonLd = (name, path, products, siteUrl) => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name,
  url: canonicalUrl(siteUrl, path),
  mainEntity: {
    "@type": "ItemList",
    itemListElement: (products || []).map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.name,
      url: canonicalUrl(siteUrl, `/product/${product.slug || product.id}`),
    })),
  },
});

// ─────────────────────────────────────────────────────────────
// HEAD TAG GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * Serialize a JSON-LD object exactly as the frontend does (compact JSON with
 * `<` escaped to \u003c so `</script>` can never leak).
 */
const jsonLdScript = (object) =>
  `<script type="application/ld+json" data-rh="true">${JSON.stringify(
    object,
  ).replace(/</g, "\\u003c")}</script>`;

/**
 * Build the HTML fragment appended inside <head> by HTMLRewriter.
 * The tag set mirrors src/components/SEO.jsx; every tag carries data-rh="true"
 * so react-helmet-async adopts (rather than duplicates) them after hydration.
 */
export const buildHeadHtml = ({
  title,
  description,
  canonical,
  type = "website",
  image,
  imageAlt,
  jsonLd = [],
  noindex = false,
  preload,
}) => {
  const ogType = type === "product" ? "product" : "website";
  const tags = [];

  if (description) {
    tags.push(
      `<meta name="description" content="${escapeAttr(
        description,
      )}" data-rh="true">`,
    );
  }
  tags.push(`<link rel="canonical" href="${escapeAttr(canonical)}" data-rh="true">`);
  tags.push(`<meta property="og:site_name" content="${escapeAttr(BRAND)}" data-rh="true">`);
  tags.push(`<meta property="og:type" content="${escapeAttr(ogType)}" data-rh="true">`);
  tags.push(`<meta property="og:url" content="${escapeAttr(canonical)}" data-rh="true">`);
  tags.push(`<meta property="og:title" content="${escapeAttr(title)}" data-rh="true">`);
  if (description) {
    tags.push(
      `<meta property="og:description" content="${escapeAttr(
        description,
      )}" data-rh="true">`,
    );
  }
  if (image) {
    tags.push(
      `<meta property="og:image" content="${escapeAttr(image)}" data-rh="true">`,
    );
    if (imageAlt) {
      tags.push(
        `<meta property="og:image:alt" content="${escapeAttr(
          imageAlt,
        )}" data-rh="true">`,
      );
    }
  }
  tags.push(`<meta name="twitter:card" content="summary_large_image" data-rh="true">`);
  tags.push(`<meta name="twitter:title" content="${escapeAttr(title)}" data-rh="true">`);
  if (description) {
    tags.push(
      `<meta name="twitter:description" content="${escapeAttr(
        description,
      )}" data-rh="true">`,
    );
  }
  if (image) {
    tags.push(
      `<meta name="twitter:image" content="${escapeAttr(image)}" data-rh="true">`,
    );
  }
  if (noindex) {
    tags.push(
      `<meta name="robots" content="noindex, nofollow" data-rh="true">`,
    );
  }
  for (const object of jsonLd) {
    tags.push(jsonLdScript(object));
  }
  if (preload) {
    tags.push(
      `<link rel="preload" as="image" href="${escapeAttr(
        preload,
      )}" data-rh="true">`,
    );
  }
  return tags.join("\n    ");
};

// ─────────────────────────────────────────────────────────────
// PAGE RESOLUTION
// ─────────────────────────────────────────────────────────────

const maxUpdatedAt = (products) => {
  let max = "";
  for (const product of products || []) {
    if (product.updated_at && product.updated_at > max) {
      max = product.updated_at;
    }
  }
  return max || "0";
};

const defaultPageSeo = (siteUrl, path) => ({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  canonical: canonicalUrl(siteUrl, path),
  type: "website",
  image: canonicalUrl(siteUrl, "/hero.png"),
  imageAlt: "",
  jsonLd: [organizationJsonLd(siteUrl), websiteJsonLd(siteUrl)],
  noindex: false,
  status: 200,
  ttl: TTL.default,
  version: "0",
  preload: "",
});

/**
 * Resolve the SEO payload for a request path.
 *
 * Returns everything the middleware needs: title, description, canonical,
 * OG/Twitter image, JSON-LD array, noindex flag, HTTP status, cache TTL and a
 * freshness version (product updated_at — so admin edits invalidate the edge
 * cache key instantly with no manual purge).
 */
export async function buildSeoForPath(path, env, origin) {
  const siteUrl = (env?.SITE_URL || origin || "").replace(/\/$/, "");
  // Accept the runtime var (R2_PUBLIC_URL) or the build-time var that wrangler
  // exposes to Functions from .env (VITE_R2_PUBLIC_URL).
  const r2PublicUrl = (env?.R2_PUBLIC_URL || env?.VITE_R2_PUBLIC_URL || "").replace(
    /\/$/,
    "",
  );

  // ── Product: /product/:slug  or  /products/:slug ──────────
  const productMatch = path.match(/^\/products?\/([^/]+)\/?$/);
  if (productMatch) {
    let product = null;
    try {
      product = await getProductBySlug(env, decodeURIComponent(productMatch[1]));
    } catch (error) {
      console.error("[edge-seo] product lookup failed:", error?.message || error);
    }

    if (!product) {
      // Unpublished/deleted/unknown — noindex + 404, SPA still renders.
      return {
        ...defaultPageSeo(siteUrl, path),
        title: NOT_FOUND_TITLE,
        description: "The product you are looking for does not exist.",
        noindex: true,
        status: 404,
        ttl: TTL.static,
        version: "404",
      };
    }

    const slug = product.slug;
    const url = canonicalUrl(siteUrl, `/product/${slug}`);
    const { image, url: ogImage } = pickProductImageMeta(
      product,
      r2PublicUrl,
      siteUrl,
    );
    // First gallery image (same ordering the client gallery uses).
    const gallery = [...(product.images || [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const preload = gallery[0]?.path
      ? buildImageUrl(gallery[0].path, r2PublicUrl, siteUrl)
      : "";

    return {
      title: productTitle(product.name),
      description: productDescription(product.description, product.name),
      canonical: url,
      type: "product",
      image: ogImage,
      imageAlt: productImageAlt(product, image),
      jsonLd: [
        organizationJsonLd(siteUrl),
        websiteJsonLd(siteUrl),
        productJsonLd(product, slug, siteUrl, r2PublicUrl),
        breadcrumbJsonLd(
          [
            { name: "Home", path: "/" },
            { name: product.name, path: `/product/${slug}` },
          ],
          siteUrl,
        ),
      ],
      noindex: false,
      status: 200,
      ttl: TTL.product,
      version: product.updated_at || "0",
      preload,
    };
  }

  // ── Collection: /collections/:name ─────────────────────────
  const collectionMatch = path.match(/^\/collections\/([^/]+)\/?$/);
  if (collectionMatch) {
    const name = decodeURIComponent(collectionMatch[1]);
    const displayName = name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    let products = [];
    try {
      products = await listActiveProducts(env, { category: name });
    } catch (error) {
      console.error("[edge-seo] collection lookup failed:", error?.message || error);
    }
    return {
      ...defaultPageSeo(siteUrl, path),
      title: productTitle(displayName),
      description: truncate(
        `Shop the ${displayName} collection by ${BRAND} — limited drops, premium quality.`,
      ),
      jsonLd: [
        organizationJsonLd(siteUrl),
        websiteJsonLd(siteUrl),
        collectionJsonLd(displayName, path, products, siteUrl),
      ],
      ttl: TTL.collection,
      version: maxUpdatedAt(products),
    };
  }

  // ── Static pages ───────────────────────────────────────────
  if (path === "/terms") {
    return {
      ...defaultPageSeo(siteUrl, path),
      title: TERMS_TITLE,
      description: TERMS_DESCRIPTION,
      ttl: TTL.static,
    };
  }
  if (path === "/privacy") {
    return {
      ...defaultPageSeo(siteUrl, path),
      title: PRIVACY_TITLE,
      description: PRIVACY_DESCRIPTION,
      ttl: TTL.static,
    };
  }

  // ── Homepage ───────────────────────────────────────────────
  if (path === "/") {
    let products = [];
    try {
      products = await listActiveProducts(env);
    } catch (error) {
      console.error("[edge-seo] homepage lookup failed:", error?.message || error);
    }
    return {
      ...defaultPageSeo(siteUrl, path),
      image: canonicalUrl(siteUrl, "/hero.png"),
      jsonLd: [
        organizationJsonLd(siteUrl),
        websiteJsonLd(siteUrl),
        ...(products.length
          ? [collectionJsonLd("All Products", "/", products, siteUrl)]
          : []),
      ],
      ttl: TTL.home,
      version: maxUpdatedAt(products),
    };
  }

  // ── Any other SPA route (cart/checkout/future pages) ───────
  return defaultPageSeo(siteUrl, path);
}
