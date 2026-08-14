const DEFAULT_WHATSAPP_NUMBER =
  import.meta.env.VITE_WHATSAPP_NUMBER || "254117954929";

// One line per cart item. Only the variations the product actually supports
// are shown — simple products render no parenthetical, color-only products
// render (Color), size-only products render (Size), and color_size products
// render (Color, Size). Never "Color: undefined" / "Size: undefined".
const formatItemLine = (item, index) => {
  const parts = [];
  if (item.selectedColor) parts.push(item.selectedColor);
  if (item.selectedSize) parts.push(item.selectedSize);
  const variation = parts.length ? ` (${parts.join(", ")})` : "";
  return `${index + 1}. ${item.name}${variation} x${item.quantity} - KES ${item.price}`;
};

export const buildWhatsAppUrl = ({
  businessNumber = DEFAULT_WHATSAPP_NUMBER,
  orderNumber,
  customerName,
  phone,
  location,
  items,
  subtotal,
  delivery,
  total,
}) => {
  const lines = [
    "MAMBO BEARD ORDER",
    `Order Number: ${orderNumber}`,
    `Customer Name: ${customerName}`,
    `Phone: ${phone}`,
    `Location: ${location}`,
    "--------------------------------",
    ...items.map(formatItemLine),
    "--------------------------------",
    `Subtotal: KES ${subtotal}`,
    `Delivery: KES ${delivery}`,
    `Total: KES ${total}`,
  ];

  const message = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${businessNumber}?text=${message}`;
};
