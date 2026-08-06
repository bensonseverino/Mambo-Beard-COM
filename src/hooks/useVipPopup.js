import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { subscribe } from "../services/subscribers";

const STORAGE_KEY = "vipPopup";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const MIN_DELAY_MS = 20_000;
const MAX_DELAY_MS = 45_000;
const PRODUCTS_REQUIRED = 3;

const readStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
};

const writeStorage = (patch) => {
  try {
    const current = readStorage() || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Storage unavailable — popup still works, rules just reset next visit.
  }
};

/**
 * Decide whether the popup may appear:
 * - subscribed → never again
 * - closed → wait 7 days before showing again
 * - no storage → new visitor, may show
 */
const mayShow = () => {
  const data = readStorage();
  if (!data) return true;
  if (data.subscribed) return false;
  if (data.closedAt) {
    const closedAt = new Date(data.closedAt).getTime();
    if (!Number.isNaN(closedAt) && Date.now() - closedAt < SEVEN_DAYS) {
      return false;
    }
  }
  return true;
};

/**
 * VIP SMS popup controller.
 *
 * Shows the popup when the visitor is new AND one of these fires:
 * - a random 20–45s timer after landing, or
 * - the visitor views three different products, or
 * - the visitor scrolls 60% down the homepage.
 *
 * @returns {{
 *   open: boolean,
 *   status: "idle" | "loading" | "success" | "error",
 *   close: () => void,
 *   join: (phone: string) => Promise<void>,
 * }}
 */
export default function useVipPopup() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const location = useLocation();

  const shownRef = useRef(false);
  const seenProductsRef = useRef(new Set());
  const loadingRef = useRef(false);

  const show = useCallback(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    setStatus("idle");
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    writeStorage({ closedAt: new Date().toISOString() });
    setOpen(false);
  }, []);

  const join = useCallback(async (phone) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStatus("loading");
    try {
      await subscribe(phone);
      writeStorage({ subscribed: true });
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Trigger 1: random 20–45s after landing. Mount-only so navigation does
  // not re-arm it; StrictMode's effect re-run simply re-arms one timer, and
  // `shownRef` / `mayShow()` keep it from ever showing twice.
  useEffect(() => {
    if (!mayShow()) return undefined;
    const delay =
      MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    const timer = setTimeout(show, delay);
    return () => clearTimeout(timer);
  }, [show]);

  // Triggers 2 & 3: 60% scroll down the homepage + three products viewed.
  useEffect(() => {
    if (!mayShow()) return undefined;

    let removeScrollListener = () => {};
    if (location.pathname === "/") {
      const onScroll = () => {
        const doc = document.documentElement;
        const progress =
          (window.scrollY + window.innerHeight) / doc.scrollHeight;
        if (progress >= 0.6) show();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      removeScrollListener = () =>
        window.removeEventListener("scroll", onScroll);
    }

    const match = location.pathname.match(/^\/product\/([^/]+)/);
    if (match) {
      seenProductsRef.current.add(match[1]);
      if (seenProductsRef.current.size >= PRODUCTS_REQUIRED) {
        // Defer out of the effect body to avoid a synchronous state update.
        queueMicrotask(show);
      }
    }

    return () => removeScrollListener();
  }, [location.pathname, show]);

  return { open, status, close, join };
}
