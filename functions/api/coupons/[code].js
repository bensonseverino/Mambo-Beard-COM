// Coupon preview for the cart drawer.
//
// GET /api/coupons/:code?subtotal=<number>
//
// The drawer shows "Coupon MBVIP10: −KES 250" in the totals and a discounted
// total before the order is placed. Validation rules live in lib/coupon.js —
// the exact same rules /api/checkout enforces server-side, so what the
// shopper sees is exactly what checkout applies (an unusable code can still
// legitimately change between preview and order — stock, subtotal, or the
// coupon itself may change in between; checkout remains the authority).
//
// GET is read-only: this never increments times_redeemed. Only checkout does.

import { ensureSchema } from "../../lib/schema.js";
import {
  checkCouponUsable,
  computeCouponDiscount,
  couponDenialMessage,
  normalizeCouponCode,
} from "../../lib/coupon.js";

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function onRequestGet(context) {
  const { request, env, params } = context;

  try {
    if (!env?.DB) {
      return json({ message: "Database is not configured." }, 500);
    }
    await ensureSchema(env);

    const code = normalizeCouponCode(params.code);
    if (!code) {
      return json({ message: "Coupon code is required." }, 400);
    }

    const subtotal = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("subtotal")) || 0));

    const coupon = await env.DB.prepare(
      `SELECT id, code, discount_type, value, min_subtotal, max_redemptions,
              times_redeemed, active, expires_at
       FROM coupons WHERE code = ?`,
    )
      .bind(code)
      .first();

    // Unknown code: 200 with usable:false — a preview miss is not an error
    // the drawer should surface as a failure; it just doesn't apply.
    if (!coupon) {
      return json({ usable: false, reason: "missing", message: couponDenialMessage({ ok: false, reason: "missing" }) });
    }

    const check = checkCouponUsable(coupon, subtotal);
    if (!check.ok) {
      return json({ usable: false, reason: check.reason, message: couponDenialMessage(check) });
    }

    const discount = computeCouponDiscount(coupon, subtotal);
    return json({
      usable: true,
      code: coupon.code,
      discount,
      discountedSubtotal: Math.max(0, Math.round(subtotal) - discount),
    });
  } catch (error) {
    console.error("Coupon preview error:", error?.message || error);
    return json({ message: "Unable to check coupon." }, 500);
  }
}
