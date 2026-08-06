import SEO from "../components/SEO";

export default function PrivacyPolicy() {
  return (
    <>
      <SEO
        title="Privacy Policy | Mambo Beard"
        description="Mambo Beard Club privacy policy — what we collect, how we use your data, your rights, and our SMS/email marketing terms."
        path="/privacy"
      />
      <div className="min-h-screen bg-white text-black px-6 md:px-20 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-gray-500 mt-2">
            Mambo Beard Club,Nairobi streetwear brand— Nairobi, Kenya
          </p>
          <p className="text-sm text-gray-500 mt-1">Last Updated: May 2026</p>
        </header>

        {/* Intro */}
        <section className="mb-10">
          <p className="text-gray-700 leading-relaxed">
            At Mambo Beard Club, we respect your privacy. This policy explains
            what information we collect, how we use it, and your rights when
            using our website, social media, or purchasing our streetwear
            products.
          </p>
        </section>

        <div className="space-y-10">
          <Section title="1. Information We Collect">
            <ul className="list-disc ml-6 text-gray-700 space-y-1">
              <li>
                Personal details: name, phone number, email, and delivery
                address when you place an order
              </li>
              <li>
                Payment info (processed securely through third-party payment
                providers)
              </li>
              <li>
                Device data: browser type, IP address, and how you use our site
              </li>
              <li>
                Cookies: to improve browsing experience and track activity
              </li>
            </ul>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul className="list-disc ml-6 text-gray-700 space-y-1">
              <li>Process and deliver your orders</li>
              <li>Provide customer support</li>
              <li>Improve our website and products</li>
              <li>Send updates, offers, and promotions (if you opt in)</li>
              <li>Prevent fraud and keep our platform secure</li>
            </ul>
          </Section>

          <Section title="3. Sharing Your Information">
            <p className="text-gray-700">
              We only share your data with trusted service providers such as
              payment processors, delivery partners, and marketing tools. We
              never sell your personal information.
            </p>
          </Section>

          <Section title="4. Marketing & SMS">
            <p className="text-gray-700">
              If you opt in, we may send you emails or SMS messages about new
              drops, offers, or order updates. You can unsubscribe at any time
              by replying STOP or clicking unsubscribe links.
            </p>
          </Section>

          <Section title="5. Cookies & Tracking">
            <p className="text-gray-700">
              We use cookies to understand how you use our site and improve your
              experience. You can disable cookies in your browser settings, but
              some features may not work properly.
            </p>
          </Section>

          <Section title="6. Your Rights">
            <ul className="list-disc ml-6 text-gray-700 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request corrections or updates</li>
              <li>Request deletion of your data (where applicable)</li>
              <li>Opt out of marketing messages anytime</li>
            </ul>
          </Section>

          <Section title="7. Data Security">
            <p className="text-gray-700">
              We take reasonable steps to protect your information, but no
              system is 100% secure. Use our services at your own discretion.
            </p>
          </Section>

          <Section title="8. Children's Privacy">
            <p className="text-gray-700">
              Our services are not intended for children under 13, and we do not
              knowingly collect their data.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p className="text-gray-700">
              We may update this policy from time to time. Changes will be
              posted on this page with an updated date.
            </p>
          </Section>

          <Section title="10. Contact Us">
            <p className="text-gray-700">
              Mambo Beard Club
              <br />
              Nairobi, Kenya
              <br />
              Email: mambobeardclub@gmail.com
            </p>
          </Section>
        </div>

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
