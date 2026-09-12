// pages/Home.jsx — Homepage: product grid.
// The early-access landing page that previously lived here is preserved,
// inactive, in pages/HomeEarlyAccess.jsx and can be swapped back anytime.
import { useEffect, useMemo, useRef, useState } from "react";
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

// Newly revealed ("Shop More") card that fades/rises in when it scrolls into
// view. Registers itself with the Home-level IntersectionObserver, which adds
// .is-visible (and a small per-batch stagger delay) when the card enters the
// viewport. Initial (pre-Shop-More) cards don't animate and never use this.
function RevealItem({ revealRegistry, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !revealRegistry) return undefined;
    revealRegistry.observe(el);
    return () => revealRegistry.unobserve(el);
  }, [revealRegistry]);

  return <div ref={ref} className="mb-reveal w-full">{children}</div>;
}

// Stagger between cards observed in the same batch (capped below).
const REVEAL_STAGGER_MS = 45;
// Longest extra wait any single card gets, so tails never drag.
const REVEAL_MAX_DELAY_MS = 450;

// IntersectionObserver that adds .is-visible to .mb-reveal cards as they
// scroll into view, so newly revealed products animate per-card instead of
// all at once. Cards entering in the same observer batch are staggered.
function useRevealRegistry() {
  const [registry, setRegistry] = useState(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      // Very old browser: skip the effect entirely, cards show immediately.
      setRegistry({
        observe: (el) => el.classList.add("is-visible"),
        unobserve: () => {},
      });
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        let batchIndex = 0;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          // Start already-visible cards at 0ms; stagger the rest of the batch.
          entry.target.style.setProperty(
            "--reveal-delay",
            `${Math.min(batchIndex * REVEAL_STAGGER_MS, REVEAL_MAX_DELAY_MS)}ms`,
          );
          batchIndex += 1;
          entry.target.classList.add("is-visible");
        });
      },
      // Start the fade just before the card fully enters the viewport.
      { rootMargin: "0px 0px 60px 0px" },
    );
    setRegistry(observer);
    return () => observer.disconnect();
  }, []);

  return registry;
}

function VerticalScrollGallery({ items, revealFrom = Infinity, revealRegistry }) {
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
      {/* Duplicate items for endless scrolling. Both copies of a newly
          revealed product rise in as each scrolls into view (see Home). */}
      {[...items, ...items].map((product, index) => {
        const isNew = index % items.length >= revealFrom;
        const Card = isNew ? RevealItem : "div";
        return (
          <Card
            key={`${product.id}-${Math.floor(index / items.length)}`}
            {...(isNew
              ? { revealRegistry }
              : { className: "w-full" })}
          >
            {/* First visible cards load immediately for a fast first paint */}
            <ProductCard product={product} eager={index < 2} />
          </Card>
        );
      })}
    </div>
  );
}

// "Shop More" reveal button — shows the rest of the products when tapped.
// Outlined style; on click it shows a brief loading beat (spinner) while the
// newly revealed cards animate in, so the tap feels acknowledged.
function ShopMoreButton({ onClick, loading = false }) {
  return (
    <div className="flex justify-center px-4 py-6">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className={`inline-flex items-center justify-center gap-2 min-w-36 border border-[#43392f] bg-transparent text-[#43392f] uppercase tracking-[0.2em] text-xs font-medium px-6 py-2.5 transition duration-150 cursor-pointer ${
          loading
            ? "opacity-70 pointer-events-none"
            : "hover:bg-[#43392f]/5 active:scale-[0.97]"
        }`}
      >
        {loading ? (
          <>
            <span className="mb-spinner" aria-hidden="true" />
            {/* Reduced-motion users get text instead of a spinning indicator. */}
            <span className="mb-reduced-only">Loading…</span>
          </>
        ) : (
          "Shop More"
        )}
      </button>
    </div>
  );
}

export default function Home({ zoomLevel }) {
  const { products, loading, error } = useProducts();
  const isMobile = useIsMobile();
  const isMobileCarousel = zoomLevel === 2;
  const [showAll, setShowAll] = useState(false);
  // Index in `products` where the "Shop More" reveal batch starts.
  // Infinity until the button is tapped, so nothing animates on first paint.
  const [revealedAt, setRevealedAt] = useState(Infinity);
  // IntersectionObserver that adds .is-visible to .mb-reveal cards as they
  // scroll into view, so newly revealed products animate per-card.
  const revealRegistry = useRevealRegistry();
  // Brief "acknowledged" beat on the Shop More button: click shows a spinner
  // first, and only then the grid expands and the button unmounts.
  const [revealPending, setRevealPending] = useState(false);
  const revealTimer = useRef(null);
  useEffect(() => () => clearTimeout(revealTimer.current), []);

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

  const handleShopMore = () => {
    if (revealPending) return;
    setRevealPending(true);
    // Let the spinner state paint for a beat, then expand the grid; the
    // button unmounts itself once `hasMore` goes false.
    clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => {
      setRevealedAt(visibleProducts.length);
      setShowAll(true);
      setRevealPending(false);
    }, 300);
  };

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
          <div className="mb-fade-in flex items-center justify-center py-20 px-4">
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

        {/* Loaded content — fades in over the skeleton it replaces */}
        {!loading && !error && (
          <>
            {/* Carousel view — mobile only at zoom level 2 */}
            {isMobileCarousel && (
              <div className="mb-fade-in block md:hidden py-4 h-full overflow-y-auto">
                <VerticalScrollGallery
                  items={visibleProducts}
                  revealFrom={revealedAt}
                  revealRegistry={revealRegistry}
                />
                {hasMore && (
                  <ShopMoreButton onClick={handleShopMore} loading={revealPending} />
                )}
              </div>
            )}

            {/* Grid view — always on desktop, hidden on mobile at zoom level 2 */}
            <div
              className={`mb-fade-in p-4 mx-auto max-w-7xl grid gap-4 transition-all duration-300 ease-out ${
                GRID_CLASSES[zoomLevel]
              } ${isMobileCarousel ? "hidden md:grid" : ""}`}
            >
              {visibleProducts.map((product, index) => {
                const isNew = index >= revealedAt;
                const Card = isNew ? RevealItem : "div";
                return (
                  // First grid row (desktop: 6 columns) is above the fold —
                  // load eagerly so the LCP image isn't blocked on lazy loading.
                  <Card
                    key={product.id}
                    {...(isNew ? { revealRegistry } : {})}
                  >
                    <ProductCard product={product} eager={index < 6} />
                  </Card>
                );
              })}
            </div>
            {hasMore && !isMobileCarousel && (
              <ShopMoreButton onClick={handleShopMore} loading={revealPending} />
            )}
          </>
        )}
      </div>
      <MamboBeardFooter />
    </>
  );
}
