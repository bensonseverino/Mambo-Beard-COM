#!/usr/bin/env node
// scripts/fix-image-encoding.mjs
//
// Re-encodes product images that Google Merchant Center rejects with
// "Invalid image encoding [image_link]".
//
// Root cause: the original WebP objects in R2 are single-frame images wrapped
// in a VP8X container with the ANIMATION flag set (plus an alpha ALPH chunk).
// Google does not accept animated images for image_link, so every product
// image gets flagged even though it looks fine in a browser. This script
// re-encodes each affected original with sharp (devDependency) — output is a
// plain lossy VP8 WebP with no VP8X / animation flag / alpha — and overwrites
// the R2 object IN PLACE under the same key, so feed URLs, OG tags and <img>
// srcs keep working with zero changes anywhere else.
//
// Only WebP files whose VP8X header actually sets the animation flag are
// touched; clean WebP / JPEG / PNG objects are left alone.
//
// Usage (from the project root, with wrangler authenticated):
//
//   npm run images:fix-encoding               # remote D1 + R2, overwrite originals
//   npm run images:fix-encoding -- --dry-run  # show what would change, touch nothing
//   npm run images:fix-encoding -- --local    # run against local wrangler state
//   npm run images:fix-encoding -- --quality 90
//   npm run images:fix-encoding -- --only hpqrqy,h4rygo  # only keys containing these substrings
//
// After running, purge the Cloudflare cache for /products/* (or wait for the
// 24h Cache-Control TTL) so Google's next image fetch gets the clean bytes,
// then re-fetch the feed in Merchant Center.

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import sharp from "sharp";

const DEFAULT_QUALITY = 90;
const WEBP_EXTENSIONS = new Set(["webp"]);

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
const QUALITY = parseInt(flag("quality") || `${DEFAULT_QUALITY}`, 10) || DEFAULT_QUALITY;
const CONCURRENCY = parseInt(flag("concurrency") || "3", 10) || 3;
const ONLY = (flag("only") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

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

/** Minimal JSONC → JSON: strips comments + trailing commas (see variants script). */
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
  return out.replace(/,([\s]*[}\]])/g, "$1");
};

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
  const rows = (payload?.[0]?.results || []).map((row) => row.path);
  return [...new Set(rows.filter(Boolean))];
};

const downloadObject = (bucketName, key, dest) => {
  try {
    run([
      "r2",
      "object",
      "get",
      `${bucketName}/${key}`,
      ...(LOCAL ? ["--local"] : ["--remote"]),
      "--file",
      dest,
    ]);
    return true;
  } catch {
    return false;
  }
};

const uploadObject = (bucketName, key, file, contentType) => {
  run([
    "r2",
    "object",
    "put",
    `${bucketName}/${key}`,
    ...(LOCAL ? ["--local"] : ["--remote"]),
    "--file",
    file,
    "--content-type",
    contentType,
  ]);
};

/**
 * True when a WebP buffer is wrapped in a VP8X container with the ANIMATION
 * flag set (bit 0x10) — the condition Google's crawler rejects. Genuinely
 * multi-frame (ANIM/ANMF) files also set this flag, so the check covers both.
 */
const isAnimatedWebp = (buf) => {
  if (!buf || buf.length < 12) return false;
  if (
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return false;
  }
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", pos, pos + 4);
    if (fourcc === "VP8X") {
      return (buf[pos + 8] & 0x10) !== 0;
    }
    const size = buf.readUInt32LE(pos + 4);
    pos += 8 + size + (size % 2);
  }
  return false;
};

/** Re-encode to a clean, static, opaque lossy WebP (no VP8X / alpha / ICCP). */
const reencodeStaticWebp = async (input, quality) =>
  sharp(input, { animated: false })
    .flatten({ background: "#ffffff" })
    .webp({ quality, alphaQuality: quality })
    .toBuffer();

const processImage = async (bucketName, path, tempDir, stats) => {
  const originalKey = path.startsWith("/") ? path.slice(1) : path;
  const ext = parse(originalKey).ext.slice(1).toLowerCase();
  if (!WEBP_EXTENSIONS.has(ext)) {
    stats.skipped += 1;
    return;
  }

  const originalFile = join(tempDir, `orig-${stats.index}.webp`);
  const found = downloadObject(bucketName, originalKey, originalFile);
  if (!found) {
    warn(`Original not found in R2, skipping: ${originalKey}`);
    stats.skipped += 1;
    return;
  }

  const input = await readFile(originalFile);
  if (!isAnimatedWebp(input)) {
    stats.clean += 1;
    return;
  }

  const fixed = await reencodeStaticWebp(input, QUALITY);
  if (isAnimatedWebp(fixed)) {
    warn(`Re-encode still animated after fix, skipping: ${originalKey}`);
    stats.skipped += 1;
    return;
  }

  if (DRY_RUN) {
    stats.planned += 1;
    log(`[dry-run] would overwrite ${originalKey} (${input.length} → ${fixed.length} bytes)`);
    return;
  }
  const fixedFile = join(tempDir, `fixed-${stats.index}.webp`);
  await writeFile(fixedFile, fixed);
  uploadObject(bucketName, originalKey, fixedFile, "image/webp");
  stats.fixed += 1;
  log(`✔ ${originalKey} (${input.length} → ${fixed.length} bytes)`);
};

const main = async () => {
  const { dbName, bucketName } = await readConfig();

  log(
    `${DRY_RUN ? "Dry run —" : "Targeting"} ${LOCAL ? "LOCAL" : "REMOTE"} D1 "${dbName}" and R2 "${bucketName}" — ` +
      `re-encoding animated WebP originals as static WebP (quality ${QUALITY}).`,
  );

  let paths;
  try {
    paths = fetchImagePaths(dbName);
  } catch (error) {
    throw new Error(
      `Could not read image paths from D1 (${LOCAL ? "local" : "remote"}). ` +
        `Is wrangler authenticated? (${error.message})`,
    );
  }
  if (ONLY.length) {
    paths = paths.filter((p) =>
      ONLY.some((needle) => p.toLowerCase().includes(needle)),
    );
    log(`Filtered to ${paths.length} image(s) matching --only (${ONLY.join(", ")}).`);
  }
  log(`${paths.length} unique product image(s) found.`);

  const stats = { fixed: 0, planned: 0, clean: 0, skipped: 0, index: 0 };
  const tempDir = await mkdtemp(join(tmpdir(), "mambo-fix-encoding-"));

  try {
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
    `Done — ${DRY_RUN ? stats.planned : stats.fixed} image(s) ` +
      `${DRY_RUN ? "would be re-encoded (dry run, nothing written)" : "re-encoded and overwritten"}, ` +
      `${stats.clean} already clean, ${stats.skipped} skipped.`,
  );
};

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
