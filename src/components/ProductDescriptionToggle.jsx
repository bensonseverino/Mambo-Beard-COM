import { useState } from "react";

/**
 * Info trigger for the product description.
 *
 * Sits on the far right of ProductInfo's anchor row (centered × is the fixed
 * anchor). Text-only "INFO" control when closed — no fill, no border, no
 * radius, same uppercase/spaced typography as the SIZE CHART control — and a
 * small bordered × when open. The open state swaps the COLOR / SELECT SIZE
 * sections inside the expanded panel for the product description (the swap
 * itself is wired in ProductInfo).
 *
 * Data rule: the parent only renders this trigger when `product.description`
 * exists — no trigger for products without a description, no empty section.
 */

export function DescriptionTrigger({ isOpen, onToggle }) {
  const label = isOpen ? "Hide product description" : "Show product description";

  if (isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label={label}
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
      aria-label={label}
      aria-expanded="false"
      className="mb-fade-in text-[10px] tracking-[0.3em] uppercase text-black/50 font-light transition hover:text-black/90 focus:outline-none"
    >
      Info
    </button>
  );
}

// Kept for potential standalone usage; the product page drives the trigger
// through ProductInfo's state instead.
export default function ProductDescriptionToggle({ product }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!product?.description) return null;
  return (
    <DescriptionTrigger
      isOpen={isOpen}
      onToggle={() => setIsOpen((prev) => !prev)}
    />
  );
}
