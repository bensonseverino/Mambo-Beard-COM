const API_BASE = import.meta.env.VITE_API_BASE || "";

const handleJson = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "API request failed");
  }
  return data;
};

export const getProducts = async () => {
  const response = await fetch(`${API_BASE}/api/products`);
  const data = await handleJson(response);
  return data.products || [];
};

export const getProduct = async (slug) => {
  const response = await fetch(`${API_BASE}/api/products/${slug}`);
  const data = await handleJson(response);
  return data.product;
};

export const getInventory = async (productId) => {
  const response = await fetch(`${API_BASE}/api/inventory/${productId}`);
  const data = await handleJson(response);
  return data.inventory || [];
};

export const createCheckout = async (payload) => {
  const response = await fetch(`${API_BASE}/api/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleJson(response);
};
