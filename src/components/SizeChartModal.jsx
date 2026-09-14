import { useEffect, useRef, useCallback } from "react";
import { sizeChartCaption } from "../utils/sizeChartUnit";

const OVERLAY_FADE_MS = 180;

export default function SizeChartModal({ open, onClose, sizeChart }) {
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

  if (!sizeChart) return null;

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
                  {sizeChart.columns.map((column) => (
                    <th
                      key={column}
                      className="text-left text-[9px] tracking-[0.25em] uppercase text-black/40 px-4 py-2 font-light"
                      style={{ borderBottom: "1px solid rgba(0,0,0,0.1)" }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizeChart.rows.map((row) => (
                  <tr key={row.size}>
                    <td className="text-left text-black/60 px-5 py-2 border-b border-black/5 font-light">
                      {row.size}
                    </td>
                    {sizeChart.columns.map((column, idx) => (
                      <td
                        key={column}
                        className="text-center text-black/50 px-4 py-2 border-b border-black/[0.04] font-light"
                      >
                        {row.measurements[idx] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[9px] tracking-[0.2em] uppercase text-black/30 font-light px-5">
            {sizeChartCaption(sizeChart.columns)}
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

