const DELIVERY_FEES = {
  "Nairobi CBD": 200,
  Westlands: 150,
  Kilimani: 150,
  Thika: 300,
  Mombasa: 400,
  Other: 500,
};

const generateOrderNumber = () => {
  const date = new Date();
  const format = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `MB-${format}-${suffix}`;
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { name, phone, email, zone, customLocation, cart } = body || {};

    if (
      !name ||
      !phone ||
      !email ||
      !zone ||
      !Array.isArray(cart) ||
      cart.length === 0
    ) {
      return new Response(
        JSON.stringify({ message: "Missing checkout fields." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const selectedLocation = zone === "Other" ? customLocation : zone;
    if (!selectedLocation) {
      return new Response(
        JSON.stringify({ message: "Delivery location is required." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Verify product prices from DB
    const productIds = [...new Set(cart.map((item) => item.productId))];

    const productsResult = await env.DB.prepare(
      `SELECT id, price FROM products WHERE id IN (${productIds.map(() => "?").join(",")}) AND active = 1;`,
    )
      .bind(...productIds)
      .all();

    const productsById = new Map(
      productsResult.results.map((product) => [product.id, product]),
    );

    let subtotal = 0;
    const variantChecks = [];

    for (const item of cart) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const qty = Number(item.quantity || 1);
      subtotal += Number(product.price) * qty;

      // Look up the variant by product_id + color_id + size
      const variant = await env.DB.prepare(
        `SELECT id, stock FROM product_variants
         WHERE product_id = ? AND color_id = ? AND size = ?
         LIMIT 1;`,
      )
        .bind(item.productId, item.colorId, item.size)
        .first();

      if (!variant) {
        throw new Error("Selected product variant is not available.");
      }

      if (variant.stock < qty) {
        throw new Error("Selected variant is out of stock.");
      }

      variantChecks.push({
        variantId: variant.id,
        remainingStock: variant.stock - qty,
        productId: item.productId,
        colorId: item.colorId,
        size: item.size,
        quantity: qty,
        price: Number(product.price),
      });
    }

    const deliveryFee = DELIVERY_FEES[zone] ?? DELIVERY_FEES.Other;
    const total = subtotal + deliveryFee;
    const orderNumber = generateOrderNumber();
    const orderId = crypto.randomUUID();

    // Insert order
    await env.DB.prepare(
      `INSERT INTO orders (id, order_number, customer_name, phone, email, location, delivery_fee, subtotal, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    )
      .bind(
        orderId,
        orderNumber,
        name,
        phone,
        email,
        selectedLocation,
        deliveryFee,
        subtotal,
        total,
      )
      .run();

    // Insert order items and decrement stock
    await Promise.all(
      variantChecks.map(async (check) => {
        const orderItemId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO order_items (id, order_id, product_id, color_id, size, quantity, price)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
        )
          .bind(
            orderItemId,
            orderId,
            check.productId,
            check.colorId,
            check.size,
            check.quantity,
            check.price,
          )
          .run();

        await env.DB.prepare(
          `UPDATE product_variants SET stock = ? WHERE id = ?;`,
        )
          .bind(check.remainingStock, check.variantId)
          .run();
      }),
    );

    return new Response(JSON.stringify({ orderNumber }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ message: error.message || "Unable to create order." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
