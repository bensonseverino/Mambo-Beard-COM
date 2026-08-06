import SEO from "../components/SEO";

export default function TermsOfService() {
  return (
    <>
      <SEO
        title="Terms of Service | Mambo Beard"
        description="Mambo Beard Club terms of service — rules for using our website, placing orders, shipping, returns, and more."
        path="/terms"
      />
      <div className="min-h-screen bg-white text-black px-6 md:px-20 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            Terms of Service
          </h1>
          <p className="text-gray-600 mt-2">
            Mambo Beard Club — Nairobi, Kenya
          </p>
          <p className="text-sm text-gray-500 mt-1">Last Updated: May 2026</p>
        </header>

        {/* Intro */}
        <section className="mb-10">
          <p className="text-gray-700 leading-relaxed">
            Welcome to Mambo Beard Club. These Terms of Service explain the
            rules for using our website, social media, and purchasing our
            streetwear products. By using our services or placing an order, you
            agree to these Terms.
          </p>
        </section>

        {/* Sections */}
        <div className="space-y-10">
          <Section title="1. Eligibility">
            <ul className="list-disc ml-6 space-y-1 text-gray-700">
              <li>You must be 18+ or have guardian permission</li>
              <li>Provide accurate information when ordering</li>
              <li>Products are for personal use only unless approved</li>
            </ul>
          </Section>

          <Section title="2. Products & Availability">
            <p className="text-gray-700">
              Our streetwear drops may be limited. We can update, remove, or
              change products at any time. Colors may vary slightly depending on
              your device screen.
            </p>
          </Section>

          <Section title="3. Orders & Payment">
            <ul className="list-disc ml-6 space-y-1 text-gray-700">
              <li>Orders are offers to purchase</li>
              <li>We may accept or reject orders at our discretion</li>
              <li>Prices may change before checkout</li>
              <li>Full payment is required at purchase</li>
            </ul>
          </Section>

          <Section title="4. Shipping & Delivery">
            <p className="text-gray-700">
              We deliver within Nairobi and other parts of Kenya. Delivery times
              are estimates and may change due to courier delays. Once
              delivered, responsibility for the item passes to you.
            </p>
          </Section>

          <Section title="5. Returns & Refunds">
            <ul className="list-disc ml-6 space-y-1 text-gray-700">
              <li>All sales are generally final</li>
              <li>Only defective or incorrect items qualify for return</li>
              <li>Issues must be reported within 7 days of delivery</li>
            </ul>
          </Section>

          <Section title="6. Prohibited Use">
            <ul className="list-disc ml-6 space-y-1 text-gray-700">
              <li>No illegal activity using our website</li>
              <li>No copying or reselling our designs without permission</li>
              <li>No hacking or interfering with the platform</li>
            </ul>
          </Section>

          <Section title="7. Intellectual Property">
            <p className="text-gray-700">
              All logos, designs, and content belong to Mambo Beard Club. You
              may not copy or reuse them without permission.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p className="text-gray-700">
              We are not responsible for delivery delays, misuse of products, or
              website interruptions. Liability is limited to the value of the
              purchased item where applicable.
            </p>
          </Section>

          <Section title="9. Changes to Terms">
            <p className="text-gray-700">
              We may update these Terms at any time. Continued use of our
              services means you accept any changes.
            </p>
          </Section>

          <Section title="10. Contact">
            <p className="text-gray-700">
              Mambo Beard Club
              <br />
              Nairobi, Kenya
              <br />
              Email: mambobeardclub@gmail.com
            </p>
          </Section>
        </div>

        {/* Footer */}
        <footer className="mt-16 border-t pt-6 text-sm text-gray-500">
          © {new Date().getFullYear()} Mambo Beard Club. All rights reserved.
        </footer>
      </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}
