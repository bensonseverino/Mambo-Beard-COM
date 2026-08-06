import { Helmet } from "react-helmet-async";
import { BRAND, canonicalUrl, brandDefaultImage } from "../utils/seo";

/**
 * Renders every search + social sharing tag for a page via react-helmet-async.
 *
 * Props:
 * - title: page title
 * - description: meta description (auto-truncation handled by builders)
 * - path: route path used for the canonical URL
 * - type: "website" | "product"
 * - image: absolute OG/Twitter image URL (falls back to the brand default)
 * - imageAlt: descriptive alt for the social image
 * - jsonLd: array of structured-data objects
 * - noindex: emit robots noindex (e.g. not-found pages)
 * - children: extra <link>/<meta> tags (e.g. hero image preload)
 */
export default function SEO({
  title,
  description,
  path = "/",
  type = "website",
  image,
  imageAlt,
  jsonLd = [],
  noindex = false,
  children,
}) {
  const url = canonicalUrl(path);
  const ogImage = image || brandDefaultImage();
  const ogType = type === "product" ? "product" : "website";

  return (
    <Helmet>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:site_name" content={BRAND} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      {ogImage && imageAlt && <meta property="og:image:alt" content={imageAlt} />}

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Structured data — passed as text children (Helmet writes them via
          textContent), with `<` escaped so `</script>` can never leak. */}
      {jsonLd.map((object, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(object).replace(/</g, "\\u003c")}
        </script>
      ))}

      {children}
    </Helmet>
  );
}
