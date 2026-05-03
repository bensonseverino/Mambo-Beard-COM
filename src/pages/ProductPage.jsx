// pages/ProductPage.jsx
import { useParams } from "react-router-dom";
import { products } from "../data/products";
import { useState } from "react";
import { useCart } from "../context/CartContext";

export default function ProductPage() {
  const { id } = useParams();
  const product = products.find((p) => p.id === Number(id));

  const { addToCart } = useCart();
  const [size, setSize] = useState("");
  const [mainImage, setMainImage] = useState(product.image[0]);
  const [zoom, setZoom] = useState(false);

  if (!product) return <div>Product not found</div>;

  return (
    <div className="p-6 md:flex gap-10">
      {/* IMAGE SECTION */}
      <div className="md:w-1/2">
        <div
          className="overflow-hidden"
          onMouseEnter={() => setZoom(true)}
          onMouseLeave={() => setZoom(false)}
        >
          <img
            src={mainImage}
            className={`w-full transition-transform duration-300 ${
              zoom ? "scale-125" : "scale-100"
            }`}
          />
        </div>

        {/* THUMBNAILS */}
        <div className="flex gap-2 mt-2">
          {product.image.map((img, i) => (
            <img
              key={i}
              src={img}
              onClick={() => setMainImage(img)}
              className="w-16 h-16 object-cover cursor-pointer border"
            />
          ))}
        </div>
      </div>

      {/* DETAILS */}
      <div>
        <h1 className="text-xl font-bold">{product.name}</h1>
        <p className="mt-2 text-center md:text-left">${product.price}</p>

        {/* SIZES */}
        <div className="flex gap-2 mt-4 justify-center md:justify-start">
          {product.sizes.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`border px-3 py-1 ${
                size === s ? "bg-black text-white" : ""
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            if (!size) return alert("Select size");
            addToCart(product, size);
          }}
          className="mt-4 bg-black text-white px-6 py-2"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}
