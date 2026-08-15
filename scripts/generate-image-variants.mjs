#!/usr/bin/env node
// scripts/generate-image-variants.mjs
//
// Generates responsive image variants for every product image and uploads
// them to R2 under products/.resized/<width>/<key>.
//
// The storefront's srcset (src/services/api.js buildImageSrcSet) requests
// these variants through the image proxy (functions/products/[[path]].js),
// which serves a variant when it exists and falls back to the original
// otherwise. Run this once (and again after new uploads) so mobile devices
// stop downloading full-resolution photos.
//
// Usage (from the project root, with wrangler authenticated):
//
//   npm run images:optimize                # all widths, remote D1 + R2
//   npm run images:optimize -- --dry-run   # show what would happen, touch nothing
//   npm run images:optimize -- --local     # run against local wrangler state
//   npm run images:optimize -- --widths 400,640
//
// Requirements: node >= 18, wrangler auth (wrangler whoami), and the D1/R2
// names from wrangler.jsonc. All remote access goes through the wrangler CLI
// (no API tokens needed) — it shells out to:
//   wrangler d1 execute <db> --remote --json --command "SELECT path FROM product_images"
//   wrangler r2 object get  <bucket>/<key> --file <tmp>
//   wrangler r2 object put  <bucket>/products/.resized/<w>/<key> --file <tmp> --content-type image/webp

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import sharp from "sharp";

const DEFAULT_WIDTHS = [240, 400, 640, 960, 1280];
const DEFAULT_QUALITY = 80;
const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);

// Spawn the wrangler CLI through Node itself — works on Windows without
// shell/quoting issues around .cmd wrappers.
const require = createRequire(import.meta.url);
const WRANGLER_JS = require.resolve("wrangler");

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const has = (name) => args.includes(`--${name}`);

const DRY_RUN = has("dry-run");
const LOCAL = has("local");
const WIDTHS = (flag("widths") || "")
  .split(",")
  .map((n) => parseInt(n, 10))
  .filter((n) => Number.isInteger(n) && n >= 16 && n <= 4096);
const QUALITY = parseInt(flag("quality") || `${DEFAULT_QUALITY}`, 10) || DEFAULT_QUALITY;
const CONCURRENCY = parseInt(flag("concurrency") || "3", 10) || 3;
const widths = WIDTHS.length ? WIDTHS : DEFAULT_WIDTHS;

const run = (cargs) =>
  execFileSync(process.execPath, [WRANGLER_JS, ...cargs], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

const log = (msg) => console.log(msg);
const warn = (msg) => console.warn(`⚠  ${msg}`);

/** Remove a temp dir, retrying briefly — sharp keeps file handles open on
 * Windows and unlinking an open file raises EBUSY until they are released. */
const rmSafe = async (dir) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
};

/**
 * Minimal JSONC → JSON: strips line and block comments (respecting string
 * literals) plus trailing commas. Only used on our own wrangler.jsonc.
 */
const jsoncToJson = (input) => {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next;
        i += 1;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      inLine = true;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlock = true;
      i += 1;
      continue;
    }
    out += c;
  }
  // Trailing commas are legal in JSONC but not JSON.
  return out.replace(/,([\s]*[}\]])/g, "$1");
};

/** Read the D1/R2 names out of wrangler.jsonc. */
const readConfig = async () => {
  const raw = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const json = JSON.parse(jsoncToJson(raw));
  const db = json.d1_databases?.[0];
  const bucket = json.r2_buckets?.[0];
  if (!db?.database_name || !bucket?.bucket_name) {
    throw new Error(
      "Could not find d1_databases[0].database_name / r2_buckets[0].bucket_name in wrangler.jsonc",
    );
  }
  return { dbName: db.database_name, bucketName: bucket.bucket_name };
};

