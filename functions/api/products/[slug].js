export const onRequest = async ({ env, params }) => {
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
    const productResult = await env.D1.prepare(
      `SELECT id, slug, name, description, price, category, featured FROM products WHERE slug = ? OR id = ? LIMIT 1;`,
    )
      .bind(slug, slug)
      .first();

    if (!productResult) {
      return new Response(JSON.stringify({ message: "Product not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [colorsResult, imagesResult, sizesResult, inventoryResult] =
      await Promise.all([
        env.D1.prepare(
          `SELECT id, name, hex FROM product_colors WHERE product_id = ? ORDER BY name ASC;`,
        )
          .bind(productResult.id)
          .all(),
        env.D1.prepare(
          `SELECT id, color_id, image_url, sort_order FROM product_images WHERE product_id = ? ORDER BY color_id, sort_order ASC;`,
        )
          .bind(productResult.id)
          .all(),
        env.D1.prepare(`SELECT id, name FROM sizes ORDER BY name ASC;`).all(),
        env.D1.prepare(
          `SELECT id, color_id, size_id, stock FROM inventory WHERE product_id = ? ORDER BY color_id, size_id;`,
        )
          .bind(productResult.id)
          .all(),
      ]);

    return new Response(
      JSON.stringify({
        product: {
          ...productResult,
          colors: colorsResult.results,
          images: imagesResult.results,
          sizes: sizesResult.results,
          inventory: inventoryResult.results,
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
};
