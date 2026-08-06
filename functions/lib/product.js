// Shared D1 product lookup — one source of truth for the product API and the
// edge SEO middleware. Returns the full product payload (colors, images,
// sizes, variants with live stock) so SEO metadata and API responses never
// drift.

import { ensureSchema } from "./schema.js";

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
      `SELECT id, slug, name, description, price, category, featured
       FROM products
       WHERE (slug = ? OR id = ?) AND active = 1
       LIMIT 1;`,
    )
    .bind(slug, slug)
    .first();

  if (!productResult) return null;

  const [colorsResult, imagesResult, variantsResult] = await Promise.all([
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
  ]);

  // Collect all unique sizes from variants
  const sizeSet = new Set();
  for (const variant of variantsResult.results) {
    sizeSet.add(variant.size);
  }
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
  const sizes = [...sizeSet].sort(
    (a, b) =>
      (sizeOrder.indexOf(a) === -1 ? 99 : sizeOrder.indexOf(a)) -
      (sizeOrder.indexOf(b) === -1 ? 99 : sizeOrder.indexOf(b)),
  );

  return {
    ...productResult,
    featured: productResult.featured === 1,
    colors: colorsResult.results.map((c) => ({
      id: c.id,
      name: c.name,
      hex: c.hex,
      sortOrder: c.sort_order,
    })),
    images: imagesResult.results.map((img) => ({
      id: img.id,
      colorId: img.color_id,
      path: img.path,
      type: img.type,
      sortOrder: img.sort_order,
      isPrimary: Boolean(img.is_primary),
    })),
    sizes,
    variants: variantsResult.results.map((v) => ({
      id: v.id,
      colorId: v.color_id,
      size: v.size,
      stock: v.stock,
    })),
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
