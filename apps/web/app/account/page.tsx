import { redirect } from "next/navigation";
import { Nav } from "../../components/Nav";
import { AccountDangerZone } from "../../components/AccountDangerZone";
import { getSession } from "../../lib/auth";
import { prisma } from "@movewise/db";

export default async function AccountPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const completions = await prisma.lessonCompletion.findMany({ where: { userId: user.id }, select: { xpEarned: true } });
  const totalXp = completions.reduce((sum, c) => sum + c.xpEarned, 0);

  return (
    <div className="mw-app-shell">
      <Nav active="profile" user={{ email: user.email }} totalXp={totalXp} />
      <main style={{ maxWidth: 440, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <h1 className="mw-page-title">Account</h1>
        <p className="mw-page-subtitle" style={{ marginBottom: "var(--mw-space-5)" }}>{user.email}</p>

        <section
          className="mw-card"
          style={{ padding: "var(--mw-space-5)", display: "flex", flexDirection: "column", gap: "var(--mw-space-2)", marginBottom: "var(--mw-space-5)" }}
        >
          <h2 style={{ margin: 0 }}>Export your data</h2>
          <p className="mw-page-subtitle" style={{ margin: 0 }}>
            Downloads a JSON file with your account details and lesson completions.
          </p>
          <a href="/account/export" className="mw-btn mw-btn--ghost" style={{ alignSelf: "flex-start" }}>
            Download my data
          </a>
        </section>

        <AccountDangerZone />
      </main>
    </div>
  );
}
