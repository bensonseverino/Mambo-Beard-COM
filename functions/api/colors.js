export async function onRequestGet(context) {
  const { env } = context;

  try {
    const result = await env.DB.prepare(
      `SELECT DISTINCT c.name, c.hex
       FROM product_colors c
       INNER JOIN products p ON p.id = c.product_id
       WHERE p.active = 1
       ORDER BY c.name ASC;`,
    ).all();

    const colors = result.results.map((row) => ({
      name: row.name,
      hex: row.hex,
    }));

    return new Response(JSON.stringify({ colors }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ message: error.message || "Unable to load colors." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
