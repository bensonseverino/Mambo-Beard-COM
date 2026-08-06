// pages/Home.jsx
import { useMemo } from "react";
import useProducts from "../hooks/useProducts";
import ProductCard from "../components/Productcard";
import MamboBeardFooter from "../components/Footer";
import SEO from "../components/SEO";
import {
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  collectionJsonLd,
} from "../utils/seo";

// ...existing code...

// Grid classes for each zoom level (mobile / desktop)
// Desktop: only 2 visual states (6 cols ↔ 3 cols), mobile: 3 levels (3 → 2 → 1)
const GRID_CLASSES = [
  "grid-cols-3 md:grid-cols-6", // Level 0 — most zoomed out
  "grid-cols-2 md:grid-cols-3", // Level 1
  "grid-cols-1 md:grid-cols-3", // Level 2 — mobile carousel, desktop stays at 3 cols
];

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
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}

export default function Home({ zoomLevel }) {
  const { products, loading, error } = useProducts();
  const isMobileCarousel = zoomLevel === 2;

  // Skeleton count for loading state
  const skeletonCount = 6;

  // Backend-driven structured data: updates automatically as products are
  // created, updated, unpublished, or deleted.
  const seoJsonLd = useMemo(
    () =>
      products.length ? [collectionJsonLd("All Products", "/", products)] : [],
    [products],
  );

  return (
    <>
      <SEO
        title={DEFAULT_TITLE}
        description={DEFAULT_DESCRIPTION}
        path="/"
        jsonLd={seoJsonLd}
      />

      {/* Desktop always shows grid; Mobile shows carousel at max zoom */}
      <div className="bg-[#F5FFFA] text-black overflow-hidden">
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
              <div className="block md:hidden py-4 h-full">
                <VerticalScrollGallery items={products} />
              </div>
            )}

            {/* Grid view — always on desktop, hidden on mobile at zoom level 2 */}
            <div
              className={`p-4 mx-auto max-w-7xl grid gap-4 transition-all duration-300 ease-out ${
                GRID_CLASSES[zoomLevel]
              } ${isMobileCarousel ? "hidden md:grid" : ""}`}
            >
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
      <MamboBeardFooter />
    </>
  );
}
