export const onRequest = async ({ env }) => {
  try {
    const query = `
      SELECT
        p.id as product_id,
        p.slug,
        p.name,
        p.description,
        p.price,
        p.category,
        p.featured,
        c.id as color_id,
        c.name as color_name,
        c.hex as color_hex,
        pi.image_url as thumbnail
      FROM products p
      LEFT JOIN product_colors c ON c.product_id = p.id
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.color_id = c.id AND pi.sort_order = 1
      ORDER BY p.created_at DESC, c.name ASC;
    `;

    const result = await env.D1.prepare(query).all();
    const productsById = new Map();

    result.results.forEach((row) => {
      if (!row.product_id) return;

      if (!productsById.has(row.product_id)) {
        productsById.set(row.product_id, {
          id: row.product_id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          price: row.price,
          category: row.category,
          featured: row.featured === 1,
          thumbnail: row.thumbnail || null,
          colors: [],
        });
      }

      const product = productsById.get(row.product_id);

      if (
        row.color_id &&
        !product.colors.some((item) => item.id === row.color_id)
      ) {
        product.colors.push({
          id: row.color_id,
          name: row.color_name,
          hex: row.color_hex,
        });
      }

      if (!product.thumbnail && row.thumbnail) {
        product.thumbnail = row.thumbnail;
      }
    });

    return new Response(
      JSON.stringify({ products: Array.from(productsById.values()) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
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
};
