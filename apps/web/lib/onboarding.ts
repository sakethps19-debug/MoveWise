/**
 * Client-side-only "have we asked this learner the onboarding questions
 * yet" signal (P1-A), same best-effort localStorage pattern as
 * guestProgress.ts/lessonProgressUI.ts — a no-op off the client or when
 * storage is unavailable, never thrown. Deliberately not persisted
 * server-side even for a signed-in learner: this only shapes which CTA
 * the homepage emphasizes first, never gates or unlocks content, so
 * losing it just means asking again, not losing real progress.
 */

const ONBOARDING_KEY = "movewise_onboarding";

export type ChessExperience = "new" | "knows-pieces" | "casual" | "rated";
export type LearningGoal = "from-scratch" | "stop-blundering" | "improve-tactics" | "improve-games";
export type DailyMinutes = 5 | 10 | 20;

export interface OnboardingAnswers {
  experience: ChessExperience;
  goal: LearningGoal;
  minutesPerDay: DailyMinutes;
}

interface StoredOnboarding {
  /** Null when the learner skipped rather than answered. */
  answers: OnboardingAnswers | null;
  seenAt: number;
}

function readStored(): StoredOnboarding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredOnboarding) : null;
  } catch {
    return null;
  }
}

export function hasSeenOnboarding(): boolean {
  return readStored() !== null;
}

export function readOnboardingAnswers(): OnboardingAnswers | null {
  return readStored()?.answers ?? null;
}

export function saveOnboardingAnswers(answers: OnboardingAnswers): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ answers, seenAt: Date.now() }));
  } catch {
    // Storage full or unavailable — the quiz just won't be remembered as answered.
  }
}

export function skipOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ answers: null, seenAt: Date.now() }));
  } catch {
    // ignore
  }
}

/** A short line of copy shaped by the learner's stated goal — framing only, never a gate. */
export function greetingForGoal(goal: LearningGoal): string {
  switch (goal) {
    case "from-scratch":
      return "Let's start from the very beginning.";
    case "stop-blundering":
      return "We'll focus on spotting threats before they cost you a piece.";
    case "improve-tactics":
      return "We'll get you into tactics as soon as the fundamentals are covered.";
    case "improve-games":
      return "We'll connect what you learn straight back to your own games.";
  }
}

/**
 * A learner who already knows how the pieces move (or better) gets an
 * extra, secondary way in: straight to practice puzzles instead of
 * restarting from "how does a rook move" — never a silent unlock of
 * gated lesson content (that still requires real completions), just a
 * more prominent link to what's already open to everyone (Board Basics
 * puzzles, per the "always provide useful practice" work).
 */
export function prefersPracticeFirst(experience: ChessExperience): boolean {
  return experience !== "new";
}
