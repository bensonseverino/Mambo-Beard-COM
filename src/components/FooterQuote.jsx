import useDailyYeQuote from "../hooks/useDailyYeQuote";

export default function FooterQuote() {
  const { quote, loading } = useDailyYeQuote();

  return (
    <section className="footer-quote" aria-label="Today's Ye Quote">
      <h3>Today's Ye Quote</h3>

      {loading ? (
        <p className="footer-quote-loading">Loading today's quote...</p>
      ) : (
        <blockquote>&quot;{quote}&quot;</blockquote>
      )}
    </section>
  );
}
