// data/products.js

import mambaBack from "../assets/mamba back.jpg";
import mambo1 from "../assets/mambo1.jpg";
import mambo2 from "../assets/mambo2.jpg";
import mambo3 from "../assets/mambo3.jpg";
import mambo4 from "../assets/mambo4.jpg";

export const products = [
  {
    id: 1,
    name: "Washed Tee",
    price: 30,
    image: [mambo1, mambo2, mambaBack],
    sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: 2,
    name: "Puffer Jacket",
    price: 60,
    image: [mambo2, mambo2, mambo3],
    sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: 3,
    name: "Cargo Pants",
    price: 50,
    image: [mambo4, mambo2, mambo3],
    sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: 4,
    name: "Heavy Hoodie",
    price: 45,
    image: [mambaBack, mambo3, mambo2],
    sizes: ["XS", "S", "M", "L", "XL"],
  },
];
