/**
 * Today plan step icons (components/TodayPlan.tsx) — same family as
 * components/icons/NavIcons.tsx (20px viewBox, 1.6 stroke, round joins/
 * caps, `currentColor`), extended here rather than duplicated wholesale:
 * the "learn", "practice" and "play" steps reuse NavIcons' own
 * LearnIcon/PracticeIcon/PlayIcon directly (TodayPlan.tsx imports those),
 * since each step links to exactly that nav section — one icon per idea,
 * not two different glyphs for the same destination. Only the three step
 * kinds without an existing nav icon (warm-up, review, reflect) get a new
 * glyph here, plus the small filled check used once a step is done.
 *
 * Real, confirmed defect this replaces: TodayPlan previously rendered raw
 * Unicode emoji (☀️ 🔁 🧩 ♟️ 🔍) for these — unstyleable, inconsistent
 * across platforms/fonts, and visibly absent in this sandbox's headless
 * Chromium (no emoji font installed, so they rendered as blank/fallback
 * glyphs). SVG sidesteps both problems and matches the nav's own icon set.
 */

const SHARED = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Daily warm-up — a sun, "before anything harder". */
export function WarmUpIcon() {
  return (
    <svg {...SHARED} width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 3.2v1.9M10 14.9v1.9M16.8 10h-1.9M5.1 10H3.2M15.1 4.9l-1.35 1.35M6.25 13.75L4.9 15.1M15.1 15.1l-1.35-1.35M6.25 6.25L4.9 4.9" />
    </svg>
  );
}

/** Review — a due concept coming back around. */
export function ReviewIcon() {
  return (
    <svg {...SHARED} width="18" height="18" aria-hidden="true">
      <path d="M15.8 6.4A6.2 6.2 0 1 0 16.8 10" />
      <path d="M15.8 2.8v3.6h-3.6" />
    </svg>
  );
}

/** Reflect — a closer look at one real mistake. */
export function ReflectIcon() {
  return (
    <svg {...SHARED} width="18" height="18" aria-hidden="true">
      <circle cx="8.6" cy="8.6" r="5.2" />
      <path d="M12.5 12.5l4.3 4.3" />
    </svg>
  );
}

/** A concept that's regressed to genuinely struggling — real accuracy evidence, distinct from `ReflectIcon`'s "just wants a closer look" (used for a contradicted placement inference, never a failure). */
export function StruggleIcon() {
  return (
    <svg {...SHARED} width="18" height="18" aria-hidden="true">
      <path d="M10 6.4v4.4" />
      <circle cx="10" cy="13.6" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth={1.9} />
    </svg>
  );
}

/** A completed step — filled, not just an outline, so "done" reads as a distinct state at a glance rather than the same glyph in a duller color. */
export function StepDoneIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M4.2 10.4l3.3 3.3 8.3-8.3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
