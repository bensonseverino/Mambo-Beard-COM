import { useEffect, useState } from "react";
import { getYeQuote, FALLBACK_QUOTE } from "../services/yeQuote";

const STORAGE_KEY = "mambobeard.dailyYeQuote";

// Dedupe concurrent fetches (e.g. React StrictMode double-mount in dev)
// so at most one network request is made per session.
let inflightFetch = null;

/** Local calendar date as YYYY-MM-DD (used to compare cache freshness). */
const getTodayKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const readCache = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.date === "string" &&
      typeof parsed.quote === "string" &&
      parsed.quote.trim()
    ) {
      return parsed;
    }
  } catch {
    // Corrupt cache — ignore and fetch fresh.
  }
  return null;
};

const writeCache = (quote) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: getTodayKey(), quote })
    );
  } catch {
    // Storage unavailable (private mode / quota) — quote still displays.
  }
};

/**
 * Provides the daily Kanye quote, cached per calendar day in Local Storage.
 *
 * - Renders instantly when today's quote is already cached.
 * - Otherwise fetches once, caches the result, and displays it.
 * - If the fetch fails, falls back to a cached fallback quote for the day.
 *
 * @returns {{ quote: string, loading: boolean, error: string | null }}
 */
export default function useDailyYeQuote() {
  // Lazy-initialize from the cache so a cached quote renders instantly
  // (no loading flash) and no fetch is scheduled for the rest of the day.
  const cached = readCache();
  const isCachedToday = cached?.date === getTodayKey();

  const [quote, setQuote] = useState(isCachedToday ? cached.quote : "");
  const [loading, setLoading] = useState(!isCachedToday);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isCachedToday) return undefined;

    let cancelled = false;

    const fetchQuote = async () => {
      try {
        if (!inflightFetch) {
          inflightFetch = getYeQuote().finally(() => {
            inflightFetch = null;
          });
        }
        const fresh = await inflightFetch;
        // Cache even if the component unmounted mid-flight so the quote is
        // not fetched again on the next visit this day.
        writeCache(fresh);
        if (cancelled) return;
        setQuote(fresh);
        setError(null);
      } catch (err) {
        writeCache(FALLBACK_QUOTE);
        if (cancelled) return;
        setError(err.message);
        setQuote(FALLBACK_QUOTE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchQuote();

    return () => {
      cancelled = true;
    };
  }, [isCachedToday]);

  return { quote, loading, error };
}
