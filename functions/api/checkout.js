// Storefront checkout.
//
// Request:  POST /api/checkout
//   { name, phone, email, zone, customLocation, cart: [{ productId, colorId, size, quantity }] }
// Success:  201 { success: true, orderId, orderNumber, subtotal, deliveryFee, total }
// Errors:   4xx { success: false, message, code } — business errors
//           5xx { success: false, message, code: "D1_ERROR" } — masked server errors
//
// The frontend only consumes `orderNumber` (WhatsApp message) and `message`
// (alert text), so this stays compatible with the existing UI.
//
// The whole write — customer upsert, order, order items, and guarded stock
// deductions — runs in a single D1 batch, which is atomic: if any statement
// fails, nothing is written.

import { apiError, ensureSchema } from "../lib/schema.js";

const DELIVERY_FEES = {
  "Nairobi CBD": 200,
  Westlands: 150,
  Kilimani: 150,
  Thika: 300,
  Mombasa: 400,
  Other: 500,
};

const pad4 = (value) => String(value).padStart(4, "0");

/**
 * Sequential order number in the form MB-YYYYMMDD-0001 (per day).
 */
const generateOrderNumber = async (env, date = new Date()) => {
  const prefix = `MB-${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}${String(date.getDate()).padStart(2, "0")}`;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM orders WHERE order_number LIKE ?",
  )
    .bind(`${prefix}-%`)
    .first();
  const seq = (Number(row?.count) || 0) + 1;
  return `${prefix}-${pad4(seq)}`;
};

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      throw apiError("D1_BINDING_ERROR", "Database is not configured.", 500);
    }
    // Self-healing: the shared D1 must always contain the full schema.
    await ensureSchema(env);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw apiError("INVALID_PAYLOAD", "Invalid JSON body.", 400);
    }

    const { name, phone, email, zone, customLocation, cart } = body;

    if (
      !name?.trim() ||
      !phone?.trim() ||
      !email?.trim() ||
      !zone?.trim() ||
      !Array.isArray(cart) ||
      cart.length === 0
    ) {
      throw apiError("INVALID_PAYLOAD", "Missing checkout fields.", 400);
    }

    const selectedLocation = zone === "Other" ? customLocation : zone;
    if (!selectedLocation?.trim()) {
      throw apiError("INVALID_PAYLOAD", "Delivery location is required.", 400);
    }

    // Validate + merge duplicate cart lines (same product/color/size).
    const merged = new Map();
    for (const item of cart) {
      if (!item?.productId || !item?.colorId || !item?.size) {
        throw apiError(
          "INVALID_PAYLOAD",
          "Cart items are missing product, color, or size.",
          400,
        );
      }
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const key = `${item.productId}|${item.colorId}|${item.size}`;
      merged.set(key, {
        ...item,
        quantity: (merged.get(key)?.quantity || 0) + quantity,
      });
    }
    const items = [...merged.values()];

    // Verify products + prices from the database (never trust client prices).
    const productIds = [...new Set(items.map((item) => item.productId))];
    const productsResult = await env.DB.prepare(
      `SELECT id, name, price FROM products WHERE id IN (${productIds
        .map(() => "?")
        .join(",")}) AND active = 1`,
    )
      .bind(...productIds)
      .all();

    const productsById = new Map(
      (productsResult.results || []).map((product) => [product.id, product]),
    );

    let subtotal = 0;
    const validated = [];

    for (const item of items) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw apiError("PRODUCT_NOT_FOUND", "Product not found.", 404);
      }

      const variant = await env.DB.prepare(
        `SELECT id, stock FROM product_variants
         WHERE product_id = ? AND color_id = ? AND size = ?
         LIMIT 1`,
      )
        .bind(item.productId, item.colorId, item.size)
        .first();

      if (!variant) {
        throw apiError(
          "VARIANT_NOT_FOUND",
          "Selected size is not available.",
          400,
        );
      }

      if (variant.stock < item.quantity) {
        throw apiError(
          "INSUFFICIENT_STOCK",
          `Insufficient stock for ${product.name} (${item.size}). Only ${variant.stock} left.`,
          400,
        );
      }

      // Resolve the size id so the admin's inventory mirror stays accurate.
      const sizeRow = await env.DB.prepare(
        "SELECT id FROM sizes WHERE name = ?",
      )
        .bind(item.size)
        .first();

      const price = Number(product.price);
      subtotal += price * item.quantity;
      validated.push({
        ...item,
        variantId: variant.id,
        sizeId: sizeRow?.id || null,
        price,
      });
    }

    const deliveryFee = DELIVERY_FEES[zone] ?? DELIVERY_FEES.Other;
    const total = subtotal + deliveryFee;
    const orderNumber = await generateOrderNumber(env);
    const orderId = crypto.randomUUID();

    // Customer: find by phone so checkout updates or creates the record.
    const existingCustomer = await env.DB.prepare(
      "SELECT id FROM customers WHERE phone = ?",
    )
      .bind(phone)
      .first();

    // Atomic write: customer + order + items + guarded stock deduction in
    // one batch. New customers use an upsert keyed on phone, so two
    // concurrent first orders for the same phone still merge into one row.
    const statements = [
      existingCustomer
        ? env.DB.prepare(
            `UPDATE customers SET name = ?, email = ?, location = ?,
             total_orders = total_orders + 1, lifetime_spend = lifetime_spend + ?,
             last_order_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).bind(name, email, selectedLocation, total, existingCustomer.id)
        : env.DB.prepare(
            `INSERT INTO customers (id, phone, name, email, location, total_orders, lifetime_spend, last_order_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(phone) DO UPDATE SET
               name = excluded.name,
               email = excluded.email,
               location = excluded.location,
               total_orders = customers.total_orders + 1,
               lifetime_spend = customers.lifetime_spend + excluded.lifetime_spend,
               last_order_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP`,
          ).bind(
            crypto.randomUUID(),
            phone,
            name,
            email,
            selectedLocation,
            total,
          ),
      env.DB.prepare(
        `INSERT INTO orders (id, order_number, customer_name, phone, email, location, delivery_fee, subtotal, total, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      ).bind(
        orderId,
        orderNumber,
        name,
        phone,
        email,
        selectedLocation,
        deliveryFee,
        subtotal,
        total,
      ),
    ];

    for (const check of validated) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO order_items (id, order_id, product_id, color_id, size, quantity, price)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          orderId,
          check.productId,
          check.colorId,
          check.size,
          check.quantity,
          check.price,
        ),
        env.DB.prepare(
          `UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?`,
        ).bind(check.quantity, check.variantId, check.quantity),
      );

      // Keep the admin's inventory mirror (product/color/size_id) in sync.
      if (check.sizeId) {
        statements.push(
          env.DB.prepare(
            `UPDATE inventory SET stock = stock - ? WHERE product_id = ? AND color_id = ? AND size_id = ? AND stock >= ?`,
          ).bind(
            check.quantity,
            check.productId,
            check.colorId,
            check.sizeId,
            check.quantity,
          ),
        );
      }
    }

    const batchResults = await env.DB.batch(statements);
    if (batchResults.some((result) => result?.meta?.changes === 0)) {
      // A guarded stock update matched no rows — concurrent checkout race.
      // Stock never went negative, but flag it for manual review.
      console.warn(
        `Checkout ${orderNumber}: a guarded stock update matched 0 rows (possible concurrent oversell).`,
      );
    }

    return json(
      {
        success: true,
        orderId,
        orderNumber,
        subtotal,
        deliveryFee,
        total,
      },
      201,
    );
  } catch (error) {
    const status = error.status || 500;
    const isServerError = status >= 500;
    if (isServerError) {
      console.error("Checkout error:", error.message || error);
    }
    return json(
      {
        success: false,
        message: isServerError
          ? "Unable to create order. Please try again."
          : error.message,
        code: error.code || (isServerError ? "D1_ERROR" : "CHECKOUT_ERROR"),
      },
      status,
    );
  }
}
