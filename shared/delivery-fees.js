// Delivery fees — single source of truth.
//
// Both the cart drawer (via src/utils/deliveryFee.js) and the checkout API
// (functions/api/checkout.js) import this module, so the price a shopper
// sees can never drift from the price the order is charged. The backend
// values here are the chargeable ones — they are what POST /api/checkout
// has always applied.
//
// Kenya-wide delivery in whole KES. Adding a zone here updates the drawer
// dropdown, its displayed fee, and server-side charging in one place.

export const DELIVERY_FEES = {
  "Nairobi CBD": 200,
  Westlands: 150,
  Kilimani: 150,
  Thika: 300,
  Mombasa: 400,
  Other: 500,
};

export const DEFAULT_ZONE = "Other";

export const getDeliveryFee = (zone) =>
  DELIVERY_FEES[zone] ?? DELIVERY_FEES[DEFAULT_ZONE];

// Drawer dropdown options, derived so a new zone only needs one entry above.
export const DELIVERY_ZONES = Object.keys(DELIVERY_FEES).map((name) => ({
  name,
  fee: DELIVERY_FEES[name],
}));
