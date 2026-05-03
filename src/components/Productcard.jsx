// components/ProductCard.jsx
import { useState } from "react";
import { useCart } from "../context/CartContext";
import { Link } from "react-router-dom";

export default function ProductCard({ product }) {
  const { addToCart } = useCart();
  const [selectedSize, setSelectedSize] = useState("");

  return (
    <div className="text-center">
      <Link to={`/product/${product.id}`}>
        <img
          src={Array.isArray(product.image) ? product.image[0] : product.image}
          alt={product.name}
          className="w-full bg-gray-100"
        />
      </Link>

      <h2 className="mt-2 text-sm font-medium">{product.name}</h2>
      <p className="text-xs text-gray-500">${product.price}</p>

      {/* Sizes */}
      <div className="flex justify-center gap-2 mt-2">
        {product.sizes.map((size) => (
          <button
            key={size}
            onClick={() => setSelectedSize(size)}
            className={`border px-2 py-1 text-xs ${
              selectedSize === size ? "bg-black text-white" : ""
            }`}
          >
            {size}
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          if (!selectedSize) return alert("Select size");
          addToCart(product, selectedSize);
        }}
        className="mt-2 text-xs border px-3 py-1 hover:bg-black hover:text-white"
      >
        Add to Cart
      </button>
    </div>
  );
}
