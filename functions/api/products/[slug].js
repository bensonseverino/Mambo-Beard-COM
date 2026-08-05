import { ensureSchema } from "../../lib/schema.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug) {
    return new Response(
      JSON.stringify({ message: "Product slug is required." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    await ensureSchema(env);

    // Look up by slug or id, only active products
    const productResult = await env.DB.prepare(
      `SELECT id, slug, name, description, price, category, featured
       FROM products
       WHERE (slug = ? OR id = ?) AND active = 1
       LIMIT 1;`,
    )
      .bind(slug, slug)
      .first();

    if (!productResult) {
      return new Response(JSON.stringify({ message: "Product not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [colorsResult, imagesResult, variantsResult] = await Promise.all([
      env.DB.prepare(
        `SELECT id, name, hex, sort_order
         FROM product_colors
         WHERE product_id = ?
         ORDER BY sort_order ASC;`,
      )
        .bind(productResult.id)
        .all(),
      env.DB.prepare(
        `SELECT id, color_id, path, sort_order, is_primary
         FROM product_images
         WHERE product_id = ?
         ORDER BY color_id, sort_order ASC;`,
      )
        .bind(productResult.id)
        .all(),
      env.DB.prepare(
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
    for (const v of variantsResult.results) {
      sizeSet.add(v.size);
    }
    const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
    const sizes = [...sizeSet].sort(
      (a, b) => (sizeOrder.indexOf(a) === -1 ? 99 : sizeOrder.indexOf(a))
            - (sizeOrder.indexOf(b) === -1 ? 99 : sizeOrder.indexOf(b)),
    );

    return new Response(
      JSON.stringify({
        product: {
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
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ message: error.message || "Unable to load product." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
