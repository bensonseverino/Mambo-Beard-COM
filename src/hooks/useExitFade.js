import { useEffect, useRef, useState } from "react";

// How long .mb-fade-swap.is-closing plays (keep in sync with index.css).
export const EXIT_FADE_MS = 180;

// True when the user asked the OS to reduce motion — exit fades are
// skipped entirely for them (index.css also neutralizes the transition).
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Exit-fade helper for elements that would otherwise vanish on unmount.
 *
 * Wrap the "should this render" boolean: while closing, the element stays
 * mounted with `.is-closing` applied so the CSS exit transition plays;
 * once the fade finishes, `render` flips false and React unmounts it.
 * Reduced-motion users get the instant removal they asked for.
 *
 * @param {boolean} present — live "should it be visible" value
 * @returns {{ render: boolean, closing: boolean }} spread onto the element:
 *   className={`mb-fade-swap ${closing ? "is-closing" : ""}`}
 */
export default function useExitFade(present) {
  const [render, setRender] = useState(present);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (present) {
      // Re-entering (or initial): clear any pending close.
      clearTimeout(timerRef.current);
      timerRef.current = null;
      setClosing(false);
      setRender(true);
      return undefined;
    }
    if (!render) return undefined;
    if (prefersReducedMotion()) {
      setRender(false);
      return undefined;
    }
    setClosing(true);
    timerRef.current = setTimeout(() => {
      setClosing(false);
      setRender(false);
      timerRef.current = null;
    }, EXIT_FADE_MS);
    return () => clearTimeout(timerRef.current);
  }, [present, render]);

  useEffect(
    () => () => clearTimeout(timerRef.current),
    [],
  );

  return { render, closing };
}
