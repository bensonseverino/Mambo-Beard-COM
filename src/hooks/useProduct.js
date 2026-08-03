import { useEffect, useState } from "react";
import { getProduct } from "../services/api";

/**
 * Hook to fetch a single product by slug or id.
 * Returns the full product object with colors, images, sizes, and variants.
 */
export default function useProduct(slug) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getProduct(slug)
      .then((payload) => {
        if (!cancelled) {
          setProduct(payload);
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
  }, [slug]);

  return { product, loading, error };
}
