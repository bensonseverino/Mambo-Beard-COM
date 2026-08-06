import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { onRequestGet as sitemapHandler } from "../sitemap.xml.js";
import { onRequestGet as robotsHandler } from "../robots.txt.js";
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

test("sitemap.xml includes static pages and every active product", async () => {
  const response = await sitemapHandler({ env: { DB: db } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);

  const xml = await response.text();
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/www\.mambobeard\.com\/<\/loc>/);
  assert.match(xml, /\/terms/);
  assert.match(xml, /\/privacy/);
  assert.match(xml, /\/product\/classic-beard-oil/);
  assert.match(xml, /\/product\/precision-beard-trimmer/);
});

test("sitemap.xml excludes unpublished products", async () => {
  await db.prepare("UPDATE products SET active = 0 WHERE id = 'prod-2'").run();

  const xml = await (await sitemapHandler({ env: { DB: db } })).text();
  assert.match(xml, /classic-beard-oil/);
  assert.doesNotMatch(xml, /precision-beard-trimmer/);
});

test("sitemap.xml still serves static URLs when the DB is unreachable", async () => {
  const response = await sitemapHandler({ env: {} });
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /\/terms/);
  assert.match(xml, /\/privacy/);
});

test("sitemap.xml honors a custom SITE_URL", async () => {
  const xml = await (
    await sitemapHandler({ env: { DB: db, SITE_URL: "https://shop.example.com" } })
  ).text();
  assert.match(xml, /<loc>https:\/\/shop\.example\.com\/<\/loc>/);
});

test("robots.txt allows crawling and references the sitemap", async () => {
  const response = await robotsHandler({ env: { DB: db } });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /User-agent: \*/);
  assert.match(body, /Allow: \//);
  assert.match(body, /Disallow: \/api\//);
  assert.match(body, /Sitemap: https:\/\/www\.mambobeard\.com\/sitemap\.xml/);
});