/** Query all product image paths from the (remote or local) D1 database. */
const fetchImagePaths = (dbName) => {
  const base = [
    "d1",
    "execute",
    dbName,
    ...(LOCAL ? ["--local"] : ["--remote"]),
    "--json",
    "--command",
    "SELECT path FROM product_images",
  ];
  const output = run(base);
  const payload = JSON.parse(output);
  // d1 execute --json returns [{ results, success, meta, ... }, ...]
  const rows = (payload?.[0]?.results || []).map((row) => row.path);
  return [...new Set(rows.filter(Boolean))];
};

/** Download an R2 object to a local file; returns false when it is missing. */
const downloadObject = (bucketName, key, dest) => {
  try {
    run([
      "r2",
      "object",
      "get",
      `${bucketName}/${key}`,
      ...(LOCAL ? ["--local"] : []),
      "--file",
      dest,
    ]);
    return true;
  } catch {
    return false;
  }
};

/** Upload a local file as a resized variant with a webp content type. */
const uploadVariant = (bucketName, key, file) => {
  run([
    "r2",
    "object",
    "put",
    `${bucketName}/${key}`,
    ...(LOCAL ? ["--local"] : []),
    "--file",
    file,
    "--content-type",
    "image/webp",
  ]);
};

/** Process one original image: resize to every width and upload variants. */
const processImage = async (bucketName, path, tempDir, stats) => {
  const originalKey = path.startsWith("/") ? path.slice(1) : path;
  const ext = parse(originalKey).ext.slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    warn(`Skipping non-image path: ${originalKey}`);
    return;
  }

  const originalFile = join(tempDir, `orig-${stats.index}.${ext}`);
  const found = downloadObject(bucketName, originalKey, originalFile);
  if (!found) {
    warn(`Original not found in R2, skipping: ${originalKey}`);
    stats.skipped += 1;
    return;
  }

  const base = sharp(originalFile, { failOn: "none" });
  const metadata = await base.metadata();

  for (const width of widths) {
    if (metadata.width && width >= metadata.width) continue; // never upscale

    const variantFile = join(tempDir, `variant-${stats.index}-${width}.webp`);
    await base
      .clone()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(variantFile);

    const variantKey = `products/.resized/${width}/${originalKey}`;
    if (DRY_RUN) {
      stats.planned += 1;
      log(`[dry-run] would upload ${variantKey}`);
      continue;
    }
    uploadVariant(bucketName, variantKey, variantFile);
    stats.uploaded += 1;
    log(`✔ ${variantKey}`);
  }
  stats.images += 1;
};

const main = async () => {
  const { dbName, bucketName } = await readConfig();

  if (DRY_RUN) {
    log(`Dry run — no data will be read or written. Widths: ${widths.join(", ")}`);
  } else {
    log(
      `Targeting ${LOCAL ? "LOCAL" : "REMOTE"} D1 "${dbName}" and R2 "${bucketName}" — ` +
        `widths ${widths.join(", ")}, webp quality ${QUALITY}.`,
    );
  }

  let paths;
  try {
    paths = fetchImagePaths(dbName);
  } catch (error) {
    throw new Error(
      `Could not read image paths from D1 (${LOCAL ? "local" : "remote"}). ` +
        `Is wrangler authenticated? (${error.message})`,
    );
  }
  log(`${paths.length} unique product image(s) found.`);

  const stats = { images: 0, uploaded: 0, planned: 0, skipped: 0, index: 0 };
  const tempDir = await mkdtemp(join(tmpdir(), "mambo-variants-"));

  try {
    // Work through the images with a bounded pool so we don't spawn dozens
    // of wrangler processes at once.
    const queue = [...paths];
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, Math.max(paths.length, 1)) },
      async () => {
        while (queue.length) {
          const path = queue.shift();
          await processImage(bucketName, path, tempDir, stats);
          stats.index += 1;
        }
      },
    );
    await Promise.all(workers);
  } finally {
    await rmSafe(tempDir);
  }

  log(
    `Done — ${stats.images} image(s) processed, ${DRY_RUN ? stats.planned : stats.uploaded} ` +
      `variant(s) ${DRY_RUN ? "planned (dry run, nothing written)" : "uploaded"}, ` +
      `${stats.skipped} skipped.`,
  );
};

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
