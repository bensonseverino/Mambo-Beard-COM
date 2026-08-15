// utils/pixel.js
//
// Minimal Meta Pixel (facebook-pixel) helpers for the SPA.
//
// The base snippet in index.html loads fbevents.js and initializes fbq; the
// snippet defines window.fbq synchronously (with an internal queue), so any
// event fired here before the script finishes loading is queued and sent
// later. All helpers are defensive no-ops when the pixel is unavailable
// (ad blocker, local dev, prerender).
//
// PageView is intentionally NOT fired from index.html — the router fires it
// once per route change (see PageViewTracker in App.jsx) so the initial view
// and every client-side navigation each count exactly once.

import { CURRENCY } from "./seo";

const canTrack = () =>
  typeof window !== "undefined" && typeof window.fbq === "function";

const track = (event, params) => {
  if (!canTrack()) return;
  window.fbq("track", event, params);
};

/** Fire a PageView for the current route. */
export const trackPageView = (path) =>
  track("PageView", { page: path || "/" });

/**
 * Fire AddToCart. `productId` matches the feed's <g:id>, so Meta can attach
 * the event to the matching catalog item.
 */
export const trackAddToCart = ({ productId, name, price, quantity = 1 }) =>
  track("AddToCart", {
    content_ids: [productId],
    content_name: name,
    content_type: "product",
    value: Number(price) * quantity,
    currency: CURRENCY,
  });

/** Fire Purchase once an order is successfully placed. */
export const trackPurchase = ({ value, contents = [] }) =>
  track("Purchase", {
    value: Number(value) || 0,
    currency: CURRENCY,
    contents,
    content_type: "product",
  });
