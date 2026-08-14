// Regression tests for the four product variation modes
// (none | color | size | color_size), per the Mambo Beard spec:
//
//   Test 1 — simple product: no selectors, product-level stock
//   Test 2 — color only:    colors with per-color stock, no sizes
//   Test 3 — size only:     canonical sizes (incl. XXL), per-size stock
//   Test 4 — color + size:  both dimensions, per-combination stock
//
// Covers the API contract the storefront consumes (variationType, colors,
// sizes as { id, name }, variants with live stock) and the server-side
// checkout rules: reject unsupported variation values, never oversell, and
// deduct from the correct inventory row.

import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { onRequestGet as productsHandler } from "../api/products.js";
import { onRequestGet as productDetailHandler } from "../api/products/[slug].js";
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
  await seedVariationProducts(db);
});

test.afterEach(async () => {
  await mf.dispose();
});

const checkout = (body) =>
  checkoutHandler({
    request: new Request("https://example.com/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: { DB: db },
  });

const checkoutPayload = (cart, overrides = {}) => ({
  name: "Jane Doe",
  phone: "+254700000000",
  email: "jane@example.com",
  zone: "Westlands",
  customLocation: "",
  cart,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────
// SEED — one product per variation mode
// ─────────────────────────────────────────────────────────────

const seedVariationProducts = async (db) => {
  const d1 = "2026-08-01T00:00:00.000Z";
  const d2 = "2026-08-02T00:00:00.000Z";
  const d3 = "2026-08-03T00:00:00.000Z";
  const d4 = "2026-08-04T00:00:00.000Z";

  const product = async (id, name, slug, price, category, variationType, created) =>
    db
      .prepare(
        `INSERT INTO products
           (id, name, slug, description, price, category, featured, active, variation_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`,
      )
      .bind(id, name, slug, `The ${name}.`, price, category, variationType, created, created)
      .run();

  await product("prod-simple", "Mambo Tote Bag", "mambo-tote-bag", 2500, "Accessories", "none", d1);
  await product("prod-color", "Mambo Cap", "mambo-cap", 1500, "Accessories", "color", d2);
  await product("prod-size", "Mambo T-Shirt", "mambo-t-shirt", 2500, "Apparel", "size", d3);
  await product("prod-cs", "Distorted Hoodie", "distorted-hoodie", 4500, "Apparel", "color_size", d4);

  const color = async (id, productId, name, hex, sort) =>
    db
      .prepare(
        `INSERT INTO product_colors (id, product_id, name, hex, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, productId, name, hex, sort, d4, d4)
      .run();

  await color("cap-black", "prod-color", "Black", "#000000", 1);
  await color("cap-cream", "prod-color", "Cream", "#F2E8D5", 2);
  await color("cs-black", "prod-cs", "Black", "#000000", 1);
  await color("cs-cream", "prod-cs", "Cream", "#F2E8D5", 2);

  const inventory = (id, productId, colorId, sizeId, stock) =>
    db
      .prepare(
        `INSERT INTO inventory (id, product_id, color_id, size_id, stock)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, productId, colorId, sizeId, stock)
      .run();

  // none — product-level stock, no variation dimensions.
  await inventory("inv-simple", "prod-simple", null, null, 25);

  // color — per-color stock, size always NULL.
  await inventory("inv-cap-black", "prod-color", "cap-black", null, 10);
  await inventory("inv-cap-cream", "prod-color", "cap-cream", null, 0);

  // size — per-size stock (S/M/L/XL/XXL), color always NULL. L is out of stock.
  const sizeStocks = { s: 4, m: 10, l: 0, xl: 8, xxl: 3 };
  for (const [short, stock] of Object.entries(sizeStocks)) {
    await inventory(`inv-tshirt-${short}`, "prod-size", null, `size-${short}`, stock);
  }

  // color_size — every color × size combination. Black/L and Cream/S combos
  // below exercise out-of-stock disables.
  const csStocks = {
    black: { s: 2, m: 5, l: 0, xl: 4, xxl: 1 },
    cream: { s: 4, m: 7, l: 3, xl: 5, xxl: 2 },
  };
  for (const [colorShort, perSize] of Object.entries(csStocks)) {
    for (const [sizeShort, stock] of Object.entries(perSize)) {
      await inventory(
        `inv-cs-${colorShort}-${sizeShort}`,
        "prod-cs",
        `cs-${colorShort}`,
        `size-${sizeShort}`,
        stock,
      );
      // Legacy mirror the admin maintains for color_size products.
      await db
        .prepare(
          `INSERT INTO product_variants (id, product_id, color_id, size, stock)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          `var-cs-${colorShort}-${sizeShort}`,
          "prod-cs",
          `cs-${colorShort}`,
          sizeShort.toUpperCase(),
          stock,
        )
        .run();
    }
  }
};

// ─────────────────────────────────────────────────────────────
// PRODUCT API CONTRACT
// ─────────────────────────────────────────────────────────────

test("list API reports variation_type for all four modes", async () => {
  const response = await productsHandler({
    env: { DB: db },
    request: new Request("https://example.com/api/products"),
  });
  assert.equal(response.status, 200);
  const { products } = await response.json();
  assert.equal(products.length, 4);

  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  assert.equal(bySlug["mambo-tote-bag"].variationType, "none");
  assert.equal(bySlug["mambo-cap"].variationType, "color");
  assert.equal(bySlug["mambo-t-shirt"].variationType, "size");
  assert.equal(bySlug["distorted-hoodie"].variationType, "color_size");

  // Colors are only surfaced for color-bearing products — never assumed.
  assert.equal(bySlug["mambo-tote-bag"].colors.length, 0);
  assert.equal(bySlug["mambo-cap"].colors.length, 2);
  assert.equal(bySlug["mambo-t-shirt"].colors.length, 0);
  assert.equal(bySlug["distorted-hoodie"].colors.length, 2);
});

test("detail API — simple product carries no color/size/variants, only product stock", async () => {
  const { product } = await (
    await productDetailHandler({ env: { DB: db }, params: { slug: "mambo-tote-bag" } })
  ).json();
  assert.equal(product.variationType, "none");
  assert.deepEqual(product.colors, []);
  assert.deepEqual(product.sizes, []);
  assert.deepEqual(product.variants, []);
  assert.equal(product.stock, 25);
});

test("detail API — color-only product returns colors with per-color stock", async () => {
  const { product } = await (
    await productDetailHandler({ env: { DB: db }, params: { slug: "mambo-cap" } })
  ).json();
  assert.equal(product.variationType, "color");
  assert.deepEqual(product.sizes, []);
  assert.deepEqual(product.colors.map((c) => c.name), ["Black", "Cream"]);

  assert.equal(product.variants.length, 2);
  const black = product.variants.find((v) => v.colorId === "cap-black");
  assert.equal(black.stock, 10);
  assert.equal(black.size, null); // color-only rows have no size
  const cream = product.variants.find((v) => v.colorId === "cap-cream");
  assert.equal(cream.stock, 0); // out-of-stock color surfaced to the frontend
});

test("detail API — size-only product returns canonical sizes including XXL", async () => {
  const { product } = await (
    await productDetailHandler({ env: { DB: db }, params: { slug: "mambo-t-shirt" } })
  ).json();
  assert.equal(product.variationType, "size");
  assert.deepEqual(product.colors, []);
  assert.deepEqual(product.sizes.map((s) => s.name), ["S", "M", "L", "XL", "XXL"]);

  assert.equal(product.variants.length, 5);
  const xxl = product.variants.find((v) => v.size === "XXL");
  assert.equal(xxl.stock, 3);
  assert.equal(xxl.colorId, null); // size-only rows have no color
});

test("detail API — color+size product returns both dimensions with per-combination stock", async () => {
  const { product } = await (
    await productDetailHandler({ env: { DB: db }, params: { slug: "distorted-hoodie" } })
  ).json();
  assert.equal(product.variationType, "color_size");
  assert.deepEqual(product.colors.map((c) => c.name), ["Black", "Cream"]);
  assert.deepEqual(product.sizes.map((s) => s.name), ["S", "M", "L", "XL", "XXL"]);

  assert.equal(product.variants.length, 10);
  const blackXxl = product.variants.find((v) => v.colorId === "cs-black" && v.size === "XXL");
  assert.equal(blackXxl.stock, 1);
  const blackL = product.variants.find((v) => v.colorId === "cs-black" && v.size === "L");
  assert.equal(blackL.stock, 0); // out-of-stock combination surfaced
});

// ─────────────────────────────────────────────────────────────
// CHECKOUT — SERVER-SIDE VALIDATION + DEDUCTION
// ─────────────────────────────────────────────────────────────

test("checkout — simple product needs no variations and deducts product-level stock", async () => {
  const response = await checkout(
    checkoutPayload([{ productId: "prod-simple", quantity: 2 }]),
  );
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.subtotal, 5000); // 2500 × 2
  assert.equal(data.total, 5150); // + 150 Westlands delivery

  const row = await db
    .prepare("SELECT stock FROM inventory WHERE product_id = 'prod-simple'")
    .first();
  assert.equal(row.stock, 23);

  const item = await db
    .prepare("SELECT * FROM order_items WHERE order_id = ?")
    .bind(data.orderId)
    .first();
  assert.equal(item.product_id, "prod-simple");
  assert.equal(item.color_id, null);
  assert.equal(item.size, null);
  assert.equal(item.size_id, null);
});

test("checkout — color-only product requires a color and rejects sizes", async () => {
  // Unsupported variation: a size on a color-only product must be rejected.
  const rejected = await checkout(
    checkoutPayload([{ productId: "prod-color", colorId: "cap-black", size: "XXL", quantity: 1 }]),
  );
  assert.equal(rejected.status, 400);
  const rejectedData = await rejected.json();
  assert.equal(rejectedData.code, "INVALID_VARIATION");
  assert.match(rejectedData.message, /does not support size variations/);

  // Valid color purchase deducts the per-color row.
  const ok = await checkout(
    checkoutPayload([{ productId: "prod-color", colorId: "cap-black", quantity: 1 }]),
  );
  assert.equal(ok.status, 201);
  const black = await db
    .prepare("SELECT stock FROM inventory WHERE id = 'inv-cap-black'")
    .first();
  assert.equal(black.stock, 9);

  // Out-of-stock color is rejected — never oversold.
  const oos = await checkout(
    checkoutPayload([{ productId: "prod-color", colorId: "cap-cream", quantity: 1 }]),
  );
  assert.equal(oos.status, 400);
  assert.equal((await oos.json()).code, "INSUFFICIENT_STOCK");
});

test("checkout — size-only product requires a size, rejects colors, XXL works", async () => {
  // Unsupported variation: a color on a size-only product must be rejected.
  const rejected = await checkout(
    checkoutPayload([{ productId: "prod-size", colorId: "cap-black", size: "M", quantity: 1 }]),
  );
  assert.equal(rejected.status, 400);
  const rejectedData = await rejected.json();
  assert.equal(rejectedData.code, "INVALID_VARIATION");
  assert.match(rejectedData.message, /does not support color variations/);

  // XXL is a first-class size end-to-end: accepted, stored, deducted.
  const ok = await checkout(
    checkoutPayload([{ productId: "prod-size", size: "XXL", quantity: 1 }]),
  );
  assert.equal(ok.status, 201);
  const xxl = await db
    .prepare("SELECT stock FROM inventory WHERE id = 'inv-tshirt-xxl'")
    .first();
  assert.equal(xxl.stock, 2);

  const item = await db
    .prepare("SELECT * FROM order_items WHERE order_id = ?")
    .bind((await ok.json()).orderId)
    .first();
  assert.equal(item.size, "XXL");
  assert.equal(item.size_id, "size-xxl");
  assert.equal(item.color_id, null);

  // Out-of-stock size is rejected.
  const oos = await checkout(
    checkoutPayload([{ productId: "prod-size", size: "L", quantity: 1 }]),
  );
  assert.equal(oos.status, 400);
  assert.equal((await oos.json()).code, "INSUFFICIENT_STOCK");
});

test("checkout — color+size product validates the exact combination", async () => {
  // Missing size on a color_size product is rejected.
  const missingSize = await checkout(
    checkoutPayload([{ productId: "prod-cs", colorId: "cs-black", quantity: 1 }]),
  );
  assert.equal(missingSize.status, 400);
  const missingSizeData = await missingSize.json();
  assert.equal(missingSizeData.code, "INVALID_PAYLOAD");
  assert.match(missingSizeData.message, /Size is required/);

  // Color not belonging to the product is rejected.
  const wrongColor = await checkout(
    checkoutPayload([{ productId: "prod-cs", colorId: "cap-black", size: "M", quantity: 1 }]),
  );
  assert.equal(wrongColor.status, 400);
  assert.equal((await wrongColor.json()).code, "COLOR_NOT_FOUND");

  // Out-of-stock combination is rejected.
  const oos = await checkout(
    checkoutPayload([{ productId: "prod-cs", colorId: "cs-black", size: "L", quantity: 1 }]),
  );
  assert.equal(oos.status, 400);
  assert.equal((await oos.json()).code, "INSUFFICIENT_STOCK");

  // Valid Black/XXL purchase deducts from the exact combination — both the
  // inventory row and the legacy mirror stay in sync.
  const ok = await checkout(
    checkoutPayload([{ productId: "prod-cs", colorId: "cs-black", size: "XXL", quantity: 1 }]),
  );
  assert.equal(ok.status, 201);
  const inventoryRow = await db
    .prepare("SELECT stock FROM inventory WHERE id = 'inv-cs-black-xxl'")
    .first();
  assert.equal(inventoryRow.stock, 0);
  const mirror = await db
    .prepare("SELECT stock FROM product_variants WHERE id = 'var-cs-black-xxl'")
    .first();
  assert.equal(mirror.stock, 0);

  const item = await db
    .prepare("SELECT * FROM order_items WHERE order_id = ?")
    .bind((await ok.json()).orderId)
    .first();
  assert.equal(item.color_id, "cs-black");
  assert.equal(item.size, "XXL");
  assert.equal(item.size_id, "size-xxl");

  // A different combination on the same product is untouched.
  const creamS = await db
    .prepare("SELECT stock FROM inventory WHERE id = 'inv-cs-cream-s'")
    .first();
  assert.equal(creamS.stock, 4);
});
