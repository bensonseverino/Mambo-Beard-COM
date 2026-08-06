import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { ensureSchema } from "./schema.js";
import {
  buildSeoForPath,
  buildHeadHtml,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  NOT_FOUND_TITLE,
  TERMS_TITLE,
  PRIVACY_TITLE,
} from "./edge-seo.js";

let mf;
let db;

const ENV = {
  DB: null,
  SITE_URL: "https://shop.example.com",
  R2_PUBLIC_URL: "https://cdn.example.com",
};

test.beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { async fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  ENV.DB = db;
  await ensureSchema(ENV);

  const seed = await import("./products-seed.js");
  await seed.seedProducts(db);
});

test.afterEach(async () => {
  await mf.dispose();
});

test("homepage emits brand title, hero OG image and backend CollectionPage", async () => {
  const seo = await buildSeoForPath("/", ENV, "https://shop.example.com");
  assert.equal(seo.title, DEFAULT_TITLE);
  assert.equal(seo.description, DEFAULT_DESCRIPTION);
  assert.equal(seo.canonical, "https://shop.example.com/");
  assert.equal(seo.image, "https://shop.example.com/hero.png");
  assert.equal(seo.noindex, false);
  assert.equal(seo.status, 200);

  const collection = seo.jsonLd.find((entry) => entry["@type"] === "CollectionPage");
  assert.ok(collection, "homepage should include CollectionPage JSON-LD");
  assert.equal(collection.mainEntity.itemListElement.length, 2);
  assert.equal(
    collection.mainEntity.itemListElement[0].url,
    "https://shop.example.com/product/classic-beard-oil",
  );
});

test("product page mirrors the client SEO: title, OG image priority, breadcrumbs, live availability", async () => {
  const seo = await buildSeoForPath("/product/classic-beard-oil", ENV, "https://shop.example.com");
  assert.equal(seo.title, "Classic Beard Oil | Mambo Beard");
  assert.equal(seo.type, "product");
  assert.equal(
    seo.canonical,
    "https://shop.example.com/product/classic-beard-oil",
  );
  // Featured image (is_primary) wins over gallery
  assert.equal(
    seo.image,
    "https://cdn.example.com/products/classic-beard-oil/amber/front.webp",
  );
  assert.match(seo.imageAlt, /Classic Beard Oil Amber front/);
  assert.equal(seo.preload, seo.image);
  assert.equal(seo.status, 200);

  const productSchema = seo.jsonLd.find((entry) => entry["@type"] === "Product");
  assert.ok(productSchema);
  assert.equal(productSchema.sku, "prod-1");
  assert.equal(productSchema.offers.priceCurrency, "KES");
  assert.equal(productSchema.offers.price, 24);
  assert.equal(productSchema.offers.availability, "https://schema.org/InStock");
  assert.equal(
    productSchema.image[0],
    "https://cdn.example.com/products/classic-beard-oil/amber/front.webp",
  );

  assert.ok(
    seo.jsonLd.some((entry) => entry["@type"] === "BreadcrumbList"),
    "product page should include breadcrumbs",
  );
});

test("availability flips to OutOfStock when variant stock hits zero", async () => {
  await db
    .prepare("UPDATE product_variants SET stock = 0 WHERE product_id = 'prod-1'")
    .run();
  const seo = await buildSeoForPath("/product/classic-beard-oil", ENV, "https://shop.example.com");
  const productSchema = seo.jsonLd.find((entry) => entry["@type"] === "Product");
  assert.equal(productSchema.offers.availability, "https://schema.org/OutOfStock");
});

test("missing product gets noindex + 404 (SPA still renders)", async () => {
  const seo = await buildSeoForPath("/product/does-not-exist", ENV, "https://shop.example.com");
  assert.equal(seo.title, NOT_FOUND_TITLE);
  assert.equal(seo.noindex, true);
  assert.equal(seo.status, 404);
  assert.ok(!seo.jsonLd.some((entry) => entry["@type"] === "Product"));
});

test("unpublished product gets noindex + 404 and is absent from sitemap data", async () => {
  await db.prepare("UPDATE products SET active = 0 WHERE id = 'prod-2'").run();
  const seo = await buildSeoForPath("/product/precision-beard-trimmer", ENV, "https://shop.example.com");
  assert.equal(seo.status, 404);
  assert.equal(seo.noindex, true);
});

