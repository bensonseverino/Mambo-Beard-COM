// components/CartDrawer.jsx

import { useEffect, useRef, useState } from "react";
import { useCart } from "../context/CartContext";
import { CART_ORIGIN_STORAGE_KEY } from "../utils/fbCheckout";
import useExitFade from "../hooks/useExitFade";
import { DELIVERY_ZONES, getDeliveryFee } from "../utils/deliveryFee";
import { createCheckout, lookupCoupon } from "../services/api";
import { buildWhatsAppUrl } from "../utils/whatsappMessage";
import { trackPurchase } from "../utils/pixel";

// The variation dimensions a cart item needs before checkout. Simple
// products need none of them.
const missingVariation = (item) => {
  const type = item.variationType || "color_size";
  if (type === "none") return !item.productId ? "product" : null;
  if (type === "color") return item.selectedColorId ? null : "color";
  if (type === "size") return item.selectedSize ? null : "size";
  return item.selectedColorId && item.selectedSize ? null : "color or size";
};

// Human-readable title, e.g. "Hoodie (Black, XXL)", "T-Shirt (XXL)",
// "Cap (Black)", or "Tote Bag" — never "(undefined, undefined)".
const itemTitle = (item) => {
  const parts = [item.selectedColor, item.selectedSize].filter(Boolean);
  return parts.length ? `${item.name} (${parts.join(", ")})` : item.name;
};

// Cart line item with a fade-in on mount and a fade-out when removed —
// the × click plays the exit transition first, and only then is the item
// actually removed from the cart (so React never unmounts it mid-fade).
function CartLine({ item, index, onRemove }) {
  const [removing, setRemoving] = useState(false);
  const { render, closing } = useExitFade(!removing);
  const removedRef = useRef(false);

  // The fade finished (render flipped false) — commit the real removal.
  useEffect(() => {
    if (removing && !render && !removedRef.current) {
      removedRef.current = true;
      onRemove(index);
    }
  }, [removing, render, index, onRemove]);

  if (!render) return null;

  return (
    <div
      className={`mb-fade-in mb-fade-swap flex gap-3 items-start text-sm mb-3 pb-3 border-b ${
        closing ? "is-closing" : ""
      }`}
    >
      <img
        src={item.image || ""}
        alt={item.name}
        className="w-16 h-16 object-cover rounded"
      />
      <div className="flex-1">
        <p className="font-medium">{itemTitle(item)}</p>
        <p className="text-gray-600">KES {item.price}</p>
      </div>
      <button
        onClick={() => setRemoving(true)}
        className="text-red-500 hover:text-red-700 font-bold"
      >
        ×
      </button>
    </div>
  );
}

// The "exact location" input shown only for the Other delivery zone —
// fades in when it mounts, fades out before it unmounts.
function ConditionalOtherInput({ visible, onChange }) {
  const { render, closing } = useExitFade(visible);

  if (!render) return null;

  return (
    <input
      placeholder="Enter your exact location"
      className={`mb-fade-in mb-fade-swap w-full border p-2 ${
        closing ? "is-closing" : ""
      }`}
      onChange={onChange}
      autoFocus={false}
    />
  );
}

