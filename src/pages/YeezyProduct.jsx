import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { products } from "../data/products";
import { useCart } from "../context/CartContext";

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
function ProductGallery({ images }) {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);

  const goTo = useCallback(
    (index) => {
      if (fading) return;

      setFading(true);

      setTimeout(() => {
        setCurrent((index + images.length) % images.length);
        setFading(false);
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

    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [current]);

  return (
    <div className="flex flex-col items-center gap-7 w-full">
      {/* IMAGE ROW */}
      <div className="flex items-center justify-center gap-4 md:gap-10 w-full px-4">
        <ImageCarouselControls direction="left" onClick={handlePrev} />

        {/* PRODUCT IMAGE */}
        <div className="relative w-[70vw] max-w-[390px] aspect-[3/4] overflow-hidden">
          <img
            key={current}
            src={images[current]}
            alt={`Product image ${current + 1}`}
            draggable={false}
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
function SizeSelector({ sizes, selected, onSelect }) {
  return (
    <div className="flex items-center justify-center gap-px">
      {sizes.map((size) => {
        const isSelected = selected === size;

        return (
          <button
            key={size}
            onClick={() => onSelect(size)}
            aria-pressed={isSelected}
            className={`
              w-10 h-10
              text-[10px] tracking-widest font-light
              border
              transition-all duration-200
              focus:outline-none
              ${
                isSelected
                  ? "border-black bg-black text-white"
                  : "border-transparent text-black/50 hover:border-black/20 hover:text-black"
              }
            `}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PRODUCT INFO
// ─────────────────────────────────────────────────────────────
function ProductInfo({ product }) {
  const { addToCart } = useCart();
  const [open, setOpen] = useState(false);

  const [selectedSize, setSelectedSize] = useState(null);

  // NO COLOR SELECTED BY DEFAULT
  const [selectedColor, setSelectedColor] = useState(null);

  // BUTTON STATES
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  // VALIDATION ERROR
  const [showError, setShowError] = useState(false);

  // COLOR OPTIONS
  const colorOptions = [
    { name: "Black", value: "#000000" },
    { name: "Red", value: "#C1121F" },
    { name: "Navy Blue", value: "#0A2342" },
    { name: "Beige", value: "#D6C6B8" },
    { name: "Maroon", value: "#800000" },
  ];

  // FORM VALIDATION
  const isReady = selectedSize !== null && selectedColor !== null;

  // ADD TO CART
  const handleAddToCart = () => {
    // BLOCK IF OPTIONS NOT SELECTED
    if (!isReady) {
      setShowError(true);

      setTimeout(() => {
        setShowError(false);
      }, 2200);

      return;
    }

    // PREVENT DOUBLE CLICK
    if (adding) return;

    // START ANIMATION
    setAdding(true);

    // Add to cart with product, size, and color
    const colorName = colorOptions[selectedColor]?.name || "";
    addToCart(product, product.sizes[selectedSize], colorName);

    setTimeout(() => {
      setAdding(false);
      setAdded(true);

      setTimeout(() => {
        setAdded(false);
      }, 1800);
    }, 700);
  };

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      {/* PRODUCT NAME */}
      <p className="text-[11px] tracking-[0.25em] uppercase text-black/40 font-light">
        {product.name}
      </p>

      {/* PRODUCT PRICE */}
      <p className="text-[13px] tracking-[0.18em] text-black font-light">
        {product.price}
      </p>

      {/* EXPAND BUTTON */}
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

      {/* EXPANDABLE PANEL */}
      <div
        className="
          overflow-hidden
          transition-all duration-500 ease-in-out
          w-full flex justify-center
        "
        style={{
          maxHeight: open ? "400px" : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="mt-5 w-72 flex flex-col items-center gap-5 pb-2">
          {/* SIZE SECTION */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-[9px] tracking-[0.35em] uppercase text-black/35 font-light">
              Select Size
            </p>

            <SizeSelector
              sizes={product.sizes}
              selected={selectedSize}
              onSelect={setSelectedSize}
            />
          </div>

          {/* COLOR SECTION */}
          <div className="flex flex-col items-center gap-2 w-full">
            <p className="text-[9px] tracking-[0.35em] uppercase text-black/35 font-light">
              Color
            </p>

            {/* COLOR BUTTONS */}
            <div className="flex gap-3 justify-center flex-wrap">
              {colorOptions.map((color, idx) => (
                <button
                  key={color.name}
                  onClick={() => setSelectedColor(idx)}
                  aria-label={`Select ${color.name}`}
                  className={`
                    relative
                    w-7 h-7
                    rounded-full
                    border
                    transition-all duration-300
                    focus:outline-none
                    ${
                      selectedColor === idx
                        ? "border-black scale-110"
                        : "border-black/15 hover:border-black/40"
                    }
                  `}
                  style={{
                    backgroundColor: color.value,
                  }}
                >
                  {/* ACTIVE DOT */}
                  {selectedColor === idx && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-white/80" />
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* SELECTED COLOR LABEL */}
            <p className="text-[9px] tracking-[0.25em] uppercase text-black/45 font-light mt-1">
              {selectedColor !== null
                ? colorOptions[selectedColor]?.name
                : "No color selected"}
            </p>
          </div>

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
            Please select size and color
          </div>

          {/* ADD TO CART BUTTON */}
          <button
            onClick={handleAddToCart}
            disabled={adding}
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
                isReady
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
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PRODUCT PAGE
// ─────────────────────────────────────────────────────────────
export default function ProductPage() {
  const { id } = useParams();

  const product = products.find((p) => String(p.id) === String(id));

  // PRODUCT NOT FOUND
  if (!product) {
    return (
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
    );
  }

  return (
    <div
      className="
        min-h-screen w-full
        flex flex-col items-center justify-between
        py-10 md:py-16 px-4
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
          flex flex-col items-center justify-center
          gap-10 md:gap-14
        "
      >
        {/* PRODUCT GALLERY */}
        <ProductGallery images={product.image} />

        {/* PRODUCT INFO */}
        <ProductInfo product={product} />
      </main>
    </div>
  );
}
