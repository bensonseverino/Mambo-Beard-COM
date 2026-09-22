// utils/fbCheckout.js
//
// Facebook / Instagram Shop checkout deep links (Meta's "checkout URL"
// spec — developers.facebook.com/documentation/ads-commerce/
// commerce-platform/setup-checkout-url).
//
// When a shopper taps "Checkout" in a Meta shop, Meta sends them to the
// store's configured checkout URL with:
//   products    = <catalogId>:<qty>,<catalogId>:<qty>  (escaped %3A / %2C)
//   coupon      = optional single promo code
//   cart_origin = facebook | instagram | meta_shops
//   + utm_* / fbclid tracking parameters
//
// The catalog ids are the store's own product ids — the exact values the
// product feed (functions/feeds/products.xml.js) emits as <g:id>, and the
// same ids the Meta Pixel events use.

export const OPEN_CART_EVENT = "mb:open-cart";
export const CART_ORIGIN_STORAGE_KEY = "mb_cart_origin";

// Sanity clamp for a single line — Meta's validation tool and bots can send
// arbitrary quantities, and an unclamped 1e9 would poison the cart UI.
const MAX_QTY_PER_LINE = 99;

/**
 * Parse the query string Meta appends to the checkout URL.
 *
 * Defensive by design: malformed entries are skipped and reported, never
 * thrown, so one bad id can't block the rest of the cart.
 *
 * @param {string} [search] — the location.search string
 * @returns {{
 *   entries: { productId: string, quantity: number }[],
 *   invalid: string[],
 *   coupon: string | null,
 *   cartOrigin: string | null,
 *   utm: Record<string, string>,
 *   hasCartPayload: boolean,
 * }}
 */
export const parseFbCheckoutUrl = (search) => {
  const params = new URLSearchParams(search || "");
  const productsRaw = (params.get("products") || "").trim();

  const entries = [];
  const invalid = [];
  const merged = new Map();

  for (const rawEntry of productsRaw.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const parts = entry.split(":");
    const productId = (parts[0] || "").trim();
    const qty = (parts[1] || "").trim();
    // Meta's spec: exactly "id:qty" — ids containing : or , are unsupported.
    if (parts.length !== 2 || !productId || !/^\d+$/.test(qty)) {
      invalid.push(entry);
      continue;
    }
    // Merge repeated ids (Meta dedupes, but never trust the wire) and clamp.
    const quantity = Math.min(Math.max(parseInt(qty, 10), 1), MAX_QTY_PER_LINE);
    merged.set(productId, Math.min((merged.get(productId) || 0) + quantity, MAX_QTY_PER_LINE));
  }
  for (const [productId, quantity] of merged) entries.push({ productId, quantity });

  const coupon = (params.get("coupon") || "").trim() || null;
  const cartOrigin = (params.get("cart_origin") || "").trim() || null;

  const utm = {};
  for (const [key, value] of params) {
    if (/^utm_[a-z]+$/.test(key) && value) utm[key] = value;
  }

  return {
    entries,
    invalid,
    coupon,
    cartOrigin,
    utm,
    hasCartPayload: entries.length > 0,
  };
};

/**
 * Turn a product payload (GET /api/products/:id shape) into a cart item for
 * the deep link. Meta's cart carries only ids and quantities — no variations
 * — so the first available color/size is pre-selected; shoppers can adjust
 * in the cart drawer before completing checkout.
 *
 * Returns { item, missingSelection } — missingSelection is true when the
 * product requires a variation the catalog no longer offers (the line is
 * skipped and reported instead of producing an item checkout would reject).
 */
export const buildFbCartItem = ({ product, quantity }) => {
  const variationType = product.variationType || "none";
  const wantsColor = variationType === "color" || variationType === "color_size";
  const wantsSize = variationType === "size" || variationType === "color_size";

  const color = wantsColor ? product.colors?.[0] || null : null;
  const size = wantsSize ? product.sizes?.[0] || null : null;

  const missingSelection =
    (wantsColor && !color) || (wantsSize && !size);

  const thumbPath =
    product.thumbnail ||
    (Array.isArray(product.image) ? product.image[0] : product.image) ||
    "";

  const item = {
    // Same composite key buildCartItem uses, so drawer quantity edits work.
    id:
      variationType === "none"
        ? product.id
        : `${product.id}-${color?.id || "nc"}-${size?.id || "ns"}`,
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity,
    variationType,
    selectedColor: color?.name || null,
    selectedColorId: color?.id || null,
    selectedSize: size?.name || null,
    selectedSizeId: size?.id || null,
    image: thumbPath,
  };

  return { item, missingSelection };
};
