// components/ProductCard.jsx
import { Link } from "react-router-dom";
import { buildImageUrl, buildImageSrcSet } from "../services/api";
import { BRAND } from "../utils/seo";

export default function ProductCard({ product, eager = false }) {
  // Use thumbnail path from API, construct full R2 URL
  const thumbPath = product.thumbnail
    ? product.thumbnail
    : Array.isArray(product.image)
      ? product.image[0]
      : product.image || "";
  const imageSrc = buildImageUrl(thumbPath);
  const srcSet = buildImageSrcSet(thumbPath);

  return (
    <div className="text-center">
      <Link to={`/product/${product.slug || product.id}`} state={{ fromHome: true }}>
        <img
          src={imageSrc}
          srcSet={srcSet || undefined}
          sizes="(min-width: 768px) 25vw, 50vw"
          alt={`${BRAND} ${product.name}`}
          className="w-full aspect-3/4 object-cover bg-[#f5fffa]"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
      </Link>

      <h4 className="mt-2 text-sm font-medium" style={{ color: "#43392f" }}>
        {product.name}
      </h4>
    </div>
  );
}
