// App.jsx

import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ProductPage from "./pages/ProductPage";
import Header from "./components/Header";
import CartDrawer from "./components/CartDrawer";
import { CartProvider } from "./context/CartContext";

function App() {
  const [cartOpen, setCartOpen] = useState(false);
  return (
    <CartProvider>
      <BrowserRouter>
        <Header toggleCart={() => setCartOpen(!cartOpen)} />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/product/:id" element={<ProductPage />} />
        </Routes>

        <CartDrawer open={cartOpen} toggle={() => setCartOpen(false)} />
      </BrowserRouter>
    </CartProvider>
  );
}

export default App;
