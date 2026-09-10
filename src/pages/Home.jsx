// pages/Home.jsx — Homepage: product grid.
// The early-access landing page that previously lived here is preserved,
// inactive, in pages/HomeEarlyAccess.jsx and can be swapped back anytime.
import { useEffect, useMemo, useState } from "react";
import useProducts from "../hooks/useProducts";
import ProductCard from "../components/Productcard";
import MamboBeardFooter from "../components/Footer";
import SEO from "../components/SEO";
import {
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  collectionJsonLd,
} from "../utils/seo";

// Grid classes for each zoom level (mobile / desktop)
// Desktop: only 2 visual states (6 cols ↔ 3 cols), mobile: 3 levels (3 → 2 → 1)
const GRID_CLASSES = [
  "grid-cols-3 md:grid-cols-6", // Level 0 — most zoomed out
  "grid-cols-2 md:grid-cols-3", // Level 1
  "grid-cols-1 md:grid-cols-3", // Level 2 — mobile carousel, desktop stays at 3 cols
];

// Products shown on first paint before "Shop More" is tapped:
// 12 on mobile (<768px), 18 on tablet & desktop (≥768px).
const INITIAL_COUNT_MOBILE = 12;
const INITIAL_COUNT_DESKTOP = 18;

// True when the viewport is below Tailwind's md breakpoint (768px).
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

// ─────────────────────────────────────────────────────────────
// SKELETON CARD (loading placeholder)
// ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="text-center animate-pulse">
      <div className="w-full aspect-[3/4] bg-black/5 rounded" />
      <div className="mt-2 mx-auto h-3 w-24 bg-black/5 rounded" />
    </div>
  );
}

function VerticalScrollGallery({ items }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 px-4 overflow-y-auto overflow-x-hidden"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
        scrollBehavior: "smooth",
        WebkitScrollbar: "none",
        willChange: "transform",
      }}
    >
      {/* Duplicate items for endless scrolling */}
      {[...items, ...items].map((product, index) => (
        <div
          key={`${product.id}-${Math.floor(index / items.length)}`}
          className="w-full"
        >
          {/* First visible cards load immediately for a fast first paint */}
          <ProductCard product={product} eager={index < 2} />
        </div>
      ))}
    </div>
  );
}

// "Shop More" reveal button — shows the rest of the products when tapped.
function ShopMoreButton({ onClick }) {
  return (
    <div className="flex justify-center px-4 py-6">
      <button
        type="button"
        onClick={onClick}
        className="bg-[#43392f] text-[#f5fffa] uppercase tracking-[0.25em] text-sm font-medium px-10 py-3.5 hover:bg-[#332a23] active:scale-[0.99] transition cursor-pointer"
      >
        Shop More
      </button>
    </div>
  );
}

export default function Home({ zoomLevel }) {
  const { products, loading, error } = useProducts();
  const isMobile = useIsMobile();
  const isMobileCarousel = zoomLevel === 2;
  const [showAll, setShowAll] = useState(false);

  // Skeleton count for loading state
  const skeletonCount = 6;

  // Backend-driven structured data: updates automatically as products are
  // created, updated, unpublished, or deleted.
  const seoJsonLd = useMemo(
    () =>
      products.length ? [collectionJsonLd("All Products", "/", products)] : [],
    [products],
  );

  // Start with a fixed set (12 mobile / 18 desktop); "Shop More" reveals the rest.
  const initialCount = isMobile ? INITIAL_COUNT_MOBILE : INITIAL_COUNT_DESKTOP;
  const visibleProducts = showAll
    ? products
    : products.slice(0, initialCount);
  const hasMore = products.length > visibleProducts.length;

  return (
    <>
      <SEO
        title={DEFAULT_TITLE}
        description={DEFAULT_DESCRIPTION}
        path="/"
        jsonLd={seoJsonLd}
      />

      {/* Desktop always shows grid; Mobile shows carousel at max zoom */}
      <div className="bg-[#F5FFFA] text-black overflow-hidden flex-1">
        {/* Error state */}
        {error && (
          <div className="flex items-center justify-center py-20 px-4">
            <p className="text-[11px] tracking-[0.25em] uppercase text-black/40 font-light">
              Unable to load products
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div
            className={`p-4 mx-auto max-w-7xl grid gap-4 transition-all duration-300 ease-out ${GRID_CLASSES[zoomLevel]}`}
          >
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Loaded content */}
        {!loading && !error && (
          <>
            {/* Carousel view — mobile only at zoom level 2 */}
            {isMobileCarousel && (
              <div className="block md:hidden py-4 h-full overflow-y-auto">
                <VerticalScrollGallery items={visibleProducts} />
                {hasMore && (
                  <ShopMoreButton onClick={() => setShowAll(true)} />
                )}
              </div>
            )}

            {/* Grid view — always on desktop, hidden on mobile at zoom level 2 */}
            <div
              className={`p-4 mx-auto max-w-7xl grid gap-4 transition-all duration-300 ease-out ${
                GRID_CLASSES[zoomLevel]
              } ${isMobileCarousel ? "hidden md:grid" : ""}`}
            >
              {visibleProducts.map((product, index) => (
                // First grid row (desktop: 6 columns) is above the fold —
                // load eagerly so the LCP image isn't blocked on lazy loading.
                <ProductCard
                  key={product.id}
                  product={product}
                  eager={index < 6}
                />
              ))}
            </div>
            {hasMore && !isMobileCarousel && (
              <ShopMoreButton onClick={() => setShowAll(true)} />
            )}
          </>
        )}
      </div>
      <MamboBeardFooter />
    </>
  );
}
