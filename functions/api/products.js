export async function onRequestGet(context) {
  const { env, request } = context;

  try {
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
        c.id AS color_id,
        c.name AS color_name,
        c.hex AS color_hex,
        c.sort_order AS color_sort,
        pi.path AS thumbnail
      FROM products p
      LEFT JOIN product_colors c ON c.product_id = p.id
      LEFT JOIN product_images pi
        ON pi.product_id = p.id
        AND pi.color_id = c.id
        AND pi.sort_order = 1
      WHERE ${whereClause}
      ORDER BY ${orderBy}, c.sort_order ASC;
    `;

    const stmt = env.DB.prepare(query);
    const result = bindings.length
      ? await stmt.bind(...bindings).all()
      : await stmt.all();

    const productsById = new Map();

    for (const row of result.results) {
      if (!row.product_id) continue;

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
        !product.colors.some((c) => c.id === row.color_id)
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
    }

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
}
