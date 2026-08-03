-- Cloudflare D1 schema for Mambo Beard ecommerce

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  category TEXT,
  featured INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_colors (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  hex TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INTEGER,
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(color_id) REFERENCES product_colors(id)
);

CREATE TABLE sizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  stock INTEGER NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(color_id) REFERENCES product_colors(id),
  FOREIGN KEY(size_id) REFERENCES sizes(id)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  customer_name TEXT,
  phone TEXT,
  email TEXT,
  location TEXT,
  delivery_fee INTEGER,
  subtotal INTEGER,
  total INTEGER,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(color_id) REFERENCES product_colors(id),
  FOREIGN KEY(size_id) REFERENCES sizes(id)
);
