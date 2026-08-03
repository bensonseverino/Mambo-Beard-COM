import { useEffect, useState, useRef } from "react";
import { getProducts } from "../services/api";

/**
 * Hook to fetch published products with optional filters.
 * Re-fetches whenever filters change.
 *
 * @param {Object} [filters]
 * @param {string} [filters.category]
 * @param {string} [filters.featured]
 * @param {string} [filters.search]
 * @param {string} [filters.sort]
 */
export default function useProducts(filters = {}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Serialize filters to detect changes without infinite loops
  const filterKey = JSON.stringify(filters);
  const prevFilterKey = useRef(filterKey);

  useEffect(() => {
    let cancelled = false;

    // Reset loading on filter change
    if (prevFilterKey.current !== filterKey) {
      setLoading(true);
      prevFilterKey.current = filterKey;
    }

    getProducts(filters)
      .then((items) => {
        if (!cancelled) {
          setProducts(items);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filterKey]);

  return { products, loading, error };
}
