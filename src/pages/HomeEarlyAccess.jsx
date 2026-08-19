// pages/HomeEarlyAccess.jsx — INACTIVE early-access landing page.
// This was the temporary homepage (early-access signup). It is not routed
// anywhere right now; the live homepage is pages/Home.jsx (products grid).
// To swap it back in: point the "/" route in App.jsx at this component.

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import useProducts from "../hooks/useProducts";
import MamboBeardFooter from "../components/Footer";
import SEO from "../components/SEO";
import {
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  collectionJsonLd,
} from "../utils/seo";
import { isValidKenyanPhone, subscribe } from "../services/subscribers";
import brevCampaign from "../assets/brev-01.png";

const MARQUEE = [
  "EARLY ACCESS",
  "LIMITED DROPS",
  "MEMBERS ONLY",
  "BE FIRST",
  "NO SPAM",
];

const PERKS = [
  {
    number: "01",
    title: "BE FIRST",
    copy: "Limited drops land on the list before they ever go public.",
  },
  {
    number: "02",
    title: "MEMBERS ONLY",
    copy: "Exclusive releases and members-only offers, just for the list.",
  },
  {
    number: "03",
    title: "NO SPAM",
    copy: "Only the texts that matter. Unsubscribe anytime, no hard feelings.",
  },
];

// ─────────────────────────────────────────────────────────────
// EARLY ACCESS SIGNUP FORM
// ─────────────────────────────────────────────────────────────
function EarlyAccessForm() {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success
  const [error, setError] = useState("");
  const successRef = useRef(null);

  // When the submit button unmounts (form → success), move focus onto the
  // success panel so keyboard/screen-reader users aren't dropped to <body>.
  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === "loading") return;
    if (!isValidKenyanPhone(phone)) {
      setError("Enter a valid Kenyan phone number.");
      return;
    }
    setError("");
    setStatus("loading");
    try {
      await subscribe(phone);
      // Same list as the VIP popup — a joiner shouldn't be asked twice.
      try {
        const current = JSON.parse(localStorage.getItem("vipPopup")) || {};
        localStorage.setItem(
          "vipPopup",
          JSON.stringify({ ...current, subscribed: true }),
        );
      } catch {
        // Storage unavailable — harmless.
      }
      setStatus("success");
    } catch (err) {
      setError(err?.message || "Unable to join right now. Please try again later.");
    }
  };

  if (status === "success") {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        className="w-full border border-[#43392f]/20 bg-white/40 px-6 py-8 text-center outline-none"
        role="status"
      >
        <CheckCircle2 size={34} strokeWidth={1.5} className="text-emerald-600 mb-3" />
        <p className="text-base sm:text-lg tracking-[0.2em] uppercase font-medium">
          You&apos;re on the list.
        </p>
        <p className="mt-2 text-sm opacity-70">
          We&apos;ll text you before everyone else.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <label htmlFor="ea-phone" className="sr-only">
        Phone number
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          id="ea-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Enter your phone number"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (error) setError("");
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "ea-error" : undefined}
          className="w-full flex-1 bg-white/50 border border-[#43392f]/30 px-4 py-3.5 text-sm sm:text-base text-center text-[#43392f] placeholder:text-[#43392f]/40 tracking-wider focus:border-[#43392f]/80 focus:outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="flex items-center justify-center gap-2 bg-[#43392f] text-[#f5fffa] uppercase tracking-[0.25em] text-sm font-medium px-8 py-3.5 hover:bg-[#332a23] active:scale-[0.99] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "JOINING…" : "GET EARLY ACCESS"}
          {status !== "loading" && <ArrowRight size={15} strokeWidth={2} />}
        </button>
      </div>

      {/* Reserved-height error slot — an error never shifts the layout.
          role="alert" implies aria-live="assertive", so no extra live region. */}
      <p
        id="ea-error"
        role="alert"
        className="min-h-[18px] mt-2 text-[12px] leading-[18px] tracking-wide text-center text-[#d64545]"
      >
        {error}
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function HomeEarlyAccess() {
  const { products } = useProducts();

  // Backend-driven structured data — keeps head tags in sync with the edge
  // middleware (same collection schema), updating automatically as products
  // are created, updated, unpublished, or deleted.
  const seoJsonLd = useMemo(
    () =>
      products.length ? [collectionJsonLd("All Products", "/", products)] : [],
    [products],
  );

  return (
    <>
      <SEO
        title={DEFAULT_TITLE}
        description={DEFAULT_DESCRIPTION}
        path="/"
        jsonLd={seoJsonLd}
      />

      <main className="bg-[#F5FFFA] text-[#43392f] overflow-hidden flex-1">
        {/* ── HERO — image first, copy + signup below ───────── */}
        <section>
          {/* Campaign image — full-width, top of the page */}
          <div className="ea-rise relative h-[62vh] sm:h-[68vh] lg:h-[74vh]">
            <img
              src={brevCampaign}
              alt="Mambo Beard brev campaign portrait — man in a maroon hoodie"
              className="absolute inset-0 w-full h-full object-cover object-top"
              fetchPriority="high"
            />
          </div>

          {/* Copy + signup — centered below the image */}
          <div className="ea-rise ea-rise-2 flex flex-col items-center px-6 sm:px-12 py-16 lg:py-20 text-center">
            <h1 className="ea-hero-title">
              Get
              <br />
              Early
              <br />
              Access
            </h1>

            <p className="mt-6 max-w-md text-sm sm:text-base leading-relaxed opacity-80 tracking-wide">
              Be first to access limited drops, exclusive releases and
              members-only offers from Mambo Beard.
            </p>

            <div className="ea-rise ea-rise-3 mt-8 w-full max-w-md">
              <EarlyAccessForm />
            </div>

            <p className="mt-4 text-[10px] sm:text-[11px] tracking-[0.25em] uppercase opacity-50">
              No spam · Members only · Unsubscribe anytime
            </p>
          </div>
        </section>

        {/* ── MARQUEE ──────────────────────────────────────── */}
        <div className="ea-marquee py-3 sm:py-4 select-none" aria-hidden="true">
          <div className="ea-marquee-track">
            {[0, 1].map((half) => (
              <div key={half} className="flex items-center shrink-0">
                {MARQUEE.map((item, i) => (
                  <span key={i} className="flex items-center">
                    <span className="px-6 text-[11px] sm:text-sm tracking-[0.35em]">
                      {item}
                    </span>
                    <span className="text-[#f5fffa]/50 text-xs">*</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── PERKS ────────────────────────────────────────── */}
        <section className="px-6 sm:px-12 lg:px-16 xl:px-24 py-16 lg:py-24">
          <div className="max-w-5xl mx-auto text-left">
            <p className="ea-eyebrow text-[11px] mb-8">WHY JOIN</p>
            <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
              {PERKS.map((perk) => (
                <div
                  key={perk.number}
                  className="border-t border-[#43392f]/20 pt-5"
                >
                  <p className="text-[10px] tracking-[0.3em] opacity-50">
                    {perk.number}
                  </p>
                  <p className="mt-3 text-base sm:text-lg tracking-[0.2em] uppercase font-medium">
                    {perk.title}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed opacity-70">
                    {perk.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <MamboBeardFooter />
    </>
  );
}
