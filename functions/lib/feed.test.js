import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { onRequestGet as feedHandler } from "../feeds/products.xml.js";
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

test("products.xml returns a Google Shopping RSS feed with active products", async () => {
  const response = await feedHandler({ env: { DB: db } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);

  const xml = await response.text();
  assert.match(
    xml,
    /<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/,
  );
  assert.match(xml, /<g:id>prod-1<\/g:id>/);
  assert.match(xml, /<title>Classic Beard Oil<\/title>/);
  assert.match(xml, /<link>https:\/\/mambobeard\.store\/product\/classic-beard-oil<\/link>/);
  assert.match(
    xml,
    /<g:image_link>https:\/\/mambobeard\.store\/products\/classic-beard-oil\/amber\/front\.webp<\/g:image_link>/,
  );
  assert.match(xml, /<g:price>24\.00 KES<\/g:price>/);
  assert.match(xml, /<g:brand>Mambo Beard<\/g:brand>/);
  assert.match(xml, /<g:availability>in stock<\/g:availability>/);
  // Every item declares identifier_exists=false (no GTIN/MPN on these products)
  // so Merchant Center stops flagging missing identifiers.
  assert.equal(
    (xml.match(/<g:identifier_exists>false<\/g:identifier_exists>/g) || [])
      .length,
    2,
  );
  // Category → Google taxonomy: seed uses "Care" and "Tools".
  assert.match(
    xml,
    /<g:google_product_category>Health &amp; Beauty &gt; Personal Care &gt; Shaving &amp; Grooming<\/g:google_product_category>/,
  );
  assert.match(
    xml,
    /<g:google_product_category>Health &amp; Beauty &gt; Personal Care &gt; Shaving &amp; Grooming &gt; Hair Clippers &amp; Trimmers<\/g:google_product_category>/,
  );
});

test("products.xml marks items without stock as out of stock", async () => {
  const xml = await (await feedHandler({ env: { DB: db } })).text();
  // prod-2 has no inventory/variant rows in the seed.
  assert.match(xml, /<g:id>prod-2<\/g:id>/);
  assert.match(xml, /<g:availability>out of stock<\/g:availability>/);
});

test("products.xml excludes unpublished products", async () => {
  await db.prepare("UPDATE products SET active = 0 WHERE id = 'prod-2'").run();

  const xml = await (await feedHandler({ env: { DB: db } })).text();
  assert.match(xml, /classic-beard-oil/);
  assert.doesNotMatch(xml, /precision-beard-trimmer/);
});

test("products.xml honors custom SITE_URL and R2_PUBLIC_URL", async () => {
  const xml = await (
    await feedHandler({
      env: {
        DB: db,
        SITE_URL: "https://shop.example.com",
        R2_PUBLIC_URL: "https://cdn.example.com",
      },
    })
  ).text();
  assert.match(xml, /<link>https:\/\/shop\.example\.com\/product\/classic-beard-oil<\/link>/);
  assert.match(
    xml,
    /<g:image_link>https:\/\/cdn\.example\.com\/products\/classic-beard-oil\/amber\/front\.webp<\/g:image_link>/,
  );
});

test("products.xml returns 500 when the DB is unreachable", async () => {
  const response = await feedHandler({ env: {} });
  assert.equal(response.status, 500);
});

test("products.xml maps apparel categories to the Google taxonomy and omits unknown ones", async () => {
  const insertProduct = async (id, name, slug, category) =>
    db
      .prepare(
        `INSERT INTO products (id, name, slug, description, price, category, featured, active, variation_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        name,
        slug,
        `The ${name}.`,
        40,
        category,
        0,
        1,
        "none",
        "2026-08-03T00:00:00.000Z",
        "2026-08-03T00:00:00.000Z",
      )
      .run();

  await insertProduct("prod-hoodie", "Drop Hoodie", "drop-hoodie", "Hoodies");
  await insertProduct("prod-tee", "Logo Tee", "logo-tee", "Tees");
  await insertProduct("prod-cap", "Snapback Cap", "snapback-cap", "Caps");
  await insertProduct("prod-x", "Mystery Item", "mystery-item", "Mystery");

  const xml = await (await feedHandler({ env: { DB: db } })).text();
  assert.match(
    xml,
    /<g:id>prod-hoodie<\/g:id>[\s\S]*?<g:google_product_category>Apparel &amp; Accessories &gt; Clothing &gt; Outerwear<\/g:google_product_category>/,
  );
  assert.match(
    xml,
    /<g:id>prod-tee<\/g:id>[\s\S]*?<g:google_product_category>Apparel &amp; Accessories &gt; Clothing &gt; Shirts &amp; Tops<\/g:google_product_category>/,
  );
  assert.match(
    xml,
    /<g:id>prod-cap<\/g:id>[\s\S]*?<g:google_product_category>Apparel &amp; Accessories &gt; Clothing Accessories &gt; Hats<\/g:google_product_category>/,
  );
  // Unmatched categories omit the tag so Google auto-classifies.
  const prodXBlock = xml.split("</item>").find((part) => part.includes("prod-x"));
  assert.ok(prodXBlock, "prod-x item is present");
  assert.match(prodXBlock, /<title>Mystery Item<\/title>/);
  assert.doesNotMatch(prodXBlock, /google_product_category/);
});

test("products.xml escapes XML-special characters", async () => {
  await db
    .prepare(
      `INSERT INTO products (id, name, slug, description, price, category, featured, active, variation_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "prod-3",
      'Tees & "Hoodies" <Limited>',
      "tees-hoodies",
      "Shirts < 100 & more > today's drop",
      30,
      "Apparel",
      0,
      1,
      "none",
      "2026-08-02T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
    )
    .run();

  const xml = await (await feedHandler({ env: { DB: db } })).text();
  assert.match(xml, /<title>Tees &amp; &quot;Hoodies&quot; &lt;Limited&gt;<\/title>/);
  assert.match(
    xml,
    /<g:description>Shirts &lt; 100 &amp; more &gt; today&apos;s drop<\/g:description>/,
  );
});
