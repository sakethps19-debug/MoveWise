import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { LearnIcon, PlayIcon, PracticeIcon, ProgressIcon, ProfileIcon } from "./icons/NavIcons";

type NavKey = "learn" | "play" | "practice" | "progress" | "profile";

const ITEMS: { key: NavKey; label: string; href: string | null; Icon: () => React.JSX.Element }[] = [
  { key: "learn", label: "Learn & Play", href: "/", Icon: LearnIcon },
  { key: "play", label: "Play & Learn", href: "/play", Icon: PlayIcon },
  { key: "practice", label: "Practice", href: "/practice", Icon: PracticeIcon },
  { key: "progress", label: "Progress", href: "/progress", Icon: ProgressIcon },
  { key: "profile", label: "Profile", href: "/account", Icon: ProfileIcon },
];

/**
 * Desktop left rail + mobile bottom bar, same 5 items in the same order
 * (docs/design/system.md's acceptance criteria). Practice links to the
 * `/practice` aggregation hub and Progress to the `/progress` dashboard
 * (ADR-0008); the disabled-item styling stays available for any future
 * not-yet-built item.
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
                  <item.Icon />
                  {item.label}
                </Link>
              ) : (
                <span className="mw-nav-item mw-nav-item--disabled">
                  <item.Icon />
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
              <item.Icon />
              <span className="mw-nav-bottom-label">{item.label.split(" ")[0]}</span>
            </Link>
          ) : (
            <span key={item.key} className="mw-nav-bottom-item mw-nav-bottom-item--disabled">
              <item.Icon />
              <span className="mw-nav-bottom-label">{item.label.split(" ")[0]}</span>
            </span>
          ),
        )}
      </nav>
    </>
  );
}
