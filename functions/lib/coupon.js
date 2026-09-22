// Coupon validation + discount calculation for /api/checkout.
//
// The `coupons` table is a cross-project contract with the admin dashboard
// (same D1 database): the admin creates and manages codes, the storefront
// validates and redeems them. This module is the storefront side of that
// contract — keep the usability rules in sync with the admin docs.
//
// Contract — a code is redeemable when ALL of:
//   active = 1
//   AND (expires_at IS NULL OR expires_at > now)
//   AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)
//   AND (min_subtotal IS NULL OR order_subtotal >= min_subtotal)
//
// Discount (KES, integer, never negative — delivery is not discounted):
//   percent → round(subtotal × value / 100)
//   fixed   → min(value, subtotal)

/** Normalize raw user input into the canonical stored code form. */
export const normalizeCouponCode = (raw) =>
  typeof raw === "string" ? raw.trim().toUpperCase().slice(0, 64) : "";

/** Human-readable reason a coupon cannot be applied (for the WhatsApp flow). */
const DENIAL_MESSAGES = {
  missing: "Coupon code not found.",
  inactive: "This coupon is no longer active.",
  expired: "This coupon has expired.",
  exhausted: "This coupon has reached its usage limit.",
  "min-subtotal": "Your order subtotal does not meet this coupon's minimum.",
};

/**
 * Validate a coupon row against the redemption contract.
 *
 * @param {{active: number, expires_at: string|null, max_redemptions: number|null,
 *           times_redeemed: number, min_subtotal: number|null}|undefined} coupon
 * @param {number} subtotal — validated order subtotal
 * @param {Date} [now]
 * @returns {{ ok: boolean, reason?: keyof typeof DENIAL_MESSAGES, message?: string }}
 */
export const checkCouponUsable = (coupon, subtotal, now = new Date()) => {
  if (!coupon) return { ok: false, reason: "missing" };
  if (!Number(coupon.active)) return { ok: false, reason: "inactive" };
  if (
    coupon.expires_at &&
    !(new Date(coupon.expires_at) > now)
  ) {
    // Malformed dates parse to NaN, which also fails here — fail closed.
    return { ok: false, reason: "expired" };
  }
  if (
    coupon.max_redemptions != null &&
    Number(coupon.times_redeemed) >= Number(coupon.max_redemptions)
  ) {
    return { ok: false, reason: "exhausted" };
  }
  if (coupon.min_subtotal != null && subtotal < Number(coupon.min_subtotal)) {
    return { ok: false, reason: "min-subtotal" };
  }
  return { ok: true };
};

/** The denial message for a failed check, or null when the coupon is fine. */
export const couponDenialMessage = (result) =>
  result?.ok ? null : DENIAL_MESSAGES[result?.reason] || "Coupon cannot be applied.";

/**
 * Discount in whole KES for a usable coupon. Never negative; a fixed
 * discount larger than the subtotal clamps to the subtotal.
 */
export const computeCouponDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;
  const value = Number(coupon.value) || 0;
  const raw =
    coupon.discount_type === "fixed"
      ? value
      : Math.round((subtotal * value) / 100);
  return Math.max(0, Math.min(Math.round(raw), Math.round(subtotal)));
};