test("both /product and /products URL forms are detected", async () => {
  const plural = await buildSeoForPath("/products/classic-beard-oil", ENV, "https://shop.example.com");
  assert.equal(plural.title, "Classic Beard Oil | Mambo Beard");
  assert.equal(plural.status, 200);
});

test("static pages get their own titles", async () => {
  const terms = await buildSeoForPath("/terms", ENV, "https://shop.example.com");
  assert.equal(terms.title, TERMS_TITLE);
  assert.equal(terms.status, 200);

  const privacy = await buildSeoForPath("/privacy", ENV, "https://shop.example.com");
  assert.equal(privacy.title, PRIVACY_TITLE);
});

test("collection pages generate dynamic metadata from backend categories", async () => {
  const seo = await buildSeoForPath("/collections/tools", ENV, "https://shop.example.com");
  assert.equal(seo.title, "Tools | Mambo Beard");
  const collection = seo.jsonLd.find((entry) => entry["@type"] === "CollectionPage");
  assert.equal(collection.mainEntity.itemListElement.length, 1);
  assert.equal(collection.mainEntity.itemListElement[0].name, "Precision Beard Trimmer");
});

test("unknown SPA routes fall back to brand defaults with the requested canonical", async () => {
  const seo = await buildSeoForPath("/checkout", ENV, "https://shop.example.com");
  assert.equal(seo.title, DEFAULT_TITLE);
  assert.equal(seo.canonical, "https://shop.example.com/checkout");
  assert.equal(seo.status, 200);
});

test("buildHeadHtml emits the full tag set with data-rh and safe escaping", () => {
  const html = buildHeadHtml({
    title: 'Classic Beard Oil | Mambo Beard & Co',
    description: "A cedar-scented blend.",
    canonical: "https://shop.example.com/product/classic-beard-oil",
    type: "product",
    image: "https://cdn.example.com/p/front.webp",
    imageAlt: "Mambo Beard Classic Beard Oil Amber Front",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        description: 'a </script> b "quote" & more',
      },
    ],
    noindex: false,
    preload: "https://cdn.example.com/p/front.webp",
  });

  assert.match(html, /<meta name="description" content="A cedar-scented blend\." data-rh="true">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/shop\.example\.com\/product\/classic-beard-oil" data-rh="true">/);
  assert.match(html, /property="og:site_name" content="Mambo Beard"/);
  assert.match(html, /property="og:type" content="product"/);
  assert.match(html, /property="og:url"/);
  assert.match(html, /property="og:image" content="https:\/\/cdn\.example\.com\/p\/front\.webp"/);
  assert.match(html, /property="og:image:alt"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image"/);
  assert.match(html, /<link rel="preload" as="image"/);
  assert.match(html, /data-rh="true"/);

  // JSON-LD `<` must be escaped as \u003c — a literal `</script>` sequence
  // can never appear inside the serialized JSON, so the document contains
  // exactly one script closing tag (the legitimate one).
  assert.match(html, /a \\u003c\/script> b/);
  assert.match(html, /<script type="application\/ld\+json" data-rh="true">\{/);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  // Attribute escaping: the `&` in the title becomes &amp;
  assert.match(html, /&amp; Co/);

  // noindex emits the robots meta only when requested
  assert.doesNotMatch(html, /name="robots"/);
  const noindexHtml = buildHeadHtml({ canonical: "https://x.test/", noindex: true });
  assert.match(noindexHtml, /name="robots" content="noindex, nofollow"/);
});

test("product metadata never renders an empty og:image", async () => {
  // Wipe the product's images so only the brand default remains
  await db.prepare("DELETE FROM product_images WHERE product_id = 'prod-1'").run();
  const seo = await buildSeoForPath("/product/classic-beard-oil", ENV, "https://shop.example.com");
  assert.equal(seo.image, "https://shop.example.com/hero.png");
  const productSchema = seo.jsonLd.find((entry) => entry["@type"] === "Product");
  assert.equal(productSchema.image[0], "https://shop.example.com/hero.png");
});
