// utils/deliveryFee.js

export const DELIVERY_ZONES = [
  { name: "Nairobi CBD", fee: 100 },
  { name: "Westlands", fee: 250 },
  { name: "Kilimani", fee: 300 },
  { name: "Thika", fee: 300 },
  { name: "Mombasa", fee: 300 },
  { name: "Other", fee: 400 },
];

export const getDeliveryFee = (zone) => {
  const selected = DELIVERY_ZONES.find((z) => z.name === zone);
  return selected ? selected.fee : 400;
};
