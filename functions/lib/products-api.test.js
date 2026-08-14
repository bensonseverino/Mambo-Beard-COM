import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { onRequestGet as productsHandler } from "../api/products.js";
import { onRequestGet as productDetailHandler } from "../api/products/[slug].js";
import { onRequestGet as inventoryHandler } from "../api/inventory/[productId].js";
import { onRequestGet as categoriesHandler } from "../api/categories.js";
import { onRequestGet as colorsHandler } from "../api/colors.js";
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

  const seed = await import("./products-seed.js");
  await seed.seedProducts(db);
});

test.afterEach(async () => {
  await mf.dispose();
});

test("GET /api/products lists products with thumbnail and colors", async () => {
  const response = await productsHandler({
    env: { DB: db },
    request: new Request("https://example.com/api/products"),
  });
  assert.equal(response.status, 200);
  const { products } = await response.json();
  assert.equal(products.length, 2);
  assert.equal(products[0].name, "Classic Beard Oil");
  assert.match(products[0].thumbnail, /^products\//);
  assert.equal(products[0].colors.length, 1);
});

test("GET /api/products filters by category and search", async () => {
  const response = await productsHandler({
    env: { DB: db },
    request: new Request("https://example.com/api/products?category=Tools"),
  });
  const { products } = await response.json();
  assert.equal(products.length, 1);
  assert.equal(products[0].slug, "precision-beard-trimmer");
});

test("GET /api/products/:slug returns product with images, sizes, and variants", async () => {
  const response = await productDetailHandler({
    env: { DB: db },
    params: { slug: "classic-beard-oil" },
  });
  assert.equal(response.status, 200);
  const { product } = await response.json();
  assert.equal(product.id, "prod-1");
  assert.equal(product.variationType, "color_size");
  assert.equal(product.colors[0].name, "Amber");
  assert.equal(product.images[0].path, "products/classic-beard-oil/amber/front.webp");
  // Sizes are objects { id, name } in canonical order — not bare strings.
  assert.ok(product.sizes.some((size) => size.name === "M"));
  assert.equal(product.variants[0].stock, 5);
});

test("GET /api/products/:slug returns 404 for missing products", async () => {
  const response = await productDetailHandler({
    env: { DB: db },
    params: { slug: "does-not-exist" },
  });
  assert.equal(response.status, 404);
});

test("GET /api/inventory/:id returns variants", async () => {
  const response = await inventoryHandler({
    env: { DB: db },
    params: { productId: "prod-1" },
  });
  const { inventory } = await response.json();
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].size, "M");
});

test("GET /api/categories and /api/colors return distinct values", async () => {
  const categories = await (await categoriesHandler({ env: { DB: db } })).json();
  assert.deepEqual(categories.categories, ["Care", "Tools"]);

  const colors = await (await colorsHandler({ env: { DB: db } })).json();
  assert.equal(colors.colors.length, 2);
  assert.ok(colors.colors.some((color) => color.name === "Amber"));
});
