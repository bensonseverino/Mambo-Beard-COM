// components/ProductCard.jsx
import { Link } from "react-router-dom";

export default function ProductCard({ product }) {
  return (
    <div className="text-center">
      <Link to={`/product/${product.id}`} state={{ fromHome: true }}>
        <img
          src={Array.isArray(product.image) ? product.image[0] : product.image}
          alt={product.name}
          className="w-full bg-gray-700 "
        />
      </Link>

      <h4 className="mt-2 text-sm font-medium" style={{ color: "#43392f" }}>
        {product.name}
      </h4>
    </div>
  );
}
