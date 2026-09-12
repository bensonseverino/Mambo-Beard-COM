const API_BASE = import.meta.env.VITE_API_BASE || "";

// Same-origin path that serves product images from R2. The /products proxy
// (functions/products/[[path]].js) understands `?w=NNN` and serves the
// pre-generated resized variant at that width when one exists, with a
// 1-year immutable edge cache. Serving images here — instead of from the
// raw r2.dev subdomain — is what makes responsive sizes actually work:
// r2.dev always returns the untouched original (400–500KiB per photo).
const PRODUCT_IMAGE_BASE = `${API_BASE}/products`;

// ─────────────────────────────────────────────────────────────
// IMAGE URL BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Constructs a full image URL from an R2 object path.
 *
 * Relative object keys ("products/…" or "ts-01/…", as stored in
 * product_images.path) are served through the same-origin /products proxy so
 * `?w=` resized variants and its long edge cache apply. Absolute URLs are
 * returned untouched (they are already hosted somewhere final).
 *
 * @param {string} path — R2 object key, e.g. "products/distorted-future/black/front.webp"
 * @param {number} [width] — request a resized variant of this width
 * @returns {string} Full URL, e.g. "/products/distorted-future/black/front.webp?w=640"
 */
export const buildImageUrl = (path, width) => {
  if (!path) return "";
  // Already a full URL — nothing to route through the proxy.
  if (/^https?:\/\//.test(path)) return path;
  let cleanPath = path.startsWith("/") ? path.slice(1) : path;
  // The proxy route itself supplies the products/ prefix; DB keys usually
  // carry it too ("products/ts-01/…"), so strip it to avoid /products/products/.
  if (cleanPath.startsWith("products/")) cleanPath = cleanPath.slice("products/".length);
  const url = `${PRODUCT_IMAGE_BASE}/${cleanPath}`;
  return width ? `${url}?w=${width}` : url;
};

/** Widths offered to the browser for responsive product images. */
export const IMAGE_WIDTHS = [240, 400, 640, 960, 1280];

/**
 * Build a `srcset` string of `?w=` variants for a product image path.
 *
 * Only same-origin (R2 proxy) URLs get variants — external CDN URLs return
 * "" so the browser falls back to the plain `src` (no resizing possible).
 *
 * @param {string} path — R2 object key or absolute image URL
 * @param {number[]} [widths] — widths to offer, in ascending order
 * @returns {string} srcset string, or "" when no variants apply
 */
export const buildImageSrcSet = (path, widths = IMAGE_WIDTHS) => {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return "";
  // GIFs must be served as-is to preserve animation — resized WebP
  // variants would flatten them to a single static frame.
  if (/\.gif$/i.test(path)) return "";
  const src = buildImageUrl(path);
  return widths.map((w) => `${src}?w=${w} ${w}w`).join(", ");
};

// ─────────────────────────────────────────────────────────────
// RESPONSE HANDLER
// ─────────────────────────────────────────────────────────────

const handleJson = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "API request failed");
  }
  return data;
};

// ─────────────────────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all published products with optional filters.
 * @param {Object} [filters]
 * @param {string} [filters.category]
 * @param {string} [filters.featured] — "1" to filter featured
 * @param {string} [filters.search]
 * @param {string} [filters.sort] — "newest" | "price_asc" | "price_desc" | "featured"
 */
export const getProducts = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.featured) params.set("featured", filters.featured);
  if (filters.search) params.set("search", filters.search);
  if (filters.sort) params.set("sort", filters.sort);

  const qs = params.toString();
  const url = `${API_BASE}/api/products${qs ? `?${qs}` : ""}`;
  const response = await fetch(url);
  const data = await handleJson(response);
  return data.products || [];
};

/**
 * Fetch a single product by slug (or id).
 */
export const getProduct = async (slug) => {
  const response = await fetch(`${API_BASE}/api/products/${slug}`);
  const data = await handleJson(response);
  return data.product;
};

// ─────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────

export const getInventory = async (productId) => {
  const response = await fetch(`${API_BASE}/api/inventory/${productId}`);
  const data = await handleJson(response);
  return data.inventory || [];
};

// ─────────────────────────────────────────────────────────────
// CHECKOUT
// ─────────────────────────────────────────────────────────────

export const createCheckout = async (payload) => {
  const response = await fetch(`${API_BASE}/api/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleJson(response);
};

// ─────────────────────────────────────────────────────────────
// CATEGORIES & COLORS (for dynamic filters)
// ─────────────────────────────────────────────────────────────

export const getCategories = async () => {
  const response = await fetch(`${API_BASE}/api/categories`);
  const data = await handleJson(response);
  return data.categories || [];
};

export const getColors = async () => {
  const response = await fetch(`${API_BASE}/api/colors`);
  const data = await handleJson(response);
  return data.colors || [];
};

// ─────────────────────────────────────────────────────────────
// RELATED PRODUCTS
// ─────────────────────────────────────────────────────────────

/**
 * Fetch related products by category, excluding the current product.
 */
export const getRelatedProducts = async (currentProductId, category) => {
  const all = await getProducts({ category });
  return all.filter((p) => p.id !== currentProductId);
};
