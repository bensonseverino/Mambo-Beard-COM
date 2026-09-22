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
  // Meta Shops deep-link extras (/checkout) — shown only when present.
  couponCode,
  cartOrigin,
  // Server-validated discount in KES (from POST /api/checkout). When it's
  // non-zero the summary shows the saving at a glance — the original
  // subtotal struck through (WhatsApp ~strikethrough~) and the discounted
  // total bolded (*bold*), both native WhatsApp markup that renders in the
  // chat itself. A coupon without a server discount (e.g. to be honored
  // manually) keeps the plain lines.
  discount = 0,
}) => {
  const hasDiscount = Boolean(couponCode) && discount > 0;
  const lines = [
    "MAMBO BEARD ORDER",
    `Order Number: ${orderNumber}`,
    `Customer Name: ${customerName}`,
    `Phone: ${phone}`,
    `Location: ${location}`,
    "--------------------------------",
    ...items.map(formatItemLine),
    "--------------------------------",
    `Subtotal: ${hasDiscount ? `~KES ${subtotal}~` : `KES ${subtotal}`}`,
    `Delivery: KES ${delivery}`,
    ...(couponCode && discount > 0
      ? [`Coupon ${couponCode}: -KES ${discount}`]
      : couponCode
        ? [`Coupon: ${couponCode}`]
        : []),
    hasDiscount ? `*Total: KES ${total}*` : `Total: KES ${total}`,
    ...(cartOrigin ? [`Source: ${cartOrigin}`] : []),
  ];

  const message = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${businessNumber}?text=${message}`;
};
