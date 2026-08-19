// utils/pixel.js
//
// Meta Pixel tracking was removed to reduce HTTP requests.
// These functions are kept as no-ops to avoid breaking imports.

/** No-op: PageView tracking removed. */
export const trackPageView = () => {};

/** No-op: AddToCart tracking removed. */
export const trackAddToCart = () => {};

/** No-op: Purchase tracking removed. */
export const trackPurchase = () => {};
