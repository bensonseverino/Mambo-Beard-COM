// robots.txt served as a Pages Function so the sitemap URL always points at
// the correct deployment origin.

export async function onRequestGet(context) {
  const { env } = context;
  const site = (
    env?.SITE_URL ||
    env?.CF_PAGES_URL ||
    "https://www.mambobeard.com"
  ).replace(/\/$/, "");

  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${site}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
