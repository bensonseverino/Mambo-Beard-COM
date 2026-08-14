// Runtime D1 schema bootstrap for the storefront.
//
// The storefront and the admin dashboard share one D1 database
// (mambo-beard-db). Deployments may not have run `wrangler d1 migrations
// apply`, so every public API handler bootstraps the schema at runtime with
// CREATE TABLE IF NOT EXISTS. This guarantees `orders` / `order_items` /
// `inventory` / `sizes` / `customers` always exist and eliminates
// `no such table` errors.

export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT,
    featured INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    product_type TEXT NOT NULL DEFAULT 'variant',
    variation_type TEXT NOT NULL DEFAULT 'none',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS product_colors (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    hex TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS product_images (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    color_id TEXT,
    path TEXT NOT NULL,
    type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 1,
    -- color_id is NULL for simple-product gallery images.
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (color_id) REFERENCES product_colors(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    color_id TEXT NOT NULL,
    size TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (color_id) REFERENCES product_colors(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS sizes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    color_id TEXT,
    size_id TEXT,
    stock INTEGER NOT NULL,
    -- color_id / size_id are NULL for simple products (one row per product).
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(color_id) REFERENCES product_colors(id) ON DELETE CASCADE,
    FOREIGN KEY(size_id) REFERENCES sizes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
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
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    color_id TEXT,
    size TEXT,
    size_id TEXT,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    -- No ON DELETE CASCADE on product_id/color_id: products are soft-deleted
    -- (active = 0) so order history must survive deletes and edits. color_id
    -- is NULL for simple-product order lines.
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(color_id) REFERENCES product_colors(id),
    FOREIGN KEY(size_id) REFERENCES sizes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
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
  )`,
  // One stock row per variation combination. NULL color_id/size_id are
  // coalesced to '' so simple (NULL/NULL), color-only (color/NULL), size-only
  // (NULL/size), and color_size rows each have exactly one row per combo.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_variation
    ON inventory (product_id, COALESCE(color_id, ''), COALESCE(size_id, ''))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone)`,
  `CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    source TEXT DEFAULT 'website'
  )`,
  // Rolling per-IP, per-hour counters for the subscription popup. The id IS
  // the composite key `ip|YYYY-MM-DD-HH`, so PRIMARY KEY enforces uniqueness
  // without needing a separate unique index in the runtime bootstrap.
  `CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    bucket TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
  )`,
];

export const SIZE_SEED_STATEMENT = `INSERT OR IGNORE INTO sizes (id, name) VALUES
  ('size-xs', 'XS'),
  ('size-s', 'S'),
  ('size-m', 'M'),
  ('size-l', 'L'),
  ('size-xl', 'XL'),
  ('size-xxl', 'XXL')`;

/**
 * Add a column to an existing table when it is missing (idempotent).
 * CREATE TABLE IF NOT EXISTS cannot add columns, so databases created before
 * the variation system (or where admin migrations never ran) get the new
 * columns here. Column/table names are internal constants — never user input.
 */
export const ensureColumn = async (db, table, column, definition) => {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = (info.results || []).some((entry) => entry.name === column);
  if (!exists) {
    await db
      .prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      .run();
  }
};

/**
 * Create every table (idempotent) and seed the standard sizes.
 * Safe to call on every request — no-op once the schema exists.
 */
export const ensureSchema = async (env) => {
  const db = env?.DB;
  if (!db) return;
  const indexStatements = SCHEMA_STATEMENTS.filter((sql) =>
    sql.startsWith("CREATE UNIQUE INDEX"),
  );
  const statements = SCHEMA_STATEMENTS.filter(
    (sql) => !sql.startsWith("CREATE UNIQUE INDEX"),
  ).map((sql) => db.prepare(sql));
  statements.push(db.prepare(SIZE_SEED_STATEMENT));
  await db.batch(statements);

  // Legacy databases: products tables created before the variation system
  // lack product_type / variation_type. Backfill them so reads never hit
  // "no such column" even where the admin migrations never ran.
  await ensureColumn(
    db,
    "products",
    "product_type",
    "TEXT NOT NULL DEFAULT 'variant'",
  );
  await ensureColumn(db, "products", "variation_type", "TEXT NOT NULL DEFAULT 'none'");

  // Unique indexes can fail on pre-existing dirty data (e.g. duplicate
  // customer phones or duplicate inventory combinations). Catch each one so
  // a single dirty table can't take down every handler that bootstraps the
  // schema.
  for (const indexStatement of indexStatements) {
    try {
      await db.prepare(indexStatement).run();
    } catch (error) {
      console.warn(
        "[schema] Could not create unique index:",
        indexStatement.slice(0, 80),
        error?.message || error,
      );
    }
  }
};

/** Throw a structured API error with HTTP status + machine-readable code. */
export const apiError = (code, message, status = 400) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
};
