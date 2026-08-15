import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { onRequestGet as imagesHandler } from "../products/[...path].js";

let mf;
let bucket;

test.beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { async fetch() { return new Response('ok'); } }",
    r2Buckets: ["PRODUCTS"],
  });
  bucket = await mf.getR2Bucket("PRODUCTS");
});

test.afterEach(async () => {
  await mf.dispose();
});

test("serves images whose R2 key starts with the products/ prefix", async () => {
  await bucket.put("products/ts-01/black/front/abc.webp", new Uint8Array([1, 2, 3]), {
    httpMetadata: { contentType: "image/webp" },
  });

  const response = await imagesHandler({
    env: { PRODUCTS: bucket },
    params: { path: ["ts-01", "black", "front", "abc.webp"] },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.match(response.headers.get("cache-control"), /public/);
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [1, 2, 3],
  );
});

test("serves images stored without the prefix", async () => {
  await bucket.put("ts-01/black/front/abc.png", new Uint8Array([9]), {
    httpMetadata: { contentType: "image/png" },
  });

  const response = await imagesHandler({
    env: { PRODUCTS: bucket },
    params: { path: ["ts-01", "black", "front", "abc.png"] },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
});

test("infers content type from the extension when httpMetadata is absent", async () => {
  await bucket.put("products/mc-01/black/front/abc.webp", new Uint8Array([7]));

  const response = await imagesHandler({
    env: { PRODUCTS: bucket },
    params: { path: ["mc-01", "black", "front", "abc.webp"] },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
});

test("returns 404 for missing images", async () => {
  const response = await imagesHandler({
    env: { PRODUCTS: bucket },
    params: { path: ["missing", "image.webp"] },
  });

  assert.equal(response.status, 404);
});
