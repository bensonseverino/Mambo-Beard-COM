// pages/Home.jsx
import { products } from "../data/products";
import ProductCard from "../components/Productcard";
import MamboBeardFooter from "../components/Footer";

// ...existing code...

// Grid classes for each zoom level (mobile / desktop)
// Desktop: only 2 visual states (6 cols ↔ 3 cols), mobile: 3 levels (3 → 2 → 1)
const GRID_CLASSES = [
  "grid-cols-3 md:grid-cols-6", // Level 0 — most zoomed out
  "grid-cols-2 md:grid-cols-3", // Level 1
  "grid-cols-1 md:grid-cols-3", // Level 2 — mobile carousel, desktop stays at 3 cols
];

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
  const isMobileCarousel = zoomLevel === 2;

  return (
    <>
      {/* Desktop always shows grid; Mobile shows carousel at max zoom */}
      <div className="bg-[#F5FFFA] text-black overflow-hidden">
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
      </div>
      <MamboBeardFooter />
    </>
  );
}
