import { ensureSchema } from "../lib/schema.js";

const VARIATION_TYPES = ["none", "color", "size", "color_size"];

export async function onRequestGet(context) {
  const { env, request } = context;

  try {
    await ensureSchema(env);
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const featured = url.searchParams.get("featured");
    const search = url.searchParams.get("search");
    const sort = url.searchParams.get("sort"); // newest, price_asc, price_desc, featured

    // Build WHERE clause
    const conditions = ["p.active = 1"];
    const bindings = [];

    if (category) {
      conditions.push("p.category = ?");
      bindings.push(category);
    }

    if (featured === "1") {
      conditions.push("p.featured = 1");
    }

    if (search) {
      conditions.push("(p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)");
      const term = `%${search}%`;
      bindings.push(term, term, term);
    }

    // Build ORDER BY
    let orderBy = "p.created_at DESC";
    switch (sort) {
      case "price_asc":
        orderBy = "p.price ASC";
        break;
      case "price_desc":
        orderBy = "p.price DESC";
        break;
      case "featured":
        orderBy = "p.featured DESC, p.created_at DESC";
        break;
      case "newest":
      default:
        orderBy = "p.created_at DESC";
        break;
    }

    const whereClause = conditions.join(" AND ");

    const query = `
      SELECT
        p.id AS product_id,
        p.slug,
        p.name,
        p.description,
        p.price,
        p.category,
        p.featured,
        p.product_type,
        p.variation_type
      FROM products p
      WHERE ${whereClause}
      ORDER BY ${orderBy};
    `;

    const stmt = env.DB.prepare(query);
    const result = bindings.length
      ? await stmt.bind(...bindings).all()
      : await stmt.all();

    const products = (result.results || []).map((row) => ({
      id: row.product_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      price: row.price,
      category: row.category,
      featured: row.featured === 1,
      variationType: VARIATION_TYPES.includes(row.variation_type)
        ? row.variation_type
        : row.product_type === "simple"
          ? "none"
          : "color_size",
      colors: [],
      thumbnail: null,
    }));

    if (!products.length) {
      return new Response(
        JSON.stringify({ products: [] }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60, s-maxage=60",
          },
        },
      );
    }

    const productIds = products.map((product) => product.id);
    const placeholders = productIds.map(() => "?").join(",");

    // Colors — only surfaced for color-bearing products.
    const colorsResult = await env.DB.prepare(
      `SELECT id, product_id, name, hex
       FROM product_colors
       WHERE product_id IN (${placeholders})
       ORDER BY sort_order ASC`,
    )
      .bind(...productIds)
      .all();

    const colorsByProduct = new Map();
    for (const color of colorsResult.results || []) {
      const existing = colorsByProduct.get(color.product_id) || [];
      existing.push({ id: color.id, name: color.name, hex: color.hex });
      colorsByProduct.set(color.product_id, existing);
    }

    // Thumbnail — the product's primary image, or the first image in sort
    // order. Works for per-color images AND color-less gallery images.
    const imagesResult = await env.DB.prepare(
      `SELECT product_id, path, is_primary, sort_order
       FROM product_images
       WHERE product_id IN (${placeholders})
       ORDER BY is_primary DESC, sort_order ASC, uploaded_at DESC`,
    )
      .bind(...productIds)
      .all();

    const thumbnailByProduct = new Map();
    for (const image of imagesResult.results || []) {
      if (!thumbnailByProduct.has(image.product_id)) {
        thumbnailByProduct.set(image.product_id, image.path);
      }
    }

    for (const product of products) {
      const hasColor =
        product.variationType === "color" ||
        product.variationType === "color_size";
      product.colors = hasColor ? colorsByProduct.get(product.id) || [] : [];
      product.thumbnail = thumbnailByProduct.get(product.id) || null;
    }

    return new Response(
      JSON.stringify({ products }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ message: error.message || "Unable to load products." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
