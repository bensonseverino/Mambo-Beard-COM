import { useEffect, useRef, useCallback } from "react";

const OVERLAY_FADE_MS = 180;

// Real measurements are populated from the product/backend when available.
// Until then every cell is a deliberate placeholder so the component never
// silently invents fake measurements.
const SIZE_CHART_DATA = {
  sizes: ["S", "M", "L", "XL", "XXL"],
  measurements: [
    { label: "Chest", unit: "cm" },
    { label: "Shoulder", unit: "cm" },
    { label: "Length", unit: "cm" },
  ],
  cells: {
    S: ["TBD", "TBD", "TBD"],
    M: ["TBD", "TBD", "TBD"],
    L: ["TBD", "TBD", "TBD"],
    XL: ["TBD", "TBD", "TBD"],
    XXL: ["TBD", "TBD", "TBD"],
  },
};

export default function SizeChartModal({ open, onClose }) {
  const contentRef = useRef(null);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    const tryFocus = () => {
      if (contentRef.current) {
        const closeBtn = contentRef.current.querySelector('button[aria-label="Close size chart"]');
        if (closeBtn) closeBtn.focus();
      }
    };
    const raf = requestAnimationFrame(tryFocus);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      cancelAnimationFrame(raf);
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            background: "rgba(20, 16, 12, 0.35)",
            opacity: 1,
            transition: `opacity ${OVERLAY_FADE_MS}ms ease`,
          }}
          aria-hidden="true"
        />
      )}

      {open ? (
        <div
          ref={contentRef}
          role="dialog"
          aria-modal="true"
          aria-label="Size chart"
          className="relative z-50 w-full max-w-md"
          style={{ animation: `sizeChartFadeIn ${OVERLAY_FADE_MS}ms ease both` }}
        >
          <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
            <h2 className="text-[11px] tracking-[0.3em] uppercase text-black/70 font-light">
              Size Chart
            </h2>
            <button
              onClick={onClose}
              aria-label="Close size chart"
              className="flex items-center justify-center w-8 h-8 border border-black/20 transition hover:border-black/60 focus:outline-none"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className="text-black/70"
                style={{ transition: "transform 0.2s ease" }}
              >
                <path
                  d="M2 2L10 10M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="overflow-auto">
            <table
              className="w-full border-collapse text-[10px] font-light"
              style={{ fontFamily: "var(--sans)" }}
            >
              <thead className="border-b border-black/10">
                <tr>
                  <th
                    className="text-left text-[9px] tracking-[0.25em] uppercase text-black/40 px-5 py-2 font-light"
                    style={{ borderBottom: "1px solid rgba(0,0,0,0.1)" }}
                  >
                    Size
                  </th>
                  {SIZE_CHART_DATA.measurements.map((m) => (
                    <th
                      key={m.label}
                      className="text-left text-[9px] tracking-[0.25em] uppercase text-black/40 px-4 py-2 font-light"
                      style={{ borderBottom: "1px solid rgba(0,0,0,0.1)" }}
                    >
                      {m.label} ({m.unit})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SIZE_CHART_DATA.sizes.map((size) => (
                  <tr key={size}>
                    <td className="text-left text-black/60 px-5 py-2 border-b border-black/5 font-light">
                      {size}
                    </td>
                    {SIZE_CHART_DATA.cells[size].map((val, idx) => (
                      <td
                        key={idx}
                        className="text-center text-black/50 px-4 py-2 border-b border-black/[0.04] font-light"
                      >
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[9px] tracking-[0.2em] uppercase text-black/30 font-light px-5">
            Measurements in centimeters. Fit may vary slightly by fabric and color.
          </p>
        </div>
      ) : null}
    </>
  );
}

export function SizeChartStyles() {
  return (
    <style>{`
      @keyframes sizeChartFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `}</style>
  );
}

