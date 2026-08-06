// App.jsx

import { useMemo, useState, useEffect, useCallback, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Home from "./pages/Home";
import YeezyProduct from "./pages/YeezyProduct";
import Header from "./components/Header";
import CartDrawer from "./components/CartDrawer";
import VipPopup from "./components/VipPopup";
import SEO from "./components/SEO";
import { CartProvider } from "./context/CartContext";
import {
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  organizationJsonLd,
  websiteJsonLd,
} from "./utils/seo";

// Rarely-visited static pages are code-split (loaded on demand).
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));

// Global defaults + Organization/WebSite structured data. Rendered before
// the routes so page-level <SEO> (mounted later) wins for duplicates.
function GlobalSEO() {
  const jsonLd = useMemo(() => [organizationJsonLd(), websiteJsonLd()], []);
  return (
    <SEO
      title={DEFAULT_TITLE}
      description={DEFAULT_DESCRIPTION}
      path="/"
      jsonLd={jsonLd}
    />
  );
}

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
    <HelmetProvider>
      <CartProvider>
        <BrowserRouter>
          <GlobalSEO />

          <Header
            toggleCart={() => setCartOpen(!cartOpen)}
            zoomLevel={zoomLevel}
            maxZoom={maxZoom}
            toggleZoom={toggleZoom}
          />

          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Home zoomLevel={zoomLevel} />} />
              <Route
                path="/product/:slug"
                element={<YeezyProduct zoomLevel={zoomLevel} maxZoom={maxZoom} />}
              />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
            </Routes>
          </Suspense>

          <CartDrawer open={cartOpen} toggle={() => setCartOpen(false)} />

          <VipPopup />
        </BrowserRouter>
      </CartProvider>
    </HelmetProvider>
  );
}

export default App;
