// components/ProductCard.jsx
import { Link } from "react-router-dom";
import { buildImageUrl } from "../services/api";
import { BRAND } from "../utils/seo";

export default function ProductCard({ product }) {
  // Use thumbnail path from API, construct full R2 URL
  const imageSrc = product.thumbnail
    ? buildImageUrl(product.thumbnail)
    : Array.isArray(product.image)
      ? product.image[0]
      : product.image || "";

  return (
    <div className="text-center">
      <Link to={`/product/${product.slug || product.id}`} state={{ fromHome: true }}>
        <img
          src={imageSrc}
          alt={`${BRAND} ${product.name}`}
          className="w-full aspect-3/4 object-cover bg-[#f5fffa]"
          loading="lazy"
          decoding="async"
        />
      </Link>

      <h4 className="mt-2 text-sm font-medium" style={{ color: "#43392f" }}>
        {product.name}
      </h4>
    </div>
  );
}
