// components/Header.jsx
import { ShoppingBag } from "lucide-react";
import { useCart } from "../context/CartContext";

export default function Header({ toggleCart }) {
  const { cart } = useCart();

  return (
    <header className="w-full flex justify-between items-center px-4 py-1 border-b">
      <h1 className="text-2xl font-bold tracking-wide">MAMBO BEARD</h1>

      <button onClick={toggleCart} className="relative">
        <ShoppingBag />
        <span className="absolute -top-2 -right-2 text-xs bg-black text-white rounded-full px-1">
          {cart.length}
        </span>
      </button>
    </header>
  );
}
