// Shared D1 product lookup — one source of truth for the product API and the
// edge SEO middleware. Returns the full product payload (colors, images,
// sizes, variants with live stock) so SEO metadata and API responses never
// drift.
//
// Every product carries a `variation_type`:
//   none       → simple product: one stock figure, no colors, no sizes
//   color      → colors only (one stock figure per color)
//   size       → sizes only (one stock figure per size)
//   color_size → colors and sizes (stock per color × size combination)
//
// The `inventory` table is the single source of stock; `product_variants` is
// only maintained for color_size products (legacy mirror). Color-only rows
// have size_id NULL, size-only rows have color_id NULL, and simple rows have
// both NULL.

import { ensureSchema } from "./schema.js";

const VARIATION_TYPES = ["none", "color", "size", "color_size"];

const STANDARD_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];
const sizeRank = (name) => {
  const index = STANDARD_SIZE_ORDER.indexOf(String(name || "").trim());
  return index === -1 ? STANDARD_SIZE_ORDER.length : index;
};
const sortSizes = (sizes) =>
  [...sizes].sort((a, b) => sizeRank(a.name) - sizeRank(b.name));

/**
 * Fetch a single active product by slug (or id) with its colors, images,
 * sizes and variants. Returns null when missing or unpublished.
 */
export async function getProductBySlug(env, slug) {
  const db = env?.DB;
  if (!db) return null;

  await ensureSchema(env);

  const productResult = await db
    .prepare(
      `SELECT id, slug, name, description, price, category, featured,
              product_type, variation_type, updated_at
       FROM products
       WHERE (slug = ? OR id = ?) AND active = 1
       LIMIT 1;`,
    )
    .bind(slug, slug)
    .first();

  if (!productResult) return null;

  const variationType = VARIATION_TYPES.includes(productResult.variation_type)
    ? productResult.variation_type
    : productResult.product_type === "simple"
      ? "none"
      : "color_size";
  const hasColor = variationType === "color" || variationType === "color_size";
  const hasSize = variationType === "size" || variationType === "color_size";

  const [colorsResult, imagesResult, variantsResult, inventoryResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT id, name, hex, sort_order
           FROM product_colors
           WHERE product_id = ?
           ORDER BY sort_order ASC;`,
        )
        .bind(productResult.id)
        .all(),
      db
        .prepare(
          `SELECT id, color_id, path, type, sort_order, is_primary
           FROM product_images
           WHERE product_id = ?
           ORDER BY color_id, sort_order ASC;`,
        )
        .bind(productResult.id)
        .all(),
      db
        .prepare(
          `SELECT id, color_id, size, stock
           FROM product_variants
           WHERE product_id = ?
           ORDER BY color_id, size ASC;`,
        )
        .bind(productResult.id)
        .all(),
      db
        .prepare(
          `SELECT i.color_id, i.size_id, i.stock, s.name AS size_name
           FROM inventory i
           LEFT JOIN sizes s ON s.id = i.size_id
           WHERE i.product_id = ?
           ORDER BY i.color_id, i.size_id;`,
        )
        .bind(productResult.id)
        .all(),
    ]);

  let inventoryRows = inventoryResult.results || [];
  if (variationType === "color_size" && !inventoryRows.length) {
    // Legacy fallback: products created before the inventory mirror shipped.
    inventoryRows = (variantsResult.results || []).map((variant) => ({
      color_id: variant.color_id,
      size_id: null,
      size_name: variant.size,
      stock: variant.stock,
    }));
  }

  // Colors are only meaningful for color-bearing products.
  const colors = hasColor
    ? (colorsResult.results || []).map((c) => ({
        id: c.id,
        name: c.name,
        hex: c.hex,
        sortOrder: c.sort_order,
      }))
    : [];

  // Every product image (per-color for color products, color-less gallery
  // for simple/size-only products).
  const images = (imagesResult.results || []).map((img) => ({
    id: img.id,
    colorId: img.color_id,
    path: img.path,
    type: img.type,
    sortOrder: img.sort_order,
    isPrimary: Boolean(img.is_primary),
  }));

  // Unified variant rows. Simple products carry none (stock lives in
  // `stock`); color-only rows have a NULL size; size-only rows a NULL color.
  const variants =
    variationType === "none"
      ? []
      : inventoryRows.map((row) => ({
          colorId: row.color_id,
          size: row.size_name || null,
          sizeId: row.size_id,
          stock: Number(row.stock) || 0,
        }));

  // The sizes a size-bearing product actually offers, in canonical order.
  let sizes = [];
  if (hasSize) {
    const seen = new Map();
    for (const row of inventoryRows) {
      if (row.size_id == null || !row.size_name) continue;
      if (!seen.has(row.size_id)) {
        seen.set(row.size_id, { id: row.size_id, name: row.size_name });
      }
    }
    sizes = sortSizes([...seen.values()]);
  }

  return {
    ...productResult,
    featured: productResult.featured === 1,
    variationType,
    colors,
    images,
    sizes,
    variants,
    // Simple products: the single product-level stock figure.
    stock: variationType === "none" ? Number(inventoryRows[0]?.stock) || 0 : null,
  };
}

/**
 * Lightweight listing of active products (used for homepage/collection
 * structured data) — only the fields structured data needs.
 */
export async function listActiveProducts(env, { category } = {}) {
  const db = env?.DB;
  if (!db) return [];

  await ensureSchema(env);

  const conditions = ["active = 1"];
  const bindings = [];
  if (category) {
    conditions.push("LOWER(category) = LOWER(?)");
    bindings.push(category);
  }

  const result = await db
    .prepare(
      `SELECT slug, name, updated_at
       FROM products
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC;`,
    )
    .bind(...bindings)
    .all();

  return result?.results || [];
}
