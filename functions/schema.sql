-- Cloudflare D1 schema for Mambo Beard ecommerce
-- NOTE: this is the schema both the storefront AND the admin dashboard use.
-- The storefront functions read product_variants (not a separate stock table)
-- and the admin writes product_images.path, so keep this in sync with
-- functions/lib/schema.js in this project and with the admin project's
-- migrations/0001_create_orders_and_other_tables.sql.

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  category TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_colors (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  hex TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (color_id) REFERENCES product_colors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  size TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (color_id) REFERENCES product_colors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT OR IGNORE INTO sizes (id, name) VALUES
  ('size-xs', 'XS'),
  ('size-s', 'S'),
  ('size-m', 'M'),
  ('size-l', 'L'),
  ('size-xl', 'XL');

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  stock INTEGER NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(color_id) REFERENCES product_colors(id) ON DELETE CASCADE,
  FOREIGN KEY(size_id) REFERENCES sizes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
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

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  size TEXT,
  size_id TEXT,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(color_id) REFERENCES product_colors(id) ON DELETE CASCADE,
  FOREIGN KEY(size_id) REFERENCES sizes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  location TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  lifetime_spend INTEGER NOT NULL DEFAULT 0,
  last_order_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
