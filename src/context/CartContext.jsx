// context/CartContext.jsx
import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("cart");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  /**
   * Add an item to the cart.
   * Item shape: { id, productId, name, price, quantity, selectedColor, selectedColorId, selectedSize, image }
   * - id is a composite key: `${productId}-${colorId}-${size}`
   * - image should be a full R2 URL (already resolved via buildImageUrl)
   */
  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((entry) => entry.id === item.id);
      if (existing) {
        return prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, quantity: entry.quantity + item.quantity }
            : entry,
        );
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((entry) => entry.id !== itemId));
      return;
    }
    setCart((prev) =>
      prev.map((entry) =>
        entry.id === itemId ? { ...entry, quantity } : entry,
      ),
    );
  };

  const clearCart = () => setCart([]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartCount }}
    >
      {children}
    </CartContext.Provider>
  );
};
