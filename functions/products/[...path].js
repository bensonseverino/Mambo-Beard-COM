// Serves product images from the R2 `PRODUCTS` bucket at /products/<object key>.
//
// The storefront stores R2 object keys in product_images.path with a
// "products/" prefix (e.g. "products/ts-01/black/front/…webp"), and image
// URLs everywhere (feed g:image_link, OG/preload tags, <img> tags) are built
// as {SITE_URL}/products/<path-without-prefix>. Without this route those
// URLs fell through to the SPA shell (200 with text/html), so image links
// were broken for Google, Meta, and social crawlers.
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

export async function onRequestGet(context) {
  const { env, params } = context;

  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key) {
    return new Response("Not Found", { status: 404 });
  }

  let object = await env?.PRODUCTS?.get(`products/${key}`);
  if (!object) {
    object = await env?.PRODUCTS?.get(key);
  }
  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": contentTypeFor(key, object.httpMetadata),
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
