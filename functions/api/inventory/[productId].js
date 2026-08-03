export const onRequest = async ({ env, params }) => {
  const productId = params.productId;

  if (!productId) {
    return new Response(
      JSON.stringify({ message: "Product ID or slug is required." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const inventory = await env.D1.prepare(
      `SELECT i.id, i.product_id, i.color_id, i.size_id, i.stock
       FROM inventory i
       LEFT JOIN products p ON p.id = i.product_id
       WHERE i.product_id = ? OR p.slug = ?
       ORDER BY i.color_id, i.size_id;`,
    )
      .bind(productId, productId)
      .all();

    return new Response(JSON.stringify({ inventory: inventory.results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ message: error.message || "Unable to load inventory." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
