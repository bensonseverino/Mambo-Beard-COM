const DEFAULT_WHATSAPP_NUMBER =
  import.meta.env.VITE_WHATSAPP_NUMBER || "254117954929";

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
    ...items.map(
      (item, index) =>
        `${index + 1}. ${item.name} ${item.selectedColor ? `(${item.selectedColor}` : ""}${
          item.selectedColor ? "," : ""
        } ${item.selectedSize ? `${item.selectedSize})` : ")"} x${item.quantity} - KES ${item.price}`,
    ),
    "--------------------------------",
    `Subtotal: KES ${subtotal}`,
    `Delivery: KES ${delivery}`,
    `Total: KES ${total}`,
  ];

  const message = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${businessNumber}?text=${message}`;
};
