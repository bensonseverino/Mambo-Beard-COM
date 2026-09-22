// utils/deliveryFee.js
//
// Client re-export of the shared delivery fee table (shared/delivery-fees.js)
// — the same module functions/api/checkout.js uses to charge orders. Keep
// imports of DELIVERY_ZONES / getDeliveryFee pointing here; this file adds
// nothing of its own anymore, which is the point.

export { DELIVERY_FEES, DELIVERY_ZONES, getDeliveryFee, DEFAULT_ZONE } from "../../shared/delivery-fees.js";
