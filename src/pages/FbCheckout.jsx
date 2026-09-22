// pages/FbCheckout.jsx
//
// Meta Shops checkout endpoint — https://mambobeard.store/checkout
//
// When a shopper taps "Checkout" inside a Facebook or Instagram shop, Meta
// redirects here with the cart contents in the query string:
//
//   /checkout?products=<id>:<qty>%2C<id>:<qty>&coupon=PROMO10&cart_origin=instagram
//
// (ids and quantities are the store's own product ids — the feed's <g:id>
// values — and the params are RFC 3986 escaped by Meta.)
//
// Per Meta's checkout-URL spec, this page must:
//   1. Clear any existing cart (so a stale session never leaks into the
//      shop checkout) — best practice #1, "Clear the cart (if needed)".
//   2. Add the listed products with the given quantities — skipped with a
//      visible notice when a product is unpublished, out of stock, or
//      missing a variation the catalog no longer offers (best practice #5).
//   3. Keep the coupon with the order — it rides along to /api/checkout and
//      the WhatsApp confirmation so the discount request isn't lost.
//   4. Show the checkout (the cart drawer) with correct ids, quantities and
//      prices, plus the tracking params on the URL for the pixel.
//
// The page itself renders almost nothing: a spinner while the catalog is
// fetched, then an auto-dismissing status summary. The cart drawer does the
// rest — guest checkout, delivery zone, WhatsApp confirmation, all existing
// behavior untouched.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { getProduct } from "../services/api";
import { trackInitiateCheckout } from "../utils/pixel";
import {
  OPEN_CART_EVENT,
  CART_ORIGIN_STORAGE_KEY,
  parseFbCheckoutUrl,
  buildFbCartItem,
} from "../utils/fbCheckout";

const FbCheckout = () => {
  const { search } = useLocation();
  const { replaceCart, cart } = useCart();

  const [status, setStatus] = useState("loading"); // loading | ready | partial | error
  const [problems, setProblems] = useState([]);
  // One-shot guard: React StrictMode mounts effects twice in dev — without
  // this the cart would be rebuilt (and cleared) on the second pass too.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const parsed = parseFbCheckoutUrl(search);

    const run = async () => {
      if (!parsed.hasCartPayload) {
        // No products param — someone hit /checkout directly. Send them to
        // the storefront rather than a dead end.
        window.location.replace("/");
        return;
      }

      // Meta best practice #1: clear the cart on each call before adding.
      replaceCart([]);
      try {
        if (parsed.cartOrigin) {
          sessionStorage.setItem(CART_ORIGIN_STORAGE_KEY, parsed.cartOrigin);
        }
        if (parsed.coupon) {
          sessionStorage.setItem("mb_coupon", parsed.coupon);
        }
      } catch {
        /* storage disabled — attribution is best-effort */
      }

      const items = [];
      const problems = [];

      // Sequential fetches keep ordering stable (matches Meta's cart order);
      // a handful of lines never stack, and parallel bursts would just slow
      // the first paint on slow mobile connections.
      for (const { productId, quantity } of parsed.entries) {
        try {
          const product = await getProduct(productId);
          if (!product || product.active === false) {
            problems.push(`"${productId}" is no longer available.`);
            continue;
          }
          const { item, missingSelection } = buildFbCartItem({
            product,
            quantity,
          });
          if (missingSelection) {
            problems.push(
              `"${product.name}" needs a color or size choice — pick it in the cart.`,
            );
            continue;
          }
          items.push(item);
        } catch {
          problems.push(`"${productId}" could not be loaded.`);
        }
      }

      if (items.length === 0) {
        // Nothing made it in — error state, cart stays empty, shopper can
        // still browse the storefront from here.
        setStatus("error");
        setProblems(problems.length ? problems : ["Your shop cart is unavailable."]);
        return;
      }

      replaceCart(items);

      // Meta pixel — InitiateCheckout with the same content_ids contract as
      // AddToCart/Purchase (the feed's <g:id> values). utm_* / fbclid stay
      // on the URL for Meta's own attribution; cart_origin is preserved for
      // the order record.
      trackInitiateCheckout({
        contents: items.map((item) => ({
          id: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
        numItems: items.reduce((sum, item) => sum + item.quantity, 0),
      });

      setStatus(problems.length ? "partial" : "ready");
      setProblems(problems);

      // Reveal the checkout (cart drawer). Header listens for this event.
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT));
      }, 350);
    };

    run();
  }, [search, replaceCart]);

  // Safety net: if the drawer failed to open (event lost), a tap recovers.
  useEffect(() => {
    if (status === "ready" || status === "partial") {
      const fallback = setTimeout(() => {
        window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT));
      }, 1500);
      return () => clearTimeout(fallback);
    }
    return undefined;
  }, [status]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      {status === "loading" && (
        <p className="text-[10px] tracking-[0.3em] uppercase font-light text-black/50 mb-fade-in">
          Preparing your cart…
        </p>
      )}

      {status === "error" && (
        <div className="mb-fade-in">
          <p className="text-[11px] tracking-[0.25em] uppercase font-light text-black/70 mb-3">
            Cart unavailable
          </p>
          <ul className="text-xs text-black/50 space-y-1 mb-6">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <a
            href="/"
            className="inline-block border border-black/20 px-6 py-2 text-[10px] tracking-[0.28em] uppercase font-light text-black hover:border-black/60 transition-colors"
          >
            Continue shopping
          </a>
        </div>
      )}

      {(status === "ready" || status === "partial") && (
        <div className="mb-fade-in">
          <p className="text-[11px] tracking-[0.25em] uppercase font-light text-black/70 mb-2">
            {cart.length} item{cart.length === 1 ? "" : "s"} added from your shop cart
          </p>
          {problems.length > 0 && (
            <ul className="text-xs text-black/50 space-y-1 mt-3">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default FbCheckout;
