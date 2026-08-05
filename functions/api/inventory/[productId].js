import { ensureSchema } from "../../lib/schema.js";

export async function onRequestGet(context) {
  const { env, params } = context;
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
    await ensureSchema(env);

    const inventory = await env.DB.prepare(
      `SELECT pv.id, pv.product_id, pv.color_id, pv.size, pv.stock
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE (pv.product_id = ? OR p.slug = ?)
       ORDER BY pv.color_id, pv.size ASC;`,
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
}
