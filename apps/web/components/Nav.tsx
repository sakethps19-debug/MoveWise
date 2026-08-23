import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

type NavKey = "learn" | "play" | "practice" | "progress" | "profile";

const ITEMS: { key: NavKey; label: string; href: string | null; icon: string }[] = [
  { key: "learn", label: "Learn & Play", href: "/", icon: "♟" },
  { key: "play", label: "Play & Learn", href: "/play", icon: "▲" },
  { key: "practice", label: "Practice", href: "/practice", icon: "●" },
  { key: "progress", label: "Progress", href: null, icon: "▪" },
  { key: "profile", label: "Profile", href: "/account", icon: "◐" },
];

/**
 * Desktop left rail + mobile bottom bar, same 5 items in the same order
 * (docs/design/system.md's acceptance criteria). Progress has no real
 * page yet (docs/prd.md) — shown disabled with a "Soon" badge rather
 * than linking to a 404 or a fake page. Practice now links to the real
 * `/practice` aggregation hub (ADR-0008).
 */
export function Nav({
  active,
  user,
  totalXp,
}: {
  active: NavKey;
  user: { email: string } | null;
  totalXp: number;
}) {
  return (
    <>
      <nav className="mw-nav-rail" aria-label="Primary">
        <div className="mw-nav-brand">
          <span className="mw-nav-mark" aria-hidden="true">
            M
          </span>
          <span className="mw-nav-wordmark">MoveWise</span>
        </div>
        <ul className="mw-nav-list">
          {ITEMS.map((item) => (
            <li key={item.key}>
              {item.href ? (
                <Link href={item.href} className={`mw-nav-item${active === item.key ? " mw-nav-item--active" : ""}`}>
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              ) : (
                <span className="mw-nav-item mw-nav-item--disabled">
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                  <span className="mw-badge mw-badge--neutral mw-nav-soon">Soon</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="mw-nav-footer">
          {user ? (
            <div className="mw-nav-xp">
              <span className="mw-nav-xp-value">{totalXp.toLocaleString()} XP</span>
              <span className="mw-nav-xp-email">{user.email}</span>
            </div>
          ) : (
            <Link href="/login" className="mw-nav-item">
              Sign in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <nav className="mw-nav-bottom" aria-label="Primary">
        {ITEMS.map((item) =>
          item.href ? (
            <Link
              key={item.key}
              href={item.href}
              className={`mw-nav-bottom-item${active === item.key ? " mw-nav-bottom-item--active" : ""}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="mw-nav-bottom-label">{item.label.split(" ")[0]}</span>
            </Link>
          ) : (
            <span key={item.key} className="mw-nav-bottom-item mw-nav-bottom-item--disabled">
              <span aria-hidden="true">{item.icon}</span>
              <span className="mw-nav-bottom-label">{item.label.split(" ")[0]}</span>
            </span>
          ),
        )}
      </nav>
    </>
  );
}
