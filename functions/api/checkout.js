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

export const onRequest = async ({ request, env }) => {
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

    const productIds = [...new Set(cart.map((item) => item.id))];

    const productsResult = await env.D1.prepare(
      `SELECT id, price FROM products WHERE id IN (${productIds.map(() => "?").join(",")});`,
    )
      .bind(...productIds)
      .all();

    const productsById = new Map(
      productsResult.results.map((product) => [product.id, product]),
    );

    let subtotal = 0;
    const inventoryChecks = [];

    cart.forEach((item) => {
      const product = productsById.get(item.id);
      if (!product) {
        throw new Error(`Product not found: ${item.id}`);
      }

      subtotal += Number(product.price) * Number(item.quantity || 1);
      inventoryChecks.push({
        productId: item.id,
        colorId: item.selectedColorId,
        sizeId: item.selectedSizeId,
        quantity: Number(item.quantity || 1),
      });
    });

    const inventoryRows = await Promise.all(
      inventoryChecks.map(async (check) => {
        const row = await env.D1.prepare(
          `SELECT id, stock FROM inventory WHERE product_id = ? AND color_id = ? AND size_id = ? LIMIT 1;`,
        )
          .bind(check.productId, check.colorId, check.sizeId)
          .first();

        if (!row) {
          throw new Error("Selected product variant is not available.");
        }

        if (row.stock < check.quantity) {
          throw new Error("Selected variant is out of stock.");
        }

        return {
          inventoryId: row.id,
          remainingStock: row.stock - check.quantity,
        };
      }),
    );

    const deliveryFee = DELIVERY_FEES[zone] ?? DELIVERY_FEES.Other;
    const total = subtotal + deliveryFee;
    const orderNumber = generateOrderNumber();
    const orderId = crypto.randomUUID();

    await env.D1.prepare(
      `INSERT INTO orders (id, order_number, customer_name, phone, email, location, delivery_fee, subtotal, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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

    await Promise.all(
      cart.map((item) => {
        const orderItemId = crypto.randomUUID();
        return env.D1.prepare(
          `INSERT INTO order_items (id, order_id, product_id, color_id, size_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        )
          .bind(
            orderItemId,
            orderId,
            item.id,
            item.selectedColorId,
            item.selectedSizeId,
            item.quantity,
            item.price,
          )
          .run();
      }),
    );

    await Promise.all(
      inventoryChecks.map((check) =>
        env.D1.prepare(`UPDATE inventory SET stock = ? WHERE id = ?;`)
          .bind(check.remainingStock, check.inventoryId)
          .run(),
      ),
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
};
