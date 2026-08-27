import Link from "next/link";

export const metadata = { title: "Privacy Policy — MoveWise" };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
      <h1 className="mw-page-title">Privacy Policy</h1>
      <p className="mw-page-subtitle" style={{ marginBottom: "var(--mw-space-5)" }}>
        This is a working draft, not reviewed legal advice — it should be replaced with counsel-reviewed terms
        appropriate to your jurisdiction before a public launch.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", lineHeight: 1.6 }}>
        <section>
          <h2>What we collect</h2>
          <p>
            An account requires only an email address and a password. We also ask your birth year at signup, solely
            to confirm you meet our minimum age requirement — it is never stored on your account.
          </p>
        </section>
        <section>
          <h2>What we store about your progress</h2>
          <p>
            Once you&apos;re signed in, we store the lessons and puzzles you&apos;ve completed, your practice
            attempts and mistakes, games you play against the computer, and the analysis generated from them. This is
            what lets your progress follow you across devices and powers your personalized recommendations. If you
            never create an account, this progress lives only in your own browser and is never sent to us.
          </p>
        </section>
        <section>
          <h2>What we don&apos;t do</h2>
          <p>We don&apos;t sell your data, and we don&apos;t share it with advertisers.</p>
        </section>
        <section>
          <h2>Your data, your control</h2>
          <p>
            You can download everything we hold about your account at any time from your account page, and you can
            permanently delete your account and all its data the same way.
          </p>
        </section>
      </div>
      <p style={{ marginTop: "var(--mw-space-6)" }}>
        <Link href="/">Back to MoveWise</Link>
      </p>
    </main>
  );
}
