import { ensureSchema } from "../lib/schema.js";

export async function onRequestGet(context) {
  const { env } = context;

  try {
    await ensureSchema(env);
    const result = await env.DB.prepare(
      `SELECT DISTINCT category FROM products WHERE active = 1 AND category IS NOT NULL ORDER BY category ASC;`,
    ).all();

    const categories = result.results.map((row) => row.category);

    return new Response(JSON.stringify({ categories }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error.message || "Unable to load categories.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
