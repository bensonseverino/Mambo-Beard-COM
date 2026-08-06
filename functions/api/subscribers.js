// VIP SMS list subscription.
//
// Request:  POST /api/subscribers
//   { phone: "+254712345678" }
// Success:  201 { success: true, phone }
// Errors:   4xx { success: false, message, code } — business errors
//           5xx { success: false, message, code: "D1_ERROR" } — masked server errors
//
// Kenyan phone numbers are normalized to +254… (e.g. 0712345678 →
// +254712345678). Duplicate phones are ignored (idempotent), so the same
// visitor subscribing twice yields one row and a 201 either way.

import { apiError, ensureSchema } from "../lib/schema.js";

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Normalize a Kenyan phone number to +254XXXXXXXXX.
 * Accepts +2547/1…, 2547/1…, and 07/1… forms. Returns null when invalid.
 */
export const normalizeKenyanPhone = (raw) => {
  const cleaned = String(raw || "").replace(/[\s()-]/g, "");
  if (/^\+254(7|1)\d{8}$/.test(cleaned)) return cleaned;
  if (/^254(7|1)\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0(7|1)\d{8}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;
  return null;
};

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

    const phone = normalizeKenyanPhone(body.phone);
    if (!phone) {
      throw apiError(
        "INVALID_PHONE",
        "Enter a valid Kenyan phone number.",
        400,
      );
    }

    await env.DB.prepare(
      `INSERT OR IGNORE INTO subscribers (id, phone, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
    )
      .bind(crypto.randomUUID(), phone)
      .run();

    return json({ success: true, phone }, 201);
  } catch (error) {
    const status = error.status || 500;
    const isServerError = status >= 500;
    if (isServerError) {
      console.error("Subscribe error:", error.message || error);
    }
    return json(
      {
        success: false,
        message: isServerError
          ? "Unable to join right now. Please try again later."
          : error.message,
        code: error.code || (isServerError ? "D1_ERROR" : "SUBSCRIBE_ERROR"),
      },
      status,
    );
  }
}
