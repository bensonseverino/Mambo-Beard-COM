// App.jsx

import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import YeezyProduct from "./pages/YeezyProduct";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Header from "./components/Header";
import CartDrawer from "./components/CartDrawer";
import VipPopup from "./components/VipPopup";
import { CartProvider } from "./context/CartContext";

// Returns true when viewport is below Tailwind's md breakpoint (768px)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function App() {
  const [cartOpen, setCartOpen] = useState(false);
  const [rawZoomLevel, setRawZoomLevel] = useState(0);
  const isMobile = useIsMobile();
  const maxZoom = isMobile ? 2 : 1;
  // Clamp zoom at render time instead of mutating state in an effect.
  const zoomLevel = Math.min(rawZoomLevel, maxZoom);

  const toggleZoom = useCallback(() => {
    setRawZoomLevel((z) => (z >= maxZoom ? 0 : z + 1));
  }, [maxZoom]);

  return (
    <CartProvider>
      <BrowserRouter>
        <Header
          toggleCart={() => setCartOpen(!cartOpen)}
          zoomLevel={zoomLevel}
          maxZoom={maxZoom}
          toggleZoom={toggleZoom}
        />

        <Routes>
          <Route path="/" element={<Home zoomLevel={zoomLevel} />} />
          <Route
            path="/product/:slug"
            element={<YeezyProduct zoomLevel={zoomLevel} maxZoom={maxZoom} />}
          />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>

        <CartDrawer open={cartOpen} toggle={() => setCartOpen(false)} />

        <VipPopup />
      </BrowserRouter>
    </CartProvider>
  );
}

export default App;
