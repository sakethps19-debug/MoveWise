import Link from "next/link";

export const metadata = { title: "Terms — MoveWise" };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
      <h1 className="mw-page-title">Terms of Use</h1>
      <p className="mw-page-subtitle" style={{ marginBottom: "var(--mw-space-5)" }}>
        This is a working draft, not reviewed legal advice — it should be replaced with counsel-reviewed terms
        appropriate to your jurisdiction before a public launch.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", lineHeight: 1.6 }}>
        <section>
          <h2>Who can use MoveWise</h2>
          <p>
            MoveWise doesn&apos;t yet support account creation for anyone under 13, since that would require a
            verifiable-parental-consent process (COPPA) that isn&apos;t built yet.
          </p>
        </section>
        <section>
          <h2>Your account</h2>
          <p>
            You&apos;re responsible for keeping your password confidential. If you believe your account has been
            compromised, reset your password and contact us.
          </p>
        </section>
        <section>
          <h2>Content</h2>
          <p>
            MoveWise&apos;s lessons, puzzles, and illustrations are original works created for this product. Please
            don&apos;t copy or redistribute them without permission.
          </p>
        </section>
        <section>
          <h2>Changes</h2>
          <p>We may update these terms as the product changes; continued use after an update means you accept it.</p>
        </section>
      </div>
      <p style={{ marginTop: "var(--mw-space-6)" }}>
        <Link href="/">Back to MoveWise</Link>
      </p>
    </main>
  );
}
