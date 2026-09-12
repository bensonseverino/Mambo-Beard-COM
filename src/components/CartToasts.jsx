import { useEffect, useRef } from "react";
import useExitFade from "../hooks/useExitFade";

// How long a toast stays fully visible before its exit fade begins.
// Keep in sync with CartContext's expiry expectation.
const TOAST_VISIBLE_MS = 2600;

/**
 * One toast: fades in on mount, holds TOAST_VISIBLE_MS, then fades out via
 * .mb-fade-swap before unmounting (useExitFade). Lifecycle is fully owned
 * here — the container only passes down immutable toast data plus the
 * two callbacks (expire → flip visible=false, done → drop from list).
 */
function Toast({ toast, onExpire, onDone }) {
  const { render, closing } = useExitFade(toast.visible);
  const doneRef = useRef(false);

  // Auto-expiry timer, armed once per mount.
  useEffect(() => {
    const t = setTimeout(() => onExpire(toast.id), TOAST_VISIBLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!render) {
    if (!doneRef.current) {
      doneRef.current = true;
      onDone(toast.id);
    }
    return null;
  }

  return (
    <div
      role="status"
      className={`mb-fade-in mb-fade-swap pointer-events-auto flex items-center gap-2 border border-[#43392f]/25 bg-[#f5fffa] px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#43392f] shadow-[0_4px_18px_rgba(67,57,47,0.15)] ${
        closing ? "is-closing" : ""
      }`}
    >
      <span aria-hidden="true">{toast.icon}</span>
      <span>{toast.message}</span>
    </div>
  );
}

/**
 * Cart toast stack — bottom-left column of transient notifications for
 * add/remove actions. Each toast lives for TOAST_VISIBLE_MS + EXIT_FADE_MS,
 * then removes itself. Announced politely to screen readers via the
 * aria-live region; the container never captures clicks.
 */
export default function CartToasts({ toasts, onExpired, onDone }) {
  // `onDone` defaults to onExpired: CartContext's expireToast both flips
  // visible and drops already-invisible toasts, so one callback suffices.
  const handleDone = onDone || onExpired;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onExpire={onExpired}
          onDone={handleDone}
        />
      ))}
    </div>
  );
}
