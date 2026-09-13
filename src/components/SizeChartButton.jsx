/**
 * SIZE CHART button — text-only control on the far left of the product-page
 * anchor row (centered × is the fixed anchor; ? sits on the far right).
 *
 * Visual: no background, no border, no rounded corners, uppercase/spaced
 * typography matching the rest of the product page (text-[10px] tracking-[0.3em]
 * uppercase text-black/50 font-light), purely clickable text — not a pill.
 */
export default function SizeChartButton({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Open size chart"
      className="
        mb-fade-in
        text-[10px] tracking-[0.3em] uppercase text-black/50 font-light
        transition hover:text-black/90 focus:outline-none
      "
    >
      Size Chart
    </button>
  );
}
