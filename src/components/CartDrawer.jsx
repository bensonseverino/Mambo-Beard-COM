// components/CartDrawer.jsx

import { useState } from "react";
import { useCart } from "../context/CartContext";
import { DELIVERY_ZONES, getDeliveryFee } from "../utils/deliveryFee";
import { createCheckout } from "../services/api";
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

export default function CartDrawer({ open, toggle }) {
  const { cart, removeFromCart, clearCart } = useCart();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [loading, setLoading] = useState(false);

  const delivery = getDeliveryFee(zone);
  const subtotal = cart.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0,
  );
  const total = subtotal + delivery;

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
    <div
      className={`fixed top-0 right-0 h-full w-80 bg-white p-4 ${
        open ? "translate-x-0" : "translate-x-full"
      } transition`}
    >
      <button onClick={toggle}>Close</button>

      <h2 className="font-bold mt-2">Cart</h2>

      {cart.map((item, i) => (
        <div
          key={i}
          className="flex gap-3 items-start text-sm mb-3 pb-3 border-b"
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
            onClick={() => removeFromCart(i)}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            ×
          </button>
        </div>
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

        {/* CONDITIONAL INPUT */}
        {zone === "Other" && (
          <input
            placeholder="Enter your exact location"
            className="w-full border p-2"
            onChange={(e) => setCustomLocation(e.target.value)}
          />
        )}
      </div>

      {/* TOTALS */}
      <div className="mt-4 text-sm">
        <p>Subtotal: KES {subtotal}</p>
        <p>Delivery: KES {delivery}</p>
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
  );
}
