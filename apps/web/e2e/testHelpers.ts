import type { Page } from "@playwright/test";

/**
 * Every content lesson's direct `prerequisites[0]` (packages/content),
 * duplicated here rather than read from the filesystem because these
 * specs run against a built/dev server, not the content package
 * directly. Used only by `gotoGuestLesson` below — keep in sync with
 * packages/content/units/**\/*.json if a lesson's prerequisite chain
 * changes; a stale entry here just means a spec seeds a redundant
 * prerequisite (harmless) or none when one now exists (the spec
 * fails loudly with a locked-page redirect, not silently).
 */
const LESSON_PREREQUISITE: Record<string, string> = {
  "meet-the-pieces.02-ranks-files-squares": "meet-the-pieces.01-welcome",
  "meet-the-pieces.03-meet-the-rook": "meet-the-pieces.02-ranks-files-squares",
  "meet-the-pieces.04-rook-captures": "meet-the-pieces.03-meet-the-rook",
  "meet-the-pieces.05-meet-the-bishop": "meet-the-pieces.04-rook-captures",
  "meet-the-pieces.06-bishop-colours": "meet-the-pieces.05-meet-the-bishop",
  "meet-the-pieces.07-meet-the-queen": "meet-the-pieces.06-bishop-colours",
  "meet-the-pieces.08-meet-the-king": "meet-the-pieces.07-meet-the-queen",
  "meet-the-pieces.09-meet-the-knight": "meet-the-pieces.08-meet-the-king",
  "meet-the-pieces.10-meet-the-pawn": "meet-the-pieces.09-meet-the-knight",
  "meet-the-pieces.11-capturing-piece-values": "meet-the-pieces.10-meet-the-pawn",
  "meet-the-pieces.13-king-safety-and-castling": "meet-the-pieces.11-capturing-piece-values",
  "meet-the-pieces.12-unit-mastery-challenge": "meet-the-pieces.13-king-safety-and-castling",
  "check-and-checkmate.01-what-is-check": "meet-the-pieces.12-unit-mastery-challenge",
  "check-and-checkmate.02-what-is-checkmate": "check-and-checkmate.01-what-is-check",
  "check-and-checkmate.03-thinking-under-check": "check-and-checkmate.02-what-is-checkmate",
  "check-and-checkmate.04-back-rank-safety": "check-and-checkmate.03-thinking-under-check",
  "basic-tactics.01-the-knight-fork": "check-and-checkmate.04-back-rank-safety",
  "basic-tactics.02-hanging-pieces": "basic-tactics.01-the-knight-fork",
  "basic-tactics.03-opening-development": "basic-tactics.02-hanging-pieces",
  "basic-tactics.04-is-this-trade-worth-it": "basic-tactics.03-opening-development",
  "tactical-vision.01-checks-captures-and-threats": "basic-tactics.04-is-this-trade-worth-it",
  "tactical-vision.02-hanging-pieces-in-combination": "tactical-vision.01-checks-captures-and-threats",
  "tactical-vision.03-knight-fork-tactics": "tactical-vision.02-hanging-pieces-in-combination",
  "tactical-vision.04-forking-patterns": "tactical-vision.03-knight-fork-tactics",
  "tactical-vision.05-pins": "tactical-vision.04-forking-patterns",
  "tactical-vision.06-skewers": "tactical-vision.05-pins",
  "tactical-vision.07-discovered-attacks": "tactical-vision.06-skewers",
  "tactical-vision.08-removing-the-defender": "tactical-vision.07-discovered-attacks",
  "tactical-vision.09-back-rank-tactics": "tactical-vision.08-removing-the-defender",
  "tactical-vision.10-zwischenzug": "tactical-vision.09-back-rank-tactics",
  "tactical-vision.11-mixed-tactical-calculation": "tactical-vision.10-zwischenzug",
  "tactical-vision.12-unit-mastery-challenge": "tactical-vision.11-mixed-tactical-calculation",
};

/**
 * Navigates a guest (not-signed-in) browser context straight to
 * `lessonId`, first seeding its direct prerequisite as already
 * completed via `seedGuestProgress` — so components/LessonGate.tsx (the
 * client-side prerequisite check a guest hits on direct lesson
 * navigation) lets the page through instead of redirecting to the
 * locked-lesson banner. Most specs that reach a lesson this way are
 * testing something else entirely (board geometry, hearts, accessibility,
 * exercise step types) and use this purely as a fixture — replaying
 * every prerequisite lesson through the UI first would be slow and
 * would test nothing new each time.
 *
 * Seeds only once, right before this specific navigation — see
 * `seedGuestProgress`'s own doc comment for why this matters whenever a
 * test later does a second, real `page.goto` of its own (e.g. after
 * completing this lesson for real through the UI).
 */
