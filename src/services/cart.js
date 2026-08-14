export const buildCartItem = ({
  product,
  variationType = "color_size",
  selectedColor,
  selectedColorId,
  selectedSize,
  selectedSizeId,
  image,
}) => {
  // Different variation combinations are separate cart items (the id is the
  // cart key). Simple products are identified by the product id alone.
  const id =
    variationType === "none"
      ? product.id
      : `${product.id}-${selectedColorId || "nc"}-${selectedSizeId || "ns"}`;

  return {
    id,
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity: 1,
    variationType,
    selectedColor: selectedColor || null,
    selectedColorId: selectedColorId || null,
    selectedSize: selectedSize || null,
    selectedSizeId: selectedSizeId || null,
    image,
  };
};

export const mergeCartItem = (existingItem, nextQuantity = 1) => ({
  ...existingItem,
  quantity: existingItem.quantity + nextQuantity,
});
