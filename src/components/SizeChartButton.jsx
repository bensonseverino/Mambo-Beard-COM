/**
 * SIZE CHART control — text-only on the far left of the product-page anchor
 * row (centered × is the fixed anchor; INFO sits on the far right).
 *
 * Closed: plain uppercase text, same treatment as the INFO control — no
 * background, no border, no radius. Open: a small bordered × matching the
 * page's control language. Only rendered for products that actually have
 * size-chart data from the backend.
 */
export default function SizeChartButton({ isOpen, onToggle }) {
  if (isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label="Hide size chart"
        aria-expanded="true"
        className="mb-fade-in flex items-center justify-center w-7 h-7 border border-black/20 transition hover:border-black/60 focus:outline-none"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          className="text-black/70"
        >
          <path
            d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      aria-label="Show size chart"
      aria-expanded="false"
      className="mb-fade-in text-[10px] tracking-[0.3em] uppercase text-black/50 font-light transition hover:text-black/90 focus:outline-none"
    >
      Size Chart
    </button>
  );
}
