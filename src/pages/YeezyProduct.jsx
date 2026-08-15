import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import useProduct from "../hooks/useProduct";
import useProducts from "../hooks/useProducts";
import { useCart } from "../context/CartContext";
import { buildImageUrl } from "../services/api";
import SEO from "../components/SEO";
import {
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  NOT_FOUND_TITLE,
  productTitle,
  productDescription,
  pickProductImageMeta,
  productImageAlt,
  productJsonLd,
  breadcrumbJsonLd,
} from "../utils/seo";
import { buildCartItem } from "../services/cart";
import { trackAddToCart } from "../utils/pixel";

// ─────────────────────────────────────────────────────────────
// IMAGE CAROUSEL CONTROLS
// ─────────────────────────────────────────────────────────────
function ImageCarouselControls({ direction, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={direction === "left" ? "Previous image" : "Next image"}
      className="
        group flex items-center justify-center
        w-8 h-8 md:w-10 md:h-10
        transition-all duration-300
        focus:outline-none
      "
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="
          opacity-40 group-hover:opacity-100
          transition-opacity duration-300
        "
      >
        {direction === "left" ? (
          <path
            d="M8 1L3 6L8 11"
            stroke="black"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M4 1L9 6L4 11"
            stroke="black"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// PRODUCT GALLERY
// ─────────────────────────────────────────────────────────────
function ProductGallery({ images, productName }) {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);
  const fadeTimeout = useRef(null);

  // Reset the index when the image set changes (e.g. color switch).
  // State is adjusted during render (React's documented pattern) rather
  // than in an effect.
  const [prevImages, setPrevImages] = useState(images);
  if (prevImages !== images) {
    setPrevImages(images);
    setCurrent(0);
    setFading(false);
  }

  // Cancel any in-flight fade so a stale index can't land after a switch
  useEffect(() => {
    if (fadeTimeout.current) {
      clearTimeout(fadeTimeout.current);
      fadeTimeout.current = null;
    }
  }, [images]);

  const goTo = useCallback(
    (index) => {
      if (fading || !images.length) return;
      setFading(true);
      fadeTimeout.current = setTimeout(() => {
        setCurrent((index + images.length) % images.length);
        setFading(false);
        fadeTimeout.current = null;
      }, 250);
    },
    [fading, images.length],
  );

  const handlePrev = () => goTo(current - 1);
  const handleNext = () => goTo(current + 1);

  // KEYBOARD NAVIGATION
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, images.length]);

  if (!images.length) {
    return (
      <div className="w-[70vw] max-w-97.5 aspect-3/4 bg-black/5 animate-pulse" />
    );
  }

  return (
    <div className="flex flex-col items-center gap-7 w-full">
      {/* IMAGE ROW */}
      <div className="flex items-center justify-center gap-4 md:gap-10 w-full px-4">
        <ImageCarouselControls direction="left" onClick={handlePrev} />

        {/* PRODUCT IMAGE */}
        <div className="relative w-[70vw] max-w-97.5 aspect-3/4 overflow-hidden">
          <img
            key={images[current]}
            src={images[current]}
            alt={
              productName
                ? `${productName} — image ${current + 1}`
                : `Product image ${current + 1}`
            }
            draggable={false}
            loading={current === 0 ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={current === 0 ? "high" : "auto"}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: fading ? 0 : 1,
              transition: "opacity 0.25s ease",
            }}
          />
        </div>

        <ImageCarouselControls direction="right" onClick={handleNext} />
      </div>

      {/* PAGINATION DOTS */}
      <div className="flex items-center gap-2">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            aria-label={`Go to image ${index + 1}`}
            className="focus:outline-none"
          >
            <span
              className="block rounded-full transition-all duration-300"
              style={{
                width: current === index ? "18px" : "5px",
                height: "5px",
                background: current === index ? "#111" : "#bdbdbd",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SIZE SELECTOR
// ─────────────────────────────────────────────────────────────
function SizeSelector({ sizes, selected, onSelect, getStockFor }) {
  return (
    <div className="flex items-center justify-center gap-px">
      {sizes.map((size) => {
        const isSelected = selected?.id === size.id;
        const stock = getStockFor(size.name);
        const isDisabled = stock <= 0;

        return (
          <button
            key={size.id}
            onClick={() => !isDisabled && onSelect(size)}
            disabled={isDisabled}
            aria-pressed={isSelected}
            className={`
              w-10 h-10
              text-[10px] tracking-widest font-light
              border
              transition-all duration-200
              focus:outline-none
              ${
                isDisabled
                  ? "border-transparent text-black/15 cursor-not-allowed line-through"
                  : isSelected
                    ? "border-black bg-black text-white"
                    : "border-transparent text-black/50 hover:border-black/20 hover:text-black"
              }
            `}
          >
            {size.name}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PRODUCT INFO
// ─────────────────────────────────────────────────────────────
function ProductInfo({
  product,
  galleryImages,
  selectedColorIdx,
  onSelectColor,
}) {
  const { addToCart } = useCart();
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [showError, setShowError] = useState(false);

  // Reset the size when the color or product changes (the size may be
  // unavailable for the new color). Adjusted during render, not in an effect.
  const resetKey = `${selectedColorIdx}-${product.id}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setSelectedSize(null);
  }

  // Which selectors apply is driven entirely by the product's variation type.
  const variationType =
    product.variationType ||
    (product.productType === "simple" ? "none" : "color_size");
  const hasColor = variationType === "color" || variationType === "color_size";
  const hasSize = variationType === "size" || variationType === "color_size";

  const colors = product.colors || [];
  const sizes = product.sizes || [];
  const variants = product.variants || [];

  const selectedColor = selectedColorIdx !== null ? colors[selectedColorIdx] : null;

  // Stock checker — color-only rows have a NULL size, size-only rows a NULL
  // color. Passing null for a dimension matches rows where it's absent.
  const getStock = useCallback(
    (colorId, sizeName) => {
      const variant = variants.find(
        (v) =>
          (colorId ? v.colorId === colorId : v.colorId == null) &&
          (sizeName ? v.size === sizeName : v.size == null),
      );
      return variant ? variant.stock : 0;
    },
    [variants],
  );

  // Per-size availability for the current selection context.
  const getStockForSize = useCallback(
    (sizeName) => {
      if (variationType === "size") return getStock(null, sizeName);
      if (selectedColor) return getStock(selectedColor.id, sizeName);
      return 1; // no color chosen yet — keep every size tappable
    },
    [variationType, selectedColor, getStock],
  );

  // Total stock: simple products use their single figure, everything else
  // sums the variant rows.
  const totalStock =
    variationType === "none"
      ? Number(product.stock) || 0
      : variants.reduce((sum, v) => sum + v.stock, 0);

  const isOutOfStock = totalStock <= 0;

  const isReady =
    (hasColor ? selectedColor !== null : true) &&
    (hasSize ? selectedSize !== null : true);

  const currentStock =
    variationType === "none"
      ? Number(product.stock) || 0
      : variationType === "color"
        ? selectedColor
          ? getStock(selectedColor.id, null)
          : 0
        : variationType === "size"
          ? selectedSize
            ? getStock(null, selectedSize.name)
            : 0
          : selectedColor && selectedSize
            ? getStock(selectedColor.id, selectedSize.name)
            : 0;

  const handleAddToCart = () => {
    if (!isReady) {
      setShowError(true);
      setTimeout(() => setShowError(false), 2200);
      return;
    }
    if (currentStock <= 0) {
      setShowError(true);
      setTimeout(() => setShowError(false), 2200);
      return;
    }
    if (adding) return;

    setAdding(true);

    const firstImage = galleryImages.length > 0 ? galleryImages[0] : "";

    const item = buildCartItem({
      product,
      variationType,
      selectedColor: selectedColor ? selectedColor.name : null,
      selectedColorId: selectedColor ? selectedColor.id : null,
      selectedSize: selectedSize ? selectedSize.name : null,
      selectedSizeId: selectedSize ? selectedSize.id : null,
      image: firstImage,
    });
    addToCart(item);

    // Meta Pixel — content_ids match the product feed's <g:id> so the event
    // attaches to the catalog item.
    trackAddToCart({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    });

    setTimeout(() => {
      setAdding(false);
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    }, 700);
  };

  const addToCartButton = (
    <button
      onClick={handleAddToCart}
      disabled={adding || isOutOfStock}
      className={`
        relative overflow-hidden
        w-full h-11
        border
        flex items-center justify-center
        text-[10px]
        tracking-[0.28em]
        uppercase
        font-light
        transition-all duration-300
        active:scale-[0.98]
        focus:outline-none

        ${
          isReady && currentStock > 0
            ? "border-black/20 hover:border-black/60 text-black"
            : "border-black/10 text-black/30"
        }

        ${
          adding || added
            ? "bg-black text-white border-black"
            : "bg-transparent"
        }
      `}
    >
      {/* BUTTON TEXT */}
      <span
        className="transition-all duration-300"
        style={{
          transform: adding ? "translateY(-2px)" : "translateY(0px)",
          opacity: adding ? 0.8 : 1,
        }}
      >
        {adding ? "Adding..." : added ? "Added to Cart" : "Add to Cart"}
      </span>

      {/* LOADING LINE */}
      {adding && (
        <span
          className="
            absolute bottom-0 left-0
            h-1px bg-white
          "
          style={{
            width: "100%",
            animation: "loading 0.7s linear",
          }}
        />
      )}
    </button>
  );

  const errorMessage =
    isReady && currentStock <= 0
      ? "This variant is out of stock"
      : variationType === "color"
        ? "Please select a color"
        : variationType === "size"
          ? "Please select a size"
          : "Please select size and color";

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      {/* PRODUCT NAME */}
      <p className="text-[11px] tracking-[0.25em] uppercase text-black/40 font-light">
        {product.name}
      </p>

      {/* PRODUCT PRICE */}
      <p className="text-[13px] tracking-[0.18em] text-black font-light">
        KES {product.price}
      </p>

      {/* OUT OF STOCK BADGE */}
      {isOutOfStock && (
        <p className="text-[9px] tracking-[0.2em] uppercase text-red-500 font-light mt-1">
          Out of Stock
        </p>
      )}

      {/* Simple products have nothing to select — Add to Cart directly */}
      {variationType === "none" ? (
        <div className="mt-4 w-72 flex flex-col items-center gap-5 pb-2">
          {addToCartButton}
        </div>
      ) : (
        <>
          {/* EXPAND BUTTON */}
          {!isOutOfStock && (
            <button
              onClick={() => setOpen((prev) => !prev)}
              aria-expanded={open}
              aria-label={open ? "Close options" : "Open options"}
              className="
                mt-2
                w-8 h-8
                border border-black/20
                flex items-center justify-center
                transition-all duration-300
                hover:border-black/60
                focus:outline-none
              "
            >
              <span
                className="text-base font-thin leading-none"
                style={{
                  transform: open ? "rotate(45deg)" : "rotate(0deg)",
                  transition: "transform 0.3s ease",
                }}
              >
                +
              </span>
            </button>
          )}

          {/* EXPANDABLE PANEL */}
          <div
            className="
              overflow-hidden
              transition-all duration-500 ease-in-out
              w-full flex justify-center
            "
            style={{
              maxHeight: open && !isOutOfStock ? "400px" : "0px",
              opacity: open && !isOutOfStock ? 1 : 0,
            }}
          >
            <div className="mt-5 w-72 flex flex-col items-center gap-5 pb-2">
              {/* COLOR SECTION — only when the product supports colors */}
              {hasColor ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  <p className="text-[9px] tracking-[0.35em] uppercase text-black/35 font-light">
                    Color
                  </p>

                  {/* COLOR BUTTONS */}
                  <div className="flex gap-3 justify-center flex-wrap">
                    {colors.map((color, idx) => {
                      // Color-only products: out-of-stock colors can't be picked.
                      const colorStock =
                        variationType === "color" ? getStock(color.id, null) : 1;
                      const isDisabled =
                        variationType === "color" && colorStock <= 0;
                      return (
                        <button
                          key={color.id}
                          onClick={() => !isDisabled && onSelectColor(idx)}
                          aria-label={`Select ${color.name}`}
                          className={`
                            relative
                            w-7 h-7
                            rounded-full
                            border
                            transition-all duration-300
                            focus:outline-none
                            ${
                              selectedColorIdx === idx
                                ? "border-black scale-110"
                                : isDisabled
                                  ? "border-black/5 opacity-40 cursor-not-allowed line-through"
                                  : "border-black/15 hover:border-black/40"
                            }
                          `}
                          style={{
                            backgroundColor: color.hex,
                          }}
                        >
                          {/* ACTIVE DOT */}
                          {selectedColorIdx === idx && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="w-2 h-2 rounded-full bg-white/80" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* SELECTED COLOR LABEL */}
                  <p className="text-[9px] tracking-[0.25em] uppercase text-black/45 font-light mt-1">
                    {selectedColor ? selectedColor.name : "No color selected"}
                  </p>
                </div>
              ) : null}

              {/* SIZE SECTION — only when the product supports sizes */}
              {hasSize ? (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-[9px] tracking-[0.35em] uppercase text-black/35 font-light">
                    Select Size
                  </p>

                  <SizeSelector
                    sizes={sizes}
                    selected={selectedSize}
                    onSelect={setSelectedSize}
                    getStockFor={getStockForSize}
                  />
                </div>
              ) : null}

              {/* DIVIDER */}
              <div className="w-full border-t border-black/10" />

              {/* ERROR MESSAGE */}
              <div
                className={`
                  text-[9px]
                  tracking-[0.2em]
                  uppercase
                  text-red-500
                  font-light
                  transition-all duration-300
                  ${
                    showError
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 -translate-y-1 h-0"
                  }
                `}
              >
                {errorMessage}
              </div>

              {/* ADD TO CART BUTTON */}
              {addToCartButton}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TimelineItem({ product }) {
  const imageSrc = product.thumbnail
    ? buildImageUrl(product.thumbnail)
    : "";

  return (
    <Link
      to={`/product/${product.slug || product.id}`}
      className="group flex items-center gap-4 rounded-[28px] border border-black/10 bg-white/90 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-slate-100">
        {imageSrc && (
          <img
            src={imageSrc}
            alt={product.name}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
          />
        )}
      </div>

      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[#43392f]/70">
          {product.name}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#43392f]">
          KES {product.price}
        </p>
      </div>

      <span className="text-xl font-semibold text-[#43392f] transition group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

function ProductTimeline({
  currentProduct,
  zoomLevel,
  maxZoom,
  showTimelineFromHome,
}) {
  const { products } = useProducts();

  const otherProducts = useMemo(
    () => products.filter((product) => product.id !== currentProduct.id),
    [products, currentProduct.id],
  );

  const isTimelineMode =
    (zoomLevel === maxZoom && maxZoom > 1) || showTimelineFromHome;

  if (!isTimelineMode || otherProducts.length === 0) {
    return null;
  }

  return (
    <section className="w-full max-w-xl flex flex-col gap-4 px-1">
      <div className="flex items-center gap-3">
        <div className="h-10 w-1 rounded-full bg-[#43392f]/30" />
        <p className="text-[10px] uppercase tracking-[0.35em] text-[#43392f]/70 font-light">
          Continue scrolling for more drops
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {otherProducts.map((product) => (
          <TimelineItem key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────────
function ProductPageSkeleton() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-start py-10 md:py-16 px-4 pb-16 select-none animate-pulse"
      style={{ background: "#f5fffa" }}
    >
      <div className="w-[70vw] max-w-97.5 aspect-3/4 bg-black/5 rounded" />
      <div className="mt-10 h-3 w-32 bg-black/5 rounded" />
      <div className="mt-3 h-3 w-20 bg-black/5 rounded" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PRODUCT PAGE
// ─────────────────────────────────────────────────────────────
export default function ProductPage({ zoomLevel, maxZoom }) {
  const { slug } = useParams();
  const location = useLocation();
  const showTimelineFromHome = location.state?.fromHome === true;

  const { product, loading, error } = useProduct(slug);

  // Derive the selected color index (starts at null — no selection)
  const [selectedColorIdx, setSelectedColorIdx] = useState(null);

  // Reset color selection when the product changes — adjusted during
  // render (React's documented pattern) instead of in an effect.
  const [prevSlug, setPrevSlug] = useState(slug);
  if (prevSlug !== slug) {
    setPrevSlug(slug);
    setSelectedColorIdx(null);
  }

  // Build gallery images filtered by selected color
  const galleryImages = useMemo(() => {
    if (!product || !product.images) return [];
    const colorId = selectedColorIdx !== null && product.colors?.[selectedColorIdx]
      ? product.colors[selectedColorIdx].id
      : null;

    let filtered = colorId
      ? product.images.filter((img) => img.colorId === colorId)
      : product.images;

    // Fallback: if no uploaded images are tagged with this color,
    // show all images rather than an empty gallery
    if (!filtered.length) filtered = product.images;

    // Sort by sortOrder
    filtered = [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);
    return filtered.map((img) => buildImageUrl(img.path));
  }, [product, selectedColorIdx]);

  // Backend-driven SEO metadata (memoized — no Helmet re-renders on state
  // changes like color/size selection).
  const seo = useMemo(() => {
    if (!product) return null;
    const { image, url: ogImage } = pickProductImageMeta(product);
    return {
      title: productTitle(product),
      description: productDescription(product),
      image: ogImage,
      imageAlt: productImageAlt(product, image),
      heroImage: galleryImages[0] || "",
      jsonLd: [
        productJsonLd(product, slug),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: product.name, path: `/product/${slug}` },
        ]),
      ],
    };
  }, [product, slug, galleryImages]);

  const productPath = `/product/${slug}`;

  // LOADING
  if (loading) {
    return (
      <>
        <SEO
          title={DEFAULT_TITLE}
          description={DEFAULT_DESCRIPTION}
          path={productPath}
        />
        <ProductPageSkeleton />
      </>
    );
  }

  // ERROR / NOT FOUND
  if (error || !product) {
    return (
      <>
        <SEO
          title={NOT_FOUND_TITLE}
          description="The product you are looking for does not exist."
          path={productPath}
          noindex
        />
        <div
          className="
            min-h-screen
            flex items-center justify-center
            px-4
          "
          style={{
            background: "#f5fffa",
            fontFamily: "var(--sans)",
          }}
        >
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">Product not found</h2>
            <p className="text-black/60">
              The product you are looking for does not exist.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO
        title={seo.title}
        description={seo.description}
        path={productPath}
        type="product"
        image={seo.image}
        imageAlt={seo.imageAlt}
        jsonLd={seo.jsonLd}
      >
        {/* Hero image preload — first gallery image, only when one exists */}
        {seo.heroImage && (
          <link rel="preload" as="image" href={seo.heroImage} />
        )}
      </SEO>

      <div
        className="
          min-h-screen w-full
          flex flex-col items-center justify-start
          py-10 md:py-16 px-4 pb-16
          select-none
        "
        style={{
          background: "#f5fffa",
          fontFamily: "var(--sans)",
        }}
      >
        <main
          className="
            flex-1 w-full
            flex flex-col items-center justify-start
            gap-10 md:gap-14
          "
        >
          {/* PRODUCT GALLERY */}
          <ProductGallery images={galleryImages} productName={product.name} />

        {/* PRODUCT INFO */}
        <ProductInfo
          product={product}
          galleryImages={galleryImages}
          selectedColorIdx={selectedColorIdx}
          onSelectColor={setSelectedColorIdx}
        />

        {/* TIMELINE SCROLL */}
        <ProductTimeline
          currentProduct={product}
          zoomLevel={zoomLevel}
          maxZoom={maxZoom}
          showTimelineFromHome={showTimelineFromHome}
        />
        </main>
      </div>
    </>
  );
}
