// Dynamic sitemap — served fresh from the D1 catalog on every request, so
// creating, updating, unpublishing, or deleting a product instantly changes
// the sitemap with no redeploy.

import { ensureSchema } from "./lib/schema.js";

const getSiteUrl = (env) =>
  (env?.SITE_URL || env?.CF_PAGES_URL || "https://mambobeard.store").replace(
    /\/$/,
    "",
  );

const xmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function onRequestGet(context) {
  const { env } = context;

  // Self-healing schema; if the DB is unavailable we still serve the
  // static section of the sitemap.
  try {
    await ensureSchema(env);
  } catch {
    // ignore — static URLs below remain valid
  }

  let products = [];
  try {
    const result = await env?.DB?.prepare(
      "SELECT slug, updated_at FROM products WHERE active = 1",
    ).all();
    products = result?.results || [];
  } catch {
    products = [];
  }

  const site = getSiteUrl(env);
  const today = new Date().toISOString().slice(0, 10);

  const entries = [
    { loc: "/", lastmod: today, changefreq: "daily", priority: "1.0" },
    { loc: "/terms", lastmod: today, changefreq: "monthly", priority: "0.3" },
    {
      loc: "/privacy",
      lastmod: today,
      changefreq: "monthly",
      priority: "0.3",
    },
    ...products.map((product) => ({
      loc: `/product/${product.slug}`,
      lastmod: (product.updated_at || "").slice(0, 10) || today,
      changefreq: "weekly",
      priority: "0.8",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${site}${xmlEscape(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
