// Serves product images from the R2 `PRODUCTS` bucket at /products/<object key>.
//
// The storefront stores R2 object keys in product_images.path with a
// "products/" prefix (e.g. "products/ts-01/black/front/…webp"), and image
// URLs everywhere (feed g:image_link, OG/preload tags, <img> tags) are built
// as {SITE_URL}/products/<path-without-prefix>. Without this route those
// URLs fell through to the SPA shell (200 with text/html), so image links
// were broken for Google, Meta, and social crawlers.
//
// Responsive images: a `?w=NNN` query requests a resized variant. Variants
// are stored alongside originals under products/.resized/<width>/<key> and,
// when present, are served instead of the original. If no variant exists the
// original is served untouched — the srcset on the frontend keeps working
// and pages never break. (Generating variants is an ingestion-time concern:
// pre-generate them when uploading, or with a one-off worker/script.)
//
// Lookup tries the key with the "products/" prefix first, then the raw path,
// so buckets storing either layout work.

const EXT_TYPES = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const contentTypeFor = (key, httpMetadata) => {
  if (httpMetadata?.contentType) return httpMetadata.contentType;
  const ext = key.split(".").pop().toLowerCase();
  return EXT_TYPES[ext] || "application/octet-stream";
};

// Resolve the original R2 key for a URL path (with or without the
// "products/" prefix). Returns null when neither layout exists.
const findOriginalKey = async (bucket, key) => {
  let object = await bucket.get(`products/${key}`);
  if (object) return `products/${key}`;
  object = await bucket.get(key);
  if (object) return key;
  return null;
};

export async function onRequestGet(context) {
  const { env, params, request } = context;

  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key) {
    return new Response("Not Found", { status: 404 });
  }

  const bucket = env?.PRODUCTS;
  if (!bucket) {
    return new Response("Not Found", { status: 404 });
  }

  // ?w=NNN → serve the stored variant at that width when one exists.
  let width = null;
  if (request) {
    const widthParam = new URL(request.url).searchParams.get("w");
    if (widthParam && /^\d+$/.test(widthParam)) {
      width = Math.min(Math.max(parseInt(widthParam, 10), 16), 2048);
    }
  }

  const originalKey = await findOriginalKey(bucket, key);
  if (!originalKey) {
    return new Response("Not Found", { status: 404 });
  }

  let object = null;
  let servedKey = originalKey;
  // GIFs must always be served as-is to preserve animation — even if a
  // stale .resized variant exists from a previous script run, skip it.
  const isGif = originalKey.toLowerCase().endsWith(".gif");
  if (width && !isGif) {
    const variantKey = `products/.resized/${width}/${originalKey}`;
    object = await bucket.get(variantKey);
    if (object) servedKey = variantKey;
  }
  if (!object) {
    object = await bucket.get(originalKey);
  }

  // Variants are immutable per width, so a long edge cache is safe; the
  // ?w= query is part of the URL, so each width caches independently.
  // Originals keep a shorter TTL in case an admin ever overwrites a path.
  const cacheControl =
    servedKey !== originalKey
      ? "public, max-age=31536000, s-maxage=31536000, immutable"
      : "public, max-age=86400, s-maxage=86400";

  return new Response(object.body, {
    headers: {
      "Content-Type": contentTypeFor(servedKey, object.httpMetadata),
      "Cache-Control": cacheControl,
    },
  });
}
