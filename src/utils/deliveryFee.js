// utils/deliveryFee.js

export const DELIVERY_ZONES = [
  { name: "Nairobi CBD", fee: 200 },
  { name: "Westlands", fee: 150 },
  { name: "Kilimani", fee: 150 },
  { name: "Thika", fee: 300 },
  { name: "Mombasa", fee: 400 },
  { name: "Other", fee: 500 },
];

export const getDeliveryFee = (zone) => {
  const selected = DELIVERY_ZONES.find((z) => z.name === zone);
  return selected ? selected.fee : 500;
};
