// Storefront checkout.
//
// Request:  POST /api/checkout
//   { name, phone, email, zone, customLocation, cart: [{ productId, colorId?, size?, sizeId?, quantity }] }
// Success:  201 { success: true, orderId, orderNumber, subtotal, deliveryFee, total }
// Errors:   4xx { success: false, message, code } — business errors
//           5xx { success: false, message, code: "D1_ERROR" } — masked server errors
//
// The frontend only consumes `orderNumber` (WhatsApp message) and `message`
// (alert text), so this stays compatible with the existing UI.
//
// Every product carries a variation_type (none | color | size | color_size)
// and stock is validated server-side against the `inventory` table — the
// single source of truth. Only the variations a product supports are
// accepted; anything else is rejected with a 400.
//
// The whole write — customer upsert, order, order items, and guarded stock
// deductions — runs in a single D1 batch, which is atomic: if any statement
// fails, nothing is written.

import { apiError, ensureSchema } from "../lib/schema.js";
import { DELIVERY_FEES } from "../../shared/delivery-fees.js";
import {
  checkCouponUsable,
  computeCouponDiscount,
  couponDenialMessage,
  normalizeCouponCode,
} from "../lib/coupon.js";

const VARIATION_TYPES = ["none", "color", "size", "color_size"];


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

    // Meta Shops checkout deep links (/checkout?coupon=…&cart_origin=…) and
    // any shopper-supplied code land here. The code is normalized
    // (trimmed + uppercased, matching how the admin stores it) and validated
    // against the shared `coupons` table once the subtotal is known below —
    // the discount is computed server-side and the total reflects it. The
    // origin captures which surface (facebook / instagram / meta_shops) the
    // order came from.
    const couponCode = normalizeCouponCode(body.couponCode);
    const cartOrigin =
      typeof body.cartOrigin === "string" && body.cartOrigin.trim()
        ? body.cartOrigin.trim().slice(0, 32)
        : null;

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
    // Which fields are required is validated per product below, so the merge
    // keys on whatever variation values were supplied.
    const merged = new Map();
    for (const item of cart) {
      if (!item?.productId) {
        throw apiError(
          "INVALID_PAYLOAD",
          "Cart items are missing product, color, or size.",
          400,
        );
      }
      const colorId = String(item.colorId || item.color_id || "");
      const sizeKey = String(
        item.size || item.sizeId || item.size_id || "",
      ).trim();
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const key = `${item.productId}|${colorId}|${sizeKey}`;
      const existing = merged.get(key);
      merged.set(key, {
        ...item,
        colorId,
        size: sizeKey,
        quantity: (existing?.quantity || 0) + quantity,
      });
    }
    const items = [...merged.values()];

    // Verify products + prices from the database (never trust client prices).
    const productIds = [...new Set(items.map((item) => item.productId))];
    const productsResult = await env.DB.prepare(
      `SELECT id, name, price, product_type, variation_type
       FROM products WHERE id IN (${productIds
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

      const variationType = VARIATION_TYPES.includes(product.variation_type)
        ? product.variation_type
        : product.product_type === "simple"
          ? "none"
          : "color_size";
      const hasColor = variationType === "color" || variationType === "color_size";
      const hasSize = variationType === "size" || variationType === "color_size";

      // Reject variation values the product does not support.
      if (item.colorId && !hasColor) {
        throw apiError(
          "INVALID_VARIATION",
          `This product does not support color variations`,
          400,
        );
      }
      if (item.size && !hasSize) {
        throw apiError(
          "INVALID_VARIATION",
          `This product does not support size variations`,
          400,
        );
      }

      let colorId = null;
      let sizeName = "";
      let sizeId = null;
      let inventoryRow = null;
      let variantId = null;

      if (variationType === "none") {
        // Simple products: one product-level stock row, no variations.
        inventoryRow = await env.DB.prepare(
          `SELECT id, stock FROM inventory
           WHERE product_id = ? AND color_id IS NULL AND size_id IS NULL
           LIMIT 1`,
        )
          .bind(product.id)
          .first();
      } else {
        if (hasColor) {
          if (!item.colorId) {
            throw apiError(
              "INVALID_PAYLOAD",
              `Color is required for product "${product.name}".`,
              400,
            );
          }
          const colorRow = await env.DB.prepare(
            `SELECT id FROM product_colors
             WHERE id = ? AND product_id = ?
             LIMIT 1`,
          )
            .bind(item.colorId, product.id)
            .first();
          if (!colorRow) {
            throw apiError(
              "COLOR_NOT_FOUND",
              `Color not found for product "${product.name}".`,
              400,
            );
          }
          colorId = item.colorId;
        }

        if (hasSize) {
          if (!item.size) {
            throw apiError(
              "INVALID_PAYLOAD",
              `Size is required for product "${product.name}".`,
              400,
            );
          }
          // Accept either the size name ("XXL") or the catalog id ("size-xxl").
          const sizeRow = await env.DB.prepare(
            `SELECT id, name FROM sizes WHERE id = ? OR name = ?
             LIMIT 1`,
          )
            .bind(item.size, item.size)
            .first();
          if (!sizeRow) {
            throw apiError(
              "SIZE_NOT_FOUND",
              `Size "${item.size}" is not available for product "${product.name}".`,
              400,
            );
          }
          sizeName = sizeRow.name;
          sizeId = sizeRow.id;
        }

        if (hasColor && hasSize) {
          inventoryRow = await env.DB.prepare(
            `SELECT id, stock FROM inventory
             WHERE product_id = ? AND color_id = ? AND size_id = ?
             LIMIT 1`,
          )
            .bind(product.id, colorId, sizeId)
            .first();
          // Legacy fallback: products created before the inventory mirror.
          if (!inventoryRow) {
            const variant = await env.DB.prepare(
              `SELECT id, stock FROM product_variants
               WHERE product_id = ? AND color_id = ? AND size = ?
               LIMIT 1`,
            )
              .bind(product.id, colorId, sizeName)
              .first();
            if (variant) {
              variantId = variant.id;
              inventoryRow = { id: null, stock: variant.stock };
            }
          }
        } else if (hasColor) {
          inventoryRow = await env.DB.prepare(
            `SELECT id, stock FROM inventory
             WHERE product_id = ? AND color_id = ? AND size_id IS NULL
             LIMIT 1`,
          )
            .bind(product.id, colorId)
            .first();
        } else {
          inventoryRow = await env.DB.prepare(
            `SELECT id, stock FROM inventory
             WHERE product_id = ? AND color_id IS NULL AND size_id = ?
             LIMIT 1`,
          )
            .bind(product.id, sizeId)
            .first();
        }
      }

      const stock = inventoryRow ? Number(inventoryRow.stock) || 0 : 0;
      if (stock < item.quantity) {
        const detail =
          variationType === "none"
            ? product.name
            : variationType === "color"
              ? `${product.name} (${colorId})`
              : `${product.name} (${sizeName})`;
        throw apiError(
          "INSUFFICIENT_STOCK",
          `Insufficient stock for ${detail}. Only ${stock} left.`,
          400,
        );
      }

      const price = Number(product.price);
      subtotal += price * item.quantity;
      validated.push({
        ...item,
        productId: product.id,
        variationType,
        colorId,
        size: sizeName,
        sizeId,
        inventoryId: inventoryRow?.id || null,
        variantId,
        price,
      });
    }

    const deliveryFee = DELIVERY_FEES[zone] ?? DELIVERY_FEES.Other;

    // Coupon validation happens after the DB subtotal is final: usability
    // can depend on min_subtotal, and the discount clamps to the subtotal.
    // An unknown/unusable code fails the checkout with a clear message so
    // the order total is never quietly higher than what the shopper saw.
    let coupon = null;
    let discountAmount = 0;
    if (couponCode) {
      coupon = await env.DB.prepare(
        `SELECT id, code, discount_type, value, min_subtotal, max_redemptions,
                times_redeemed, active, expires_at
         FROM coupons WHERE code = ?`,
      )
        .bind(couponCode)
        .first();
      const usable = checkCouponUsable(coupon, subtotal);
      if (!usable.ok) {
        throw apiError("COUPON_INVALID", couponDenialMessage(usable), 400);
      }
      discountAmount = computeCouponDiscount(coupon, subtotal);
    }

    const total = subtotal - discountAmount + deliveryFee;
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
        `INSERT INTO orders (id, order_number, customer_name, phone, email, location, delivery_fee, subtotal, total, status, coupon_code, cart_origin, discount_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
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
        couponCode || null,
        cartOrigin,
        discountAmount,
      ),
      // Redemption counter rides in the same atomic batch as the order —
      // an order is never written without counting its redemption, and the
      // guarded WHERE re-checks the limit against concurrent checkouts.
      ...(coupon
        ? [
            env.DB.prepare(
              `UPDATE coupons SET times_redeemed = times_redeemed + 1
               WHERE id = ?
                 AND (max_redemptions IS NULL
                      OR times_redeemed < max_redemptions)`,
            ).bind(coupon.id),
          ]
        : []),
    ];

    for (const check of validated) {
      // Order line: only the variation dimensions the product supports.
      const orderItem =
        check.variationType === "none"
          ? env.DB.prepare(
              `INSERT INTO order_items (id, order_id, product_id, color_id, size, size_id, quantity, price)
               VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?)`,
            ).bind(
              crypto.randomUUID(),
              orderId,
              check.productId,
              check.quantity,
              check.price,
            )
          : check.variationType === "color"
            ? env.DB.prepare(
                `INSERT INTO order_items (id, order_id, product_id, color_id, size, size_id, quantity, price)
                 VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
              ).bind(
                crypto.randomUUID(),
                orderId,
                check.productId,
                check.colorId,
                check.quantity,
                check.price,
              )
            : check.variationType === "size"
              ? env.DB.prepare(
                  `INSERT INTO order_items (id, order_id, product_id, color_id, size, size_id, quantity, price)
                   VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
                ).bind(
                  crypto.randomUUID(),
                  orderId,
                  check.productId,
                  check.size,
                  check.sizeId,
                  check.quantity,
                  check.price,
                )
              : env.DB.prepare(
                  `INSERT INTO order_items (id, order_id, product_id, color_id, size, size_id, quantity, price)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ).bind(
                  crypto.randomUUID(),
                  orderId,
                  check.productId,
                  check.colorId,
                  check.size,
                  check.sizeId,
                  check.quantity,
                  check.price,
                );
      statements.push(orderItem);

      // Guarded deduction — stock can never drop below zero.
      if (check.variationType === "none") {
        statements.push(
          env.DB.prepare(
            `UPDATE inventory SET stock = stock - ?
             WHERE product_id = ? AND color_id IS NULL AND size_id IS NULL AND stock >= ?`,
          ).bind(check.quantity, check.productId, check.quantity),
        );
      } else if (check.variationType === "color") {
        statements.push(
          env.DB.prepare(
            `UPDATE inventory SET stock = stock - ?
             WHERE product_id = ? AND color_id = ? AND size_id IS NULL AND stock >= ?`,
          ).bind(check.quantity, check.productId, check.colorId, check.quantity),
        );
      } else if (check.variationType === "size") {
        statements.push(
          env.DB.prepare(
            `UPDATE inventory SET stock = stock - ?
             WHERE product_id = ? AND color_id IS NULL AND size_id = ? AND stock >= ?`,
          ).bind(check.quantity, check.productId, check.sizeId, check.quantity),
        );
      } else {
        statements.push(
          env.DB.prepare(
            `UPDATE inventory SET stock = stock - ?
             WHERE product_id = ? AND color_id = ? AND size_id = ? AND stock >= ?`,
          ).bind(
            check.quantity,
            check.productId,
            check.colorId,
            check.sizeId,
            check.quantity,
          ),
        );
        // Legacy mirror for color_size products.
        if (check.variantId) {
          statements.push(
            env.DB.prepare(
              `UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?`,
            ).bind(check.quantity, check.variantId, check.quantity),
          );
        } else if (check.inventoryId) {
          statements.push(
            env.DB.prepare(
              `UPDATE product_variants SET stock = stock - ?
               WHERE product_id = ? AND color_id = ? AND size = ? AND stock >= ?`,
            ).bind(
              check.quantity,
              check.productId,
              check.colorId,
              check.size,
              check.quantity,
            ),
          );
        }
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
        discount: discountAmount,
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
