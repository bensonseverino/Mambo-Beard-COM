import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { onRequestPost as checkoutHandler } from "../api/checkout.js";
import { ensureSchema } from "../lib/schema.js";

let mf;
let db;

test.beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { async fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  await ensureSchema({ DB: db });
});

test.afterEach(async () => {
  await mf.dispose();
});

const tableExists = async (name) => {
  const result = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .all();
  return result.results.length > 0;
};

const seedProduct = async () => {
  const seed = await import("./products-seed.js");
  await seed.seedProducts(db);
};

const checkout = (body) =>
  checkoutHandler({
    request: new Request("https://example.com/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: { DB: db },
  });

const validPayload = (overrides = {}) => ({
  name: "Jane Doe",
  phone: "+254700000000",
  email: "jane@example.com",
  zone: "Westlands",
  customLocation: "",
  cart: [{ productId: "prod-1", colorId: "color-1", size: "M", quantity: 2 }],
  ...overrides,
});

test("checkout bootstraps missing tables before validating (the D1_ERROR fix)", async () => {
  // Drop the orders table to simulate a DB where migrations never ran.
  await db.exec("DROP TABLE IF EXISTS orders");
  assert.equal(await tableExists("orders"), false);

  const response = await checkout(validPayload());
  // No products exist yet, so checkout fails cleanly — but the schema now
  // exists, so the error is a business error, not "no such table: orders".
  assert.equal(response.status, 404);
  const data = await response.json();
  assert.equal(data.code, "PRODUCT_NOT_FOUND");
  assert.equal(await tableExists("orders"), true);
  assert.equal(await tableExists("order_items"), true);
  assert.equal(await tableExists("inventory"), true);
  assert.equal(await tableExists("customers"), true);
});

test("checkout creates an order, order items, and reduces stock atomically", async () => {
  await seedProduct();
  const response = await checkout(validPayload());
  assert.equal(response.status, 201);

  const data = await response.json();
  assert.equal(data.success, true);
  assert.match(data.orderNumber, /^MB-\d{8}-\d{4}$/);
  assert.equal(data.subtotal, 48); // 24 * 2
  assert.equal(data.deliveryFee, 150); // Westlands
  assert.equal(data.total, 198);

  const orders = await db.prepare("SELECT * FROM orders").all();
  assert.equal(orders.results.length, 1);
  assert.equal(orders.results[0].customer_name, "Jane Doe");
  assert.equal(orders.results[0].status, "pending");
  assert.equal(orders.results[0].total, 198);

  const items = await db.prepare("SELECT * FROM order_items").all();
  assert.equal(items.results.length, 1);
  assert.equal(items.results[0].product_id, "prod-1");
  assert.equal(items.results[0].size, "M");
  assert.equal(items.results[0].quantity, 2);

  // Both stock representations are decremented and stay in sync.
  const variant = await db
    .prepare("SELECT stock FROM product_variants WHERE id = ?")
    .bind("v1")
    .first();
  assert.equal(variant.stock, 3);
  const inventory = await db
    .prepare("SELECT stock FROM inventory WHERE id = ?")
    .bind("inv-1")
    .first();
  assert.equal(inventory.stock, 3);
});

test("checkout creates a customer on the first order and updates them on repeat orders", async () => {
  await seedProduct();

  // First order: customer row is created.
  const first = await checkout(validPayload());
  assert.equal(first.status, 201);

  let customers = await db.prepare("SELECT * FROM customers").all();
  assert.equal(customers.results.length, 1);
  assert.equal(customers.results[0].phone, "+254700000000");
  assert.equal(customers.results[0].name, "Jane Doe");
  assert.equal(customers.results[0].email, "jane@example.com");
  assert.equal(customers.results[0].location, "Westlands");
  assert.equal(customers.results[0].total_orders, 1);
  assert.equal(customers.results[0].lifetime_spend, 198);

  // Repeat order with the same phone: same row, updated fields + counters.
  // Quantity 1 → total 174 (24 + 150 delivery), so stock 5 - 2 - 1 stays ≥ 0.
  const second = await checkout(
    validPayload({
      name: "Jane D. Smith",
      email: "jane.new@example.com",
      cart: [
        { productId: "prod-1", colorId: "color-1", size: "M", quantity: 1 },
      ],
    }),
  );
  assert.equal(second.status, 201);

  customers = await db.prepare("SELECT * FROM customers").all();
  assert.equal(customers.results.length, 1); // still one row — no duplicates
  assert.equal(customers.results[0].name, "Jane D. Smith");
  assert.equal(customers.results[0].email, "jane.new@example.com");
  assert.equal(customers.results[0].total_orders, 2);
  assert.equal(customers.results[0].lifetime_spend, 372); // 198 + 174

  // A different phone becomes a separate customer.
  const third = await checkout(
    validPayload({
      name: "Bob Mwangi",
      phone: "+254711111111",
      email: "bob@example.com",
      zone: "Nairobi CBD",
      cart: [
        { productId: "prod-1", colorId: "color-1", size: "M", quantity: 1 },
      ],
    }),
  );
  assert.equal(third.status, 201);

  customers = await db.prepare("SELECT * FROM customers").all();
  assert.equal(customers.results.length, 2);
});

test("out of stock returns a structured 400 and writes nothing", async () => {
  await seedProduct();
  const response = await checkout(
    validPayload({
      cart: [
        { productId: "prod-1", colorId: "color-1", size: "M", quantity: 99 },
      ],
    }),
  );
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.success, false);
  assert.equal(data.code, "INSUFFICIENT_STOCK");
  assert.match(data.message, /Insufficient stock/);

  const orders = await db.prepare("SELECT * FROM orders").all();
  assert.equal(orders.results.length, 0);
  const customers = await db.prepare("SELECT * FROM customers").all();
  assert.equal(customers.results.length, 0); // no customer without an order
  const variant = await db
    .prepare("SELECT stock FROM product_variants WHERE id = ?")
    .bind("v1")
    .first();
  assert.equal(variant.stock, 5);
});

test("missing fields return a structured 400", async () => {
  const response = await checkout({ name: "No Cart" });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.success, false);
  assert.equal(data.code, "INVALID_PAYLOAD");
});

test("unknown product returns a structured 404", async () => {
  const response = await checkout(
    validPayload({
      cart: [
        { productId: "missing", colorId: "color-1", size: "M", quantity: 1 },
      ],
    }),
  );
  assert.equal(response.status, 404);
  const data = await response.json();
  assert.equal(data.code, "PRODUCT_NOT_FOUND");
});

test("order numbers are sequential across checkouts", async () => {
  await seedProduct();
  const date = new Date();
  const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}${String(date.getDate()).padStart(2, "0")}`;
  const first = await checkout(validPayload());
  const second = await checkout(validPayload());
  assert.equal((await first.json()).orderNumber, `MB-${day}-0001`);
  assert.equal((await second.json()).orderNumber, `MB-${day}-0002`);
});
