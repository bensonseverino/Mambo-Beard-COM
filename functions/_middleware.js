// Edge SEO & prerender middleware for the Mambo Beard storefront.
//
// Every HTML page request flows through here:
//
//   Browser → Edge → _middleware.js → D1 (product data) → HTMLRewriter
//   → HTML with title/meta/canonical/OG/Twitter/JSON-LD → React hydrates
//
// The React SPA is untouched — this only enriches the initial HTML so search
// engines and social crawlers see full metadata without executing JS.
//
// Tags are injected with data-rh="true", which react-helmet-async recognizes
// and adopts in place after hydration (no duplicate <title>/<meta>).
//
// Responses are cached in the Cache API. The cache key embeds a freshness
// version derived from D1 (product.updated_at), so any admin product
// create/update/unpublish/delete instantly changes the key — automatic
// invalidation with no manual purge and no redeploy.

import { buildSeoForPath, buildHeadHtml } from "./lib/edge-seo.js";

/** Paths with a real file extension — static assets, fonts, favicons, etc. */
const STATIC_FILE = /\.[a-zA-Z0-9]{2,5}$/;

const isPageRequest = (request, url) => {
  if (request.method !== "GET") return false;
  const path = url.pathname;
  if (path === "/api" || path.startsWith("/api/")) return false;
  if (path === "/sitemap.xml" || path === "/robots.txt") return false;
  if (path === "/feeds" || path.startsWith("/feeds/")) return false; // XML product feed
  if (path.startsWith("/_")) return false; // _worker.js and friends
  if (STATIC_FILE.test(path)) return false;
  return true;
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!isPageRequest(request, url)) {
    // API routes, static assets, sitemap/robots and everything else keep
    // their normal Pages pipeline.
    return next();
  }

  try {
    return await serveSeoPage(context, url);
  } catch (error) {
    // Never break the page: degrade to the untouched SPA shell.
    console.error("[edge-seo] middleware error:", error?.message || error);
    const shell = await env.ASSETS
      .fetch(new Request(`${url.origin}/index.html`))
      .catch(() => null);
    return shell || next();
  }
}

async function serveSeoPage(context, url) {
  const { env, waitUntil } = context;
  const path = url.pathname;

  const seo = await buildSeoForPath(path, env, url.origin);

  // Cache key embeds the data freshness version so product updates
  // invalidate instantly; TTL (Cache-Control/Expires) covers everything else.
  const cache = caches.default;
  const cacheKey = new Request(
    `${url.origin}${path}?edge_seo=${encodeURIComponent(seo.version || "0")}`,
  );
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  } catch (error) {
    console.warn("[edge-seo] cache read failed:", error?.message || error);
  }

  // The SPA shell — the only HTML document in the Pages build output.
  const shell = await env.ASSETS.fetch(
    new Request(`${url.origin}/index.html`),
  );
  if (!shell.ok) {
    throw new Error(`SPA shell fetch failed (${shell.status})`);
  }

  const headHtml = buildHeadHtml(seo);
  const transformed = new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(seo.title);
      },
    })
    .on("head", {
      element(element) {
        element.append(`\n    ${headHtml}\n  `, { html: true });
      },
    })
    .transform(shell);

  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  // Browsers always revalidate (max-age=0) so shoppers never sit on a stale
  // price; the CDN caches for the page TTL (s-maxage) and the version-keyed
  // Cache API keeps the function itself fresh after admin updates.
  headers.set(
    "Cache-Control",
    `public, max-age=0, s-maxage=${seo.ttl}`,
  );
  headers.set("Expires", new Date(Date.now() + seo.ttl * 1000).toUTCString());

  const response = new Response(transformed.body, {
    status: seo.status || 200,
    headers,
  });

  try {
    waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
  } catch (error) {
    console.warn("[edge-seo] cache write failed:", error?.message || error);
  }

  return response;
}
