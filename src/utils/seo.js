// Centralized SEO helpers for the Mambo Beard storefront.
//
// Everything is derived from live backend product data — never hardcoded —
// so new/updated/unpublished/deleted products instantly change titles,
// descriptions, canonical URLs, social cards, structured data, and
// availability without a redeploy.
//
// All helpers are side-effect free and safe for future SSR / prerendering
// (they guard against a missing `window`).

import { buildImageUrl } from "../services/api";

export const BRAND = "Mambo Beard";
export const CURRENCY = "KES";
export const DEFAULT_TITLE = "Mambo Beard | Premium Kenyan Streetwear";
export const DEFAULT_DESCRIPTION =
  "Shop premium Kenyan streetwear drops from Mambo Beard — limited releases, exclusive designs and members-only offers.";
export const NOT_FOUND_TITLE = "Product Not Found | Mambo Beard";

/** Absolute site origin: env override, else the live origin (SSR-safe). */
export const getSiteUrl = () =>
  import.meta.env.VITE_SITE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

/** Build an absolute canonical URL from a path. */
export const canonicalUrl = (path = "/") => {
  const base = getSiteUrl().replace(/\/$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
};

/** Brand fallback image used when a product has no photos. Never empty.
 * Served from /hero.png (public/) so the client and the edge middleware
 * always agree on the absolute URL. */
export const brandDefaultImage = () => canonicalUrl("/hero.png");

const truncate = (text, max = 160) => {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
};

export const productTitle = (product) => `${product.name} | ${BRAND}`;

export const productDescription = (product) =>
  truncate(
    product.description ||
      `Shop the ${product.name} by ${BRAND}. Limited drops, premium quality.`,
  );

/** Image URL + the raw image object (for alt text). */
export const pickProductImageMeta = (product) => {
  const images = product?.images || [];
  const image = images.find((img) => img.isPrimary) || images[0] || null;
  const raw = image?.path || product?.thumbnail;
  const built = raw ? buildImageUrl(raw) : "";
  return { image, url: built || brandDefaultImage() };
};

/**
 * Featured image → first gallery image → brand default.
 * Returns an absolute image URL.
 */
export const pickProductImage = (product) => pickProductImageMeta(product).url;

/**
 * Descriptive alt text, e.g. "Mambo Beard Distorted Hoodie Black Front".
 * Resolves the image's color by colorId (images carry colorId, not name).
 */
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
// JSON-LD STRUCTURED DATA
// ─────────────────────────────────────────────────────────────

export const organizationJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND,
  url: canonicalUrl("/"),
  logo: brandDefaultImage(),
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    email: "mambobeardclub@gmail.com",
    areaServed: "KE",
  },
});

export const websiteJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: BRAND,
  url: canonicalUrl("/"),
  inLanguage: "en",
  publisher: {
    "@type": "Organization",
    name: BRAND,
    logo: brandDefaultImage(),
  },
});

/**
 * Product schema with live inventory availability.
 * availability reflects the sum of variant stock at render time.
 */
export const productJsonLd = (product, slug) => {
  const url = canonicalUrl(`/product/${slug || product.slug || product.id}`);
  const images = [
    ...new Set(
      (product.images || [])
        .map((img) => buildImageUrl(img.path))
        .filter(Boolean),
    ),
  ];
  if (!images.length) images.push(pickProductImage(product));

  const totalStock = (product.variants || []).reduce(
    (sum, variant) => sum + Number(variant.stock || 0),
    0,
  );

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: productDescription(product),
    image: images,
    url,
    sku: product.id,
    brand: { "@type": "Brand", name: BRAND },
    category: product.category || undefined,
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
};

export const breadcrumbJsonLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: canonicalUrl(item.path),
  })),
});

/** CollectionPage + ItemList for the homepage grid (backend-driven). */
export const collectionJsonLd = (name, path, products) => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name,
  url: canonicalUrl(path),
  mainEntity: {
    "@type": "ItemList",
    itemListElement: (products || []).map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.name,
      url: canonicalUrl(`/product/${product.slug || product.id}`),
    })),
  },
});
