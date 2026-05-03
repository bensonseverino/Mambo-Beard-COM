// pages/Home.jsx
import { products } from "../data/products";
import ProductCard from "../components/Productcard";

export default function Home() {
  return (
    <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
