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

test("GET /api/products/:slug returns the assigned size chart", async () => {
  await db
    .prepare("UPDATE products SET size_chart = ? WHERE id = ?")
    .bind(
      JSON.stringify({
        columns: ["Chest (cm)", "Length (cm)"],
        rows: [{ size: "M", measurements: ["96", "70"] }],
      }),
      "prod-1",
    )
    .run();

  const response = await productDetailHandler({
    env: { DB: db },
    params: { slug: "classic-beard-oil" },
  });
  const { product } = await response.json();

  assert.deepEqual(product.sizeChart, {
    columns: ["Chest (cm)", "Length (cm)"],
    rows: [{ size: "M", measurements: ["96", "70"] }],
  });
});

test("GET /api/products/:slug serves chart sizes in the catalog's notation", async () => {
  await db
    .prepare("UPDATE products SET size_chart = ? WHERE id = ?")
    .bind(
      JSON.stringify({
        columns: ["UK Size", "Chest (in)"],
        rows: [
          { size: "XL", measurements: ["12-14", "44"] },
          { size: "2XL", measurements: ["14-16", "46"] },
          { size: "3XL", measurements: ["16-18", "48"] },
        ],
      }),
      "prod-1",
    )
    .run();

  const response = await productDetailHandler({
    env: { DB: db },
    params: { slug: "classic-beard-oil" },
  });
  const { product } = await response.json();

  // This catalog spells its sizes with X's (the seeded sizes table ends at
  // XXL), so the chart must not print "2XL" next to an XXL size selector —
  // and the "3XL" row it can't fulfil is dropped outright.
  assert.deepEqual(
    product.sizeChart.rows.map((row) => row.size),
    ["XL", "XXL"],
  );
  // Columns pass through untouched: they carry the unit the caption reads.
  assert.deepEqual(product.sizeChart.columns, ["UK Size", "Chest (in)"]);
  // Translating labels is read-time only — the stored chart keeps its own.
  const stored = await db
    .prepare("SELECT size_chart FROM products WHERE id = ?")
    .bind("prod-1")
    .first();
  assert.match(stored.size_chart, /2XL/);
});

test("chart rows stop at the sizes the store sells", async () => {
  // The seeded catalog is XS–XXL; this chart publishes XS through 3XL.
  await db
    .prepare("UPDATE products SET size_chart = ? WHERE id = ?")
    .bind(
      JSON.stringify({
        columns: ["UK Size", "Chest (in)"],
        rows: [
          { size: "XS", measurements: ["4-6", "32"] },
          { size: "S", measurements: ["6-8", "34"] },
          { size: "M", measurements: ["8-10", "36"] },
          { size: "L", measurements: ["10-12", "38"] },
          { size: "XL", measurements: ["12-14", "44"] },
          { size: "2XL", measurements: ["14-16", "46"] },
          { size: "3XL", measurements: ["16-18", "48"] },
        ],
      }),
      "prod-1",
    )
    .run();

  const response = await productDetailHandler({
    env: { DB: db },
    params: { slug: "classic-beard-oil" },
  });
  const { product } = await response.json();

  assert.deepEqual(
    product.sizeChart.rows.map((row) => row.size),
    ["XS", "S", "M", "L", "XL", "XXL"],
  );
  // Columns and the surviving measurements are untouched by the trim, and the
  // dropped size takes its measurements with it.
  assert.deepEqual(product.sizeChart.columns, ["UK Size", "Chest (in)"]);
  assert.deepEqual(product.sizeChart.rows[5].measurements, ["14-16", "46"]);
  assert.ok(!JSON.stringify(product.sizeChart).includes("48"));
});

test("a chart with no sellable size is published rather than hidden", async () => {
  await db
    .prepare("UPDATE products SET size_chart = ? WHERE id = ?")
    .bind(
      JSON.stringify({
        columns: ["Length (in)"],
        rows: [{ size: "3XL", measurements: ["32"] }],
      }),
      "prod-1",
    )
    .run();

  const response = await productDetailHandler({
    env: { DB: db },
    params: { slug: "classic-beard-oil" },
  });
  const { product } = await response.json();

  // An assigned chart is never emptied: hiding it would look like the admin's
  // assignment was lost, so the rows are published as written instead.
  assert.deepEqual(
    product.sizeChart.rows.map((row) => row.size),
    ["XXXL"],
  );
});

test("chart rows collapse labels that name the same size", async () => {
  const { parseSizeChart } = await import("./product.js");
  const chart = parseSizeChart(
    JSON.stringify({
      columns: ["Chest (in)"],
      rows: [
        { size: "2XL", measurements: ["46"] },
        { size: "XXL", measurements: ["46"] },
        { size: "One size", measurements: [""] },
      ],
    }),
  );

  // "2XL" and "XXL" are one size: the second row would repeat in the table
  // and collide as a React key. Other labels are left exactly as written.
  assert.deepEqual(
    chart.rows.map((row) => row.size),
    ["XXL", "One size"],
  );
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
