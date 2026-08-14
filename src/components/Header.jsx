// components/Header.jsx
import { ShoppingBag, ChevronLeft, Plus } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLocation, useNavigate } from "react-router-dom";
import DistortedMambo from "../assets/distorted mambo.svg";

export default function Header({ toggleCart, zoomLevel, maxZoom, toggleZoom }) {
  const { cart } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  const isProductPage = location.pathname.startsWith("/product/");
  const isTermsPage = location.pathname === "/terms";
  const isPrivacyPage = location.pathname === "/privacy";
  const isHome = !isProductPage && !isTermsPage && !isPrivacyPage;
  const isAtMax = zoomLevel >= maxZoom;

  const handleLeftButton = () => {
    if (isHome) {
      toggleZoom();
      return;
    }

    navigate("/");
  };

  const showBackArrow =
    isProductPage || isTermsPage || isPrivacyPage || (isHome && isAtMax);

  const logo = (
    <img
      src={DistortedMambo}
      alt="MAMBO BEARD"
      style={{
        height: "4rem",
        filter:
          "brightness(0) saturate(100%) invert(20%) sepia(30%) saturate(800%) hue-rotate(350deg) brightness(95%) contrast(90%)",
      }}
    />
  );

  return (
    <header className="sticky top-0 z-10 w-full grid grid-cols-3 items-center px-4 py-1  bg-[#F5FFFA] text-black ">
      {/* Left: Back / Zoom toggle */}
      <div className="flex items-center">
        <button
          onClick={handleLeftButton}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/10 transition-all active:scale-90"
          style={{ transition: "transform 0.2s ease" }}
        >
          <span
            style={{
              display: "inline-flex",
              transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: showBackArrow ? "rotate(0deg)" : "rotate(90deg)",
              color: "#43392f",
            }}
          >
            {showBackArrow ? <ChevronLeft size={22} /> : <Plus size={22} />}
          </span>
        </button>
      </div>

      {/* Center: Logo */}
      <div className="flex justify-center">{logo}</div>

      {/* Right: Cart */}
      <div className="flex justify-end">
        <button onClick={toggleCart} className="relative">
          <ShoppingBag style={{ color: "#43392f" }} />
          <span
            className="absolute -top-2 -right-2 text-xs text-white rounded-full px-1"
            style={{ backgroundColor: "#43392f" }}
          >
            {cart.length}
          </span>
        </button>
      </div>
    </header>
  );
}