export default function CartDrawer({ open, toggle }) {
  const { cart, removeFromCart, clearCart } = useCart();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [loading, setLoading] = useState(false);

  // Meta Shops deep links (/checkout?coupon=…&cart_origin=…) stash both
  // values in sessionStorage before opening this drawer. The coupon is
  // state, not a constant, so the shopper can remove a deep-linked code
  // before ordering; it's validated (and discounted) server-side.
  const [couponCode, setCouponCode] = useState(() => {
    try {
      return sessionStorage.getItem("mb_coupon") || "";
    } catch {
      return "";
    }
  });
  // Live preview from GET /api/coupons/:code — the server-applied discount
  // for the CURRENT subtotal, so the totals reflect the coupon before the
  // order is placed. Debounced (250ms) to avoid a request per keystroke-ish
  // churn as cart lines change; never blocks or errors loudly.
  const [couponPreview, setCouponPreview] = useState(null);
  // Manual entry (no deep link): the raw input text. Applying normalizes to
  // the stored UPPERCASE form and moves it into couponCode — from there it
  // rides the exact same preview/validation/checkout path as deep-linked
  // codes, so there's one behavior, not two.
  const [couponInput, setCouponInput] = useState("");
  const [cartOrigin, setCartOrigin] = useState(() => {
    try {
      return sessionStorage.getItem(CART_ORIGIN_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const delivery = getDeliveryFee(zone);
  const subtotal = cart.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0,
  );

  // Re-read deep-link values whenever the drawer OPENS. On a full-page
  // /checkout load this component mounts before FbCheckout writes
  // sessionStorage, so the initializers above would read stale empties —
  // the open transition (fired by the checkout page after the write) is the
  // reliable moment. Removal stays effective until the next open. State
  // writes are deferred out of the effect body (cascading-render rule).
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => {
      try {
        const storedCoupon = sessionStorage.getItem("mb_coupon") || "";
        const storedOrigin = sessionStorage.getItem(CART_ORIGIN_STORAGE_KEY) || "";
        // Only a stored deep-link coupon takes over — a manually applied
        // code survives reopen when there's no deep link in play.
        if (storedCoupon) {
          setCouponCode((prev) => (prev === storedCoupon ? prev : storedCoupon));
        }
        if (storedOrigin) {
          setCartOrigin((prev) => (prev === storedOrigin ? prev : storedOrigin));
        }
      } catch {
        /* storage disabled */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [open]);

  // Re-check the coupon whenever it or the subtotal changes. A stale
  // response is discarded via a cancelled flag (last write wins); the reset
  // path defers its write like the open-sync effect above.
  useEffect(() => {
    let cancelled = false;
    const active = couponCode && open;
    const id = setTimeout(
      async () => {
        if (!active) {
          setCouponPreview(null);
          return;
        }
        try {
          const preview = await lookupCoupon(couponCode, subtotal);
          if (!cancelled) setCouponPreview(preview);
        } catch {
          // Preview is best-effort — checkout still validates the final code.
          if (!cancelled) setCouponPreview(null);
        }
      },
      active ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [couponCode, subtotal, open]);

  const discount = couponPreview?.usable ? couponPreview.discount : 0;
  const total = subtotal - discount + delivery;

  // Apply the typed code (uppercase, matching how the admin stores codes).
  const applyCouponInput = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponCode(code);
    setCouponInput("");
  };

  const removeCoupon = () => {
    setCouponCode("");
    setCouponPreview(null);
    // A removed deep-link coupon stays removed — otherwise the next drawer
    // open would silently re-apply it from storage.
    try {
      sessionStorage.removeItem("mb_coupon");
    } catch {
      /* storage disabled */
    }
  };

  const handleCheckout = async () => {
    if (loading) return;

    if (!name || !email || !phone || !zone) {
      return alert("Fill all required details");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return alert("Enter a valid email address");
    }

    if (zone === "Other" && !customLocation) {
      return alert("Enter your location");
    }

    if (cart.length === 0) {
      return alert("Your cart is empty");
    }

    // Every cart item must have the variations its product actually uses.
    for (const item of cart) {
      const missing = missingVariation(item);
      if (missing) {
        return alert(
          `${item.name} is missing a ${missing} selection.`,
        );
      }
    }

    const finalLocation = zone === "Other" ? customLocation : zone;

    const payload = {
      name,
      phone,
      email,
      zone,
      customLocation: finalLocation,
      ...(couponCode ? { couponCode } : {}),
      ...(cartOrigin ? { cartOrigin } : {}),
      cart: cart.map((item) => {
        const type = item.variationType || "color_size";
        const line = {
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        };
        if (type === "color" || type === "color_size") {
          line.colorId = item.selectedColorId;
        }
        if (type === "size" || type === "color_size") {
          line.size = item.selectedSize;
          line.sizeId = item.selectedSizeId || undefined;
        }
        return line;
      }),
    };

    // Open a blank window now so the browser keeps the user gesture; it is
    // only navigated to WhatsApp after the order is saved. This avoids the
    // popup blocker killing the window when the API call takes a moment.
    const popup = window.open("", "_blank");

    try {
      setLoading(true);
      const result = await createCheckout(payload);
      const orderNumber = result.orderNumber;

      const whatsappUrl = buildWhatsAppUrl({
        orderNumber,
        customerName: name,
        phone,
        location: finalLocation,
        items: cart,
        subtotal: result.subtotal ?? subtotal,
        delivery: result.deliveryFee ?? delivery,
        total: result.total ?? total,
        discount: result.discount ?? 0,
        ...(couponCode ? { couponCode } : {}),
        ...(cartOrigin ? { cartOrigin } : {}),
      });

      if (popup && !popup.closed) {
        popup.location.href = whatsappUrl;
      } else {
        // Popup was blocked — send the customer to WhatsApp in this tab.
        window.location.href = whatsappUrl;
      }

      // Meta Pixel Purchase — order confirmed, so this is the source of
      // truth for revenue. content_ids match the feed's <g:id> values.
      trackPurchase({
        value: result.total ?? total,
        contents: cart.map((item) => ({
          id: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
      });
      clearCart();
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      alert(error.message || "Unable to complete checkout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Dim overlay behind the drawer — fades in/out with it. Clicking it
          closes. Kept mounted so its opacity can animate in both directions. */}
      <div
        aria-hidden="true"
        onClick={toggle}
        className={`fixed inset-0 bg-black/30 transition-opacity duration-200 ease-out ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        role="dialog"
        aria-label="Shopping cart"
        className={`fixed top-0 right-0 h-full w-80 bg-white p-4 overflow-y-auto ${
          open ? "translate-x-0" : "translate-x-full"
        } transition-transform duration-200 ease-out`}
      >
      <button onClick={toggle}>Close</button>

      <h2 className="font-bold mt-2">Cart</h2>

      {cart.map((item, i) => (
        <CartLine
          key={item.id ?? i}
          item={item}
          index={i}
          onRemove={removeFromCart}
        />
      ))}

      {/* FORM */}
      <div className="mt-4 space-y-2">
        <input
          placeholder="Name"
          className="w-full border p-2"
          onChange={(e) => setName(e.target.value)}
        />

        <input
          placeholder="Phone"
          className="w-full border p-2"
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          placeholder="Email"
          className="w-full border p-2"
          onChange={(e) => setEmail(e.target.value)}
        />

        {/* DROPDOWN */}
        <select
          className="w-full border p-2"
          onChange={(e) => setZone(e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>
            Select Delivery Location
          </option>
          {DELIVERY_ZONES.map((z) => (
            <option key={z.name} value={z.name}>
              {z.name} (KES {z.fee})
            </option>
          ))}
        </select>

        {/* CONDITIONAL INPUT — fades in, and fades out before unmounting */}
        <ConditionalOtherInput
          visible={zone === "Other"}
          onChange={(e) => setCustomLocation(e.target.value)}
        />
      </div>

      {/* COUPON — manual entry when none applied */}
      {!couponCode && (
        <div className="mb-fade-in mt-4 flex gap-2">
          <input
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCouponInput();
            }
            }}
            placeholder="Coupon code"
            aria-label="Coupon code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full border p-2 text-sm uppercase placeholder:normal-case placeholder:text-black/40"
          />
          <button
            type="button"
            onClick={applyCouponInput}
            disabled={!couponInput.trim()}
            className="border border-black px-4 py-2 text-[10px] tracking-[0.28em] uppercase font-light disabled:opacity-40 hover:bg-black hover:text-white transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* TOTALS */}
      <div className="mt-4 text-sm">
        <p>Subtotal: KES {subtotal}</p>
        <p>Delivery: KES {delivery}</p>
        {couponCode && (
          <div className="mb-fade-in text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className={couponPreview?.usable ? "text-black/70" : "text-black/40"}>
                Coupon: {couponCode}
                {couponPreview && !couponPreview.usable && ` — ${couponPreview.message}`}
              </span>
            <button
              type="button"
              onClick={removeCoupon}
              aria-label={`Remove coupon ${couponCode}`}
              className="text-black/40 hover:text-black/80 transition-colors"
            >
              ×
            </button>
            </div>
            {couponPreview?.usable && discount > 0 && (
              <div className="flex justify-between text-black/70 mt-1 mb-fade-text" key={`disc-${discount}`}>
                <span>Discount</span>
                <span>−KES {discount}</span>
              </div>
            )}
          </div>
        )}
        <p className="font-bold">Total: KES {total}</p>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full mt-4 bg-black text-white py-2 disabled:opacity-60"
      >
        {loading ? "Placing order…" : "Checkout via WhatsApp"}
      </button>
      </div>
    </>
  );
}
