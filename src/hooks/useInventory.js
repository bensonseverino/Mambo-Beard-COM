import { useEffect, useState, useCallback } from "react";
import { getInventory } from "../services/api";

/**
 * Hook to fetch inventory (variant stock) for a product.
 * Returns inventory array and a helper to check stock for a specific color + size.
 */
export default function useInventory(productId) {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getInventory(productId)
      .then((items) => {
        if (!cancelled) {
          setInventory(items);
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
  }, [productId]);

  /**
   * Get stock count for a specific color + size combination.
   * Returns 0 if the variant doesn't exist.
   */
  const getStock = useCallback(
    (colorId, size) => {
      const variant = inventory.find(
        (v) => v.color_id === colorId && v.size === size,
      );
      return variant ? variant.stock : 0;
    },
    [inventory],
  );

  /**
   * Check if any stock exists for a given color.
   */
  const hasAnyStock = useCallback(
    (colorId) => {
      return inventory.some((v) => v.color_id === colorId && v.stock > 0);
    },
    [inventory],
  );

  return { inventory, loading, error, getStock, hasAnyStock };
}
