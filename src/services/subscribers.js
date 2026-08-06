const API_BASE = import.meta.env.VITE_API_BASE || "";

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

export const isValidKenyanPhone = (raw) => normalizeKenyanPhone(raw) !== null;

/**
 * Subscribe a phone number to the VIP SMS list.
 *
 * @param {string} phone — raw input; validated + normalized here
 * @returns {Promise<{ success: boolean, phone: string }>}
 */
export const subscribe = async (phone) => {
  const normalized = normalizeKenyanPhone(phone);
  if (!normalized) {
    throw new Error("Enter a valid Kenyan phone number.");
  }

  const response = await fetch(`${API_BASE}/api/subscribers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone: normalized }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message || "Unable to join right now. Please try again later.",
    );
  }

  return data;
};
