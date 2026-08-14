export const seedProducts = async (db) => {
  const now = "2026-08-01T00:00:00.000Z";

  await db
    .prepare(
      `INSERT INTO products (id, name, slug, description, price, category, featured, active, variation_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "prod-1",
      "Classic Beard Oil",
      "classic-beard-oil",
      "A cedar-scented blend.",
      24,
      "Care",
      1,
      1,
      "color_size",
      now,
      now,
      "prod-2",
      "Precision Beard Trimmer",
      "precision-beard-trimmer",
      "Rechargeable trimmer.",
      89,
      "Tools",
      0,
      1,
      "color",
      now,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO product_colors (id, product_id, name, hex, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "color-1",
      "prod-1",
      "Amber",
      "#b97a1b",
      1,
      now,
      now,
      "color-2",
      "prod-2",
      "Matte Black",
      "#111827",
      1,
      now,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO product_images (id, product_id, color_id, path, type, file_name, size, uploaded_at, is_primary, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "img-1",
      "prod-1",
      "color-1",
      "products/classic-beard-oil/amber/front.webp",
      "front",
      "front.webp",
      1000,
      now,
      1,
      1,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO product_variants (id, product_id, color_id, size, stock)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind("v1", "prod-1", "color-1", "M", 5)
    .run();

  // Inventory mirror row (size_id references the seeded sizes table).
  await db
    .prepare(
      `INSERT INTO inventory (id, product_id, color_id, size_id, stock)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind("inv-1", "prod-1", "color-1", "size-m", 5)
    .run();
};
