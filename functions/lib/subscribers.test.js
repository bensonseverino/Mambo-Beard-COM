import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { onRequestPost as subscribeHandler } from "../api/subscribers.js";
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

const subscribe = (body) =>
  subscribeHandler({
    request: new Request("https://example.com/api/subscribers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: { DB: db },
  });

const tableExists = async (name) => {
  const result = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .all();
  return result.results.length > 0;
};

const countSubscribers = async () => {
  const result = await db.prepare("SELECT COUNT(*) AS count FROM subscribers").first();
  return Number(result.count);
};

test("subscribe bootstraps the subscribers table when missing", async () => {
  await db.exec("DROP TABLE IF EXISTS subscribers");
  assert.equal(await tableExists("subscribers"), false);

  const response = await subscribe({ phone: "+254712345678" });
  assert.equal(response.status, 201);
  assert.equal(await tableExists("subscribers"), true);
});

test("subscribe accepts and normalizes a 0-prefixed Kenyan number", async () => {
  const response = await subscribe({ phone: "0712345678" });
  assert.equal(response.status, 201);

  const data = await response.json();
  assert.equal(data.success, true);
  assert.equal(data.phone, "+254712345678");

  const row = await db.prepare("SELECT * FROM subscribers").first();
  assert.equal(row.phone, "+254712345678");
});

test("subscribe accepts a +254-prefixed number unchanged", async () => {
  const response = await subscribe({ phone: "+254712345678" });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.phone, "+254712345678");
});

test("subscribe accepts a 254-prefixed number", async () => {
  const response = await subscribe({ phone: "254712345678" });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.phone, "+254712345678");
});

test("subscribe rejects invalid numbers with a structured 400", async () => {
  for (const phone of ["12345", "+25471234", "071234567", "07123456789", "abc"]) {
    const response = await subscribe({ phone });
    assert.equal(response.status, 400, `expected 400 for ${phone}`);
    const data = await response.json();
    assert.equal(data.success, false);
    assert.equal(data.code, "INVALID_PHONE");
  }
  assert.equal(await countSubscribers(), 0);
});

test("subscribe rejects missing phone with a structured 400", async () => {
  const response = await subscribe({});
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.code, "INVALID_PHONE");
});

test("subscribe rejects malformed JSON with a structured 400", async () => {
  const response = await subscribeHandler({
    request: new Request("https://example.com/api/subscribers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }),
    env: { DB: db },
  });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.code, "INVALID_PAYLOAD");
});

test("duplicate subscriptions are idempotent (one row, 201 both times)", async () => {
  const first = await subscribe({ phone: "0712345678" });
  assert.equal(first.status, 201);

  const second = await subscribe({ phone: "+254712345678" });
  assert.equal(second.status, 201);
  assert.equal(await countSubscribers(), 1);
});

test("different phones create separate rows", async () => {
  await subscribe({ phone: "0712345678" });
  await subscribe({ phone: "0722000000" });
  assert.equal(await countSubscribers(), 2);
});
