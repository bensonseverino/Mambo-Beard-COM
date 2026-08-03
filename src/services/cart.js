export const buildCartItem = ({
  product,
  selectedColor,
  selectedColorId,
  selectedSize,
  selectedSizeId,
  image,
}) => ({
  id: `${product.id}-${selectedColorId}-${selectedSizeId}`,
  productId: product.id,
  name: product.name,
  price: product.price,
  quantity: 1,
  selectedColor,
  selectedColorId,
  selectedSize,
  selectedSizeId,
  image,
});

export const mergeCartItem = (existingItem, nextQuantity = 1) => ({
  ...existingItem,
  quantity: existingItem.quantity + nextQuantity,
});
