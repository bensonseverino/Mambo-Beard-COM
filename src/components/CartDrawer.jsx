// components/CartDrawer.jsx

import { useState } from "react";
import { useCart } from "../context/CartContext";
import { generateOrderId } from "../utils/generateOrderId";
import { DELIVERY_ZONES, getDeliveryFee } from "../utils/deliveryFee";

export default function CartDrawer({ open, toggle }) {
  const { cart, removeFromCart, clearCart } = useCart();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("");
  const [customLocation, setCustomLocation] = useState("");

  const delivery = getDeliveryFee(zone);
  const subtotal = cart.reduce((acc, item) => acc + item.price, 0);
  const total = subtotal + delivery;

  const handleCheckout = () => {
    if (!name || !phone || !zone) {
      return alert("Fill all required details");
    }

    if (zone === "Other" && !customLocation) {
      return alert("Enter your location");
    }

    const orderId = generateOrderId();

    const finalLocation = zone === "Other" ? customLocation : zone;

    const orderList = cart
      .map(
        (item, i) =>
          `${i + 1}. ${item.name} (${item.size}${item.color ? `, ${item.color}` : ""}) - KES ${item.price}`,
      )
      .join("%0A");

    const message = `*NEW ORDER*%0A
Order ID: ${orderId}%0A
Name: ${name}%0A
Phone: ${phone}%0A
Location: ${finalLocation}%0A
--------------------%0A
${orderList}%0A
--------------------%0A
Subtotal: KES ${subtotal}%0A
Delivery: KES ${delivery}%0A
Total: KES ${total}`;

    const url = `https://wa.me/254117954929?text=${message}`;

    window.open(url, "_blank");
    clearCart();
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
            src={Array.isArray(item.image) ? item.image[0] : item.image}
            alt={item.name}
            className="w-16 h-16 object-cover rounded"
          />
          <div className="flex-1">
            <p className="font-medium">
              {item.name} ({item.size}
              {item.color ? `, ${item.color}` : ""})
            </p>
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
        className="w-full mt-4 bg-black text-white py-2"
      >
        Checkout via WhatsApp
      </button>
    </div>
  );
}
