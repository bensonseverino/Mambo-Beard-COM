import { useCallback, useEffect, useRef, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import useVipPopup from "../hooks/useVipPopup";
import { isValidKenyanPhone } from "../services/subscribers";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const CLOSE_ANIMATION_MS = 350;

export default function VipPopup() {
  const { open, status, close, join } = useVipPopup();

  const [closing, setClosing] = useState(false);
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState("");

  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const closingTimerRef = useRef(null);

  // Animated close: play the reverse transition, then unmount.
  const handleRequestClose = useCallback(() => {
    if (closingTimerRef.current) return;
    setClosing(true);
    closingTimerRef.current = setTimeout(() => {
      setClosing(false);
      closingTimerRef.current = null;
      close();
    }, CLOSE_ANIMATION_MS);
  }, [close]);

  // Focus moves into the popup on open; restores to the trigger on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement;
      const t = setTimeout(() => dialogRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    if (previouslyFocusedRef.current) {
      previouslyFocusedRef.current.focus?.();
      previouslyFocusedRef.current = null;
    }
    return undefined;
  }, [open]);

  // Success state auto-closes after 3 seconds. Keep focus inside the
  // dialog while the form is replaced by the success view (the submit
  // button unmounts, which would otherwise drop focus to <body>).
  useEffect(() => {
    if (status !== "success") return undefined;
    dialogRef.current?.focus();
    const t = setTimeout(handleRequestClose, 3000);
    return () => clearTimeout(t);
  }, [status, handleRequestClose]);

  // Trap keyboard focus inside the dialog.
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleRequestClose();
      return;
    }
    if (e.key !== "Tab") return;

    const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;
    const list = Array.from(nodes).filter(
      (node) => !node.disabled && node.offsetParent !== null,
    );
    if (list.length === 0) return;

    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    // The dialog itself holds initial focus (tabIndex={-1}) — Shift+Tab from
    // it must wrap to the last focusable, not escape to the browser chrome.
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Overlay click closes (only when the click started on the overlay).
  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) handleRequestClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (status === "loading") return;
    if (!isValidKenyanPhone(phone)) {
      setFieldError("Enter a valid Kenyan phone number.");
      return;
    }
    setFieldError("");
    join(phone);
  };

  // Reserved-height error slot: showing an error never changes the layout
  // (no clipping at the fixed sheet height, no button jump).
  const errorText =
    fieldError ||
    (status === "error"
      ? "Unable to join right now. Please try again later."
      : "");

  if (!open) return null;

  return (
    <div
      className={`vip-overlay ${closing ? "closing" : ""}`}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={dialogRef}
        className={`vip-dialog ${closing ? "closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Join the Mambo Beard VIP list"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          onClick={handleRequestClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-[#43392f]/60 hover:text-[#43392f] transition-colors cursor-pointer"
        >
          <X size={20} strokeWidth={1.5} />
        </button>

        {status === "success" ? (
          <div className="w-full max-w-[500px] mx-auto text-center flex flex-col items-center justify-center gap-2">
            <CheckCircle2
              size={40}
              strokeWidth={1.5}
              className="text-emerald-500 mb-1"
            />
            <p className="text-[clamp(15px,2vw,19px)] font-medium tracking-[0.1em]">
              You&apos;re in.
            </p>
            <p className="text-[clamp(12px,1.4vw,14px)] opacity-70 leading-relaxed">
              We&apos;ll let you know before everyone else.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-[500px] mx-auto text-center flex flex-col justify-center gap-2">
            <h2 className="text-[#43392f] text-[clamp(13px,2vw,19px)] font-medium tracking-[0.1em] leading-snug m-0">
              JOIN THE MAMBO BEARD VIP LIST
            </h2>

            <p className="text-[#43392f] text-[clamp(11px,1.4vw,13px)] leading-snug opacity-70 m-0">
              Be first to access limited drops, exclusive releases and
              members-only offers.
            </p>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Enter your phone number"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (fieldError) setFieldError("");
                }}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={errorText ? "vip-error" : undefined}
                className="w-full bg-transparent border border-[#43392f]/25 px-4 py-2.5 text-center text-[#43392f] placeholder:text-[#43392f]/40 tracking-wider focus:border-[#43392f]/70 focus:outline-none transition-colors"
              />

              <p
                id="vip-error"
                role="alert"
                aria-hidden={!errorText}
                className="min-h-[16px] text-center text-[11px] leading-[16px] tracking-wide text-[#d64545] m-0"
              >
                {errorText}
              </p>

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full bg-[#43392f] text-[#f5fffa] uppercase tracking-[0.2em] text-sm font-medium py-2.5 hover:bg-[#332a23] active:scale-[0.99] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "loading" ? "JOINING…" : "GET EARLY ACCESS"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
