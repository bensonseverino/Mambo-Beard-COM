// context/CartContext.jsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const CartContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => useContext(CartContext);

// Sequence for toast ids (never reuse keys during exit fades). Kept as a
// mutable module variable — it's an identity counter, not render state.
let toastSeq = 0;

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("cart");
    return saved ? JSON.parse(saved) : [];
  });

  // Transient cart notifications ("Added …", "Removed …"), newest last.
  // The <CartToasts /> renderer (mounted in App) displays and expires them.
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((message, icon) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-2), { id, message, icon, visible: true }]);
  }, []);

  // Auto-expiry flips `visible`; the toast then exit-fades and removes itself.
  const expireToast = useCallback((id) => {
    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target && target.visible) {
        return prev.map((t) => (t.id === id ? { ...t, visible: false } : t));
      }
      // Already faded out (Toast's onDone) — drop it from the list.
      return prev.filter((t) => t.id !== id);
    });
  }, []);

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
    // Toast outside the updater — updaters must stay pure (StrictMode
    // double-invokes them in dev, which would double the toast).
    pushToast(`Added ${item.name}`, "＋");
  };

  const removeFromCart = (index) => {
    const removed = cart[index];
    setCart((prev) => prev.filter((_, i) => i !== index));
    if (removed) pushToast(`Removed ${removed.name}`, "×");
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
      value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, toasts, expireToast }}
    >
      {children}
    </CartContext.Provider>
  );
};