export async function gotoGuestLesson(page: Page, lessonId: string): Promise<void> {
  const prerequisite = LESSON_PREREQUISITE[lessonId];
  if (prerequisite) {
    // seedGuestProgress needs an already-loaded same-origin page to write
    // localStorage against — land on the home page first (cheap; this
    // navigation's own render doesn't matter, only that we're now on the
    // app's origin) before seeding, then navigate on to the real target.
    await page.goto("/");
    await seedGuestProgress(page, [prerequisite]);
  }
  // Real lesson resume (P1-C) means a second visit to the same lessonId
  // within one test — several specs call this helper more than once per
  // lesson purely to reset the exercise for a fresh attempt — would now
  // hit LessonResumeGate's "Welcome back" screen instead of the fresh
  // start these callers expect, since the first visit's own step-advance
  // saved a real guest checkpoint. Clears it first; only runs when
  // already on the app's origin (this call's own prerequisite branch
  // above, or an earlier navigation this same test made) — a context's
  // very first navigation has nothing to clear yet.
  if (page.url().startsWith("http")) {
    await clearGuestLessonCheckpoint(page, lessonId);
  }
  await page.goto(`/learn/${lessonId}`);
}

async function clearGuestLessonCheckpoint(page: Page, lessonId: string): Promise<void> {
  await page.evaluate((id) => {
    try {
      const raw = window.localStorage.getItem("movewise_guest_checkpoints");
      if (!raw) return;
      const checkpoints = JSON.parse(raw) as Record<string, unknown>;
      delete checkpoints[id];
      window.localStorage.setItem("movewise_guest_checkpoints", JSON.stringify(checkpoints));
    } catch {
      // ignore
    }
  }, lessonId);
}

/**
 * Seeds this guest browser context's localStorage as if `lessonIds` were
 * already completed, mirroring lib/guestProgress.ts's real storage format
 * exactly (same key, same `{ xpEarned, mistakes, hintsUsed }` shape) — so
 * components/LessonGate.tsx (the client-side prerequisite check a guest
 * hits on direct lesson navigation) reads it exactly the same way a
 * genuine completion would produce.
 *
 * Exists because many specs unrelated to progression itself (board
 * geometry, accessibility, hearts, exercise step types...) navigate a
 * guest straight to a lesson several prerequisites deep, purely as a
 * fixture to reach the step under test — replaying every prerequisite
 * lesson through the UI first would be slow and would test nothing new
 * each time.
 *
 * Uses `page.evaluate` on an already-loaded page, not
 * `page.addInitScript` — a real bug this fixed: `addInitScript` stays
 * registered for the rest of the browser context and re-runs on *every*
 * later navigation too, so a test that seeds once, completes the lesson
 * for real through the UI (which legitimately writes its own completion
 * to the same localStorage key), and then navigates on to the *next*
 * lesson would have this stale init script silently overwrite that real
 * completion right back to just the originally-seeded value — locking
 * the next lesson the test expected to already be unlocked. `evaluate`
 * runs exactly once, only for this specific call, with no such
 * persistence. Requires the page to already be on the app's origin
 * (can't set localStorage before any navigation has happened), which
 * `gotoGuestLesson` guarantees isn't a problem since it's the only
 * caller and always navigates immediately afterward anyway — but calling
 * this directly on a page that hasn't loaded the app yet will throw.
 */
export async function seedGuestProgress(page: Page, lessonIds: string[]): Promise<void> {
  const progress = Object.fromEntries(lessonIds.map((id) => [id, { xpEarned: 10, mistakes: 0, hintsUsed: 0 }]));
  await page.evaluate((serialized) => {
    window.localStorage.setItem("movewise_guest_progress", serialized);
  }, JSON.stringify(progress));
}

/**
 * P1-A: a genuinely fresh visitor (no progress at all) now sees a
 * one-time skippable onboarding quiz, then a compact "current chapter /
 * next chapter preview" homepage instead of every unit's full lesson
 * list immediately (see components/LearningPath.tsx, OnboardingQuiz.tsx)
 * — the intentional new default, not a regression. Specs that verify the
 * full syllabus's lock/unlock display (lesson-node classes, unit
 * headings, mastery badges) against a fresh account/guest need that full
 * view rendered, so this dismisses the quiz and expands the compact
 * preview if either is showing; a no-op for a page state where neither
 * is (already-expanded, or a returning learner who skips both).
 */
export async function ensureFullCurriculumVisible(page: Page): Promise<void> {
  const skipButton = page.getByRole("button", { name: "Skip for now" });
  // `waitFor` (not a plain `isVisible()` snapshot) so a caller landing
  // here right after a server action whose data hasn't finished
  // revalidating yet (e.g. a dev-only progress reset) still gets a real
  // chance to see the transition instead of concluding "not shown" from
  // whatever was on screen a moment too early.
  const skipShown = await skipButton
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (skipShown) await skipButton.click();

  const expandButton = page.getByRole("button", { name: "View full curriculum" });
  const expandShown = await expandButton
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (expandShown) await expandButton.click();
}
