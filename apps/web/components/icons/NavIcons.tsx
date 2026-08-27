/**
 * MoveWise's own nav icon set (P2 — docs/design/system.md's asset table:
 * "no stock imagery, no third-party icon library"). Replaces the
 * placeholder Unicode glyphs (♟ ▲ ● ▪ ◐) Nav.tsx originally shipped with —
 * those read as unlabeled dots/triangles, not recognizable icons. Each
 * icon shares the same 20px viewBox, 1.6 stroke weight, and round
 * joins/caps so the set reads as one family; `currentColor` means every
 * existing hover/active/disabled/dark-theme color rule in
 * `.mw-nav-item`/`.mw-nav-bottom-item` keeps working unmodified.
 */

const SHARED = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Learn & Play — an open book, the curriculum's own shape. */
export function LearnIcon() {
  return (
    <svg {...SHARED} width="20" height="20" aria-hidden="true">
      <path d="M10 5.5C8.2 4.2 5.8 3.7 3 4.2v11.2c2.8-.5 5.2 0 7 1.3" />
      <path d="M10 5.5c1.8-1.3 4.2-1.8 7-1.3v11.2c-2.8-.5-5.2 0-7 1.3" />
      <path d="M10 5.5v12.2" />
    </svg>
  );
}

/** Play & Learn — a chess clock: playing a real, timed game. */
export function PlayIcon() {
  return (
    <svg {...SHARED} width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="11" r="6.8" />
      <path d="M10 7.2v3.8l2.8 1.8" />
      <path d="M7.6 2.6h4.8" />
    </svg>
  );
}

/** Practice — a target: aim and accuracy. */
export function PracticeIcon() {
  return (
    <svg {...SHARED} width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" />
      <circle cx="10" cy="10" r="4" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Progress — a rising line, the shape of improvement. */
export function ProgressIcon() {
  return (
    <svg {...SHARED} width="20" height="20" aria-hidden="true">
      <polyline points="2.8,14.5 7.4,9.6 10.8,12.6 17.2,5" />
      <polyline points="12.6,5 17.2,5 17.2,9.6" />
    </svg>
  );
}

/** Profile — a person, kept simple and neutral. */
export function ProfileIcon() {
  return (
    <svg {...SHARED} width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.6 17c1.2-3.6 3.9-5.4 6.4-5.4s5.2 1.8 6.4 5.4" />
    </svg>
  );
}
