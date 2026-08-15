const API_BASE = import.meta.env.VITE_API_BASE || "";
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || "";

// ─────────────────────────────────────────────────────────────
// IMAGE URL BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Constructs a full image URL from an R2 object path.
 * Works with any public R2 URL or custom CDN domain.
 *
 * @param {string} path — R2 object key, e.g. "products/distorted-future/black/front.webp"
 * @returns {string} Full URL, e.g. "https://cdn.mambobeard.store/products/distorted-future/black/front.webp"
 */
export const buildImageUrl = (path) => {
  if (!path) return "";
  // If the path is already a full URL, return as-is
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  // Strip leading slash if present
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrl = R2_PUBLIC_URL.endsWith("/")
    ? R2_PUBLIC_URL.slice(0, -1)
    : R2_PUBLIC_URL;
  return `${baseUrl}/${cleanPath}`;
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
