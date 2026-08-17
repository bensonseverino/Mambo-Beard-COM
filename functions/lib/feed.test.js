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

  // prod-2 ships without an image in the shared seed; the feed refuses
  // image-less products, so give it one here to keep it feedable.
  await db
    .prepare(
      `INSERT INTO product_images (id, product_id, color_id, path, type, file_name, size, uploaded_at, is_primary, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "img-2",
      "prod-2",
      "color-2",
      "products/precision-beard-trimmer/matte-black/front.webp",
      "front",
      "front.webp",
      1000,
      "2026-08-01T00:00:00.000Z",
      1,
      1,
    )
    .run();
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
  assert.match(xml, /<g:availability>in_stock<\/g:availability>/);
  // Every item carries feed-level shipping for the KE target market, priced
  // at the store's default delivery fee (500.00 KES).
  assert.match(
    xml,
    /<g:shipping>\s*<g:country>KE<\/g:country>\s*<g:service>Standard Delivery<\/g:service>\s*<g:price>500\.00 KES<\/g:price>\s*<\/g:shipping>/,
  );
  // Every item carries a shipping_weight so Merchant Center stops flagging
  // "Missing shipping weight" (seed: prod-1 "Care" → 0.4 kg, prod-2 "Tools" → 0.6 kg).
  assert.match(xml, /<g:shipping_weight>0\.4 kg<\/g:shipping_weight>/);
  assert.match(xml, /<g:shipping_weight>0\.6 kg<\/g:shipping_weight>/);
  assert.equal(
    (xml.match(/<g:shipping_weight>\d+(\.\d+)? (g|kg|lb|oz)<\/g:shipping_weight>/g) || [])
      .length,
    2,
  );
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
  assert.match(xml, /<g:availability>out_of_stock<\/g:availability>/);
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

  const insertImage = (id, productId, path) =>
    db
      .prepare(
        `INSERT INTO product_images (id, product_id, color_id, path, type, file_name, size, uploaded_at, is_primary, sort_order)
         VALUES (?, ?, NULL, ?, 'front', ?, 1000, ?, 1, 1)`,
      )
      .bind(id, productId, path, path, "2026-08-03T00:00:00.000Z")
      .run();

  await insertProduct("prod-hoodie", "Drop Hoodie", "drop-hoodie", "Hoodies");
  await insertProduct("prod-tee", "Logo Tee", "logo-tee", "Tees");
  await insertProduct("prod-cap", "Snapback Cap", "snapback-cap", "Caps");
  await insertProduct("prod-x", "Mystery Item", "mystery-item", "Mystery");
  await insertImage("img-hoodie", "prod-hoodie", "products/drop-hoodie/front.webp");
  await insertImage("img-tee", "prod-tee", "products/logo-tee/front.webp");
  await insertImage("img-cap", "prod-cap", "products/snapback-cap/front.webp");
  await insertImage("img-x", "prod-x", "products/mystery-item/front.webp");

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
  // Shipping weight follows the category rules; unknown categories use the
  // store-wide default (0.5 kg).
  assert.match(xml, /<g:id>prod-hoodie<\/g:id>[\s\S]*?<g:shipping_weight>0\.8 kg<\/g:shipping_weight>/);
  assert.match(xml, /<g:id>prod-tee<\/g:id>[\s\S]*?<g:shipping_weight>0\.4 kg<\/g:shipping_weight>/);
  assert.match(xml, /<g:id>prod-cap<\/g:id>[\s\S]*?<g:shipping_weight>0\.3 kg<\/g:shipping_weight>/);
  assert.match(xml, /<g:id>prod-x<\/g:id>[\s\S]*?<g:shipping_weight>0\.5 kg<\/g:shipping_weight>/);
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
  await db
    .prepare(
      `INSERT INTO product_images (id, product_id, color_id, path, type, file_name, size, uploaded_at, is_primary, sort_order)
       VALUES (?, ?, NULL, ?, 'front', ?, 1000, ?, 1, 1)`,
    )
    .bind(
      "img-3",
      "prod-3",
      "products/tees-hoodies/front.webp",
      "front.webp",
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

test("products.xml refuses image-less products and logs them loudly", async () => {
  await db
    .prepare(
      `INSERT INTO products (id, name, slug, description, price, category, featured, active, variation_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "prod-nopic",
      "No Photo Item",
      "no-photo-item",
      "Has no image row at all.",
      15,
      "Care",
      0,
      1,
      "none",
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    )
    .run();

  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  let xml;
  try {
    xml = await (await feedHandler({ env: { DB: db } })).text();
  } finally {
    console.error = originalError;
  }

  // The image-less product is not emitted with a broken image_link…
  assert.doesNotMatch(xml, /no-photo-item/);
  assert.match(xml, /classic-beard-oil/);
  // …but it is logged loudly with its id so the source data gets fixed.
  assert.ok(
    logs.some((line) => line.includes("prod-nopic") && line.includes("image")),
    "expected a loud log entry for the image-less product",
  );
});

test("products.xml uses the per-product weight column when set, else the category default", async () => {
  await db.prepare("UPDATE products SET weight = 1.25 WHERE id = 'prod-1'").run();

  const xml = await (await feedHandler({ env: { DB: db } })).text();
  // prod-1 has an explicit weight → used verbatim.
  assert.match(
    xml,
    /<g:id>prod-1<\/g:id>[\s\S]*?<g:shipping_weight>1\.25 kg<\/g:shipping_weight>/,
  );
  // prod-2 has no weight → category default (Tools → 0.6 kg).
  assert.match(
    xml,
    /<g:id>prod-2<\/g:id>[\s\S]*?<g:shipping_weight>0\.6 kg<\/g:shipping_weight>/,
  );
});
