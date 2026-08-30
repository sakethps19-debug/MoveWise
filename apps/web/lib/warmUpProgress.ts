"use client";

/**
 * The Daily Warm-up's manual difficulty override (P0 "always provide a
 * manual difficulty selector and a Too easy/Too hard feedback control") —
 * client-side-only, same best-effort localStorage pattern as
 * onboarding.ts/guestProgress.ts. Applies to both guests and signed-in
 * learners identically: this is a per-device UI preference, not identity-
 * bound progress, so there's no server-side equivalent to keep in sync.
 */

const WARM_UP_DIFFICULTY_KEY = "movewise_warmup_difficulty";

export type WarmUpDifficultyPreference = 1 | 2 | 3;

export function readWarmUpDifficultyOverride(): WarmUpDifficultyPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WARM_UP_DIFFICULTY_KEY);
    const n = raw ? Number(raw) : NaN;
    return n === 1 || n === 2 || n === 3 ? n : null;
  } catch {
    return null;
  }
}

export function saveWarmUpDifficultyOverride(difficulty: WarmUpDifficultyPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WARM_UP_DIFFICULTY_KEY, String(difficulty));
  } catch {
    // ignore
  }
}

const RECENT_WARMUP_PUZZLES_KEY = "movewise_warmup_recent_puzzles";
/** How many of the most recently shown puzzle ids are remembered — enough to avoid an immediate repeat without permanently excluding a puzzle from a thin pool. */
const RECENT_WARMUP_PUZZLES_LIMIT = 10;

/**
 * P1 "repetition avoidance": which puzzle ids the Daily Warm-up served
 * recently, per device — feeds lib/practiceScheduler.ts's
 * `buildPracticeQueue` so today's queue prefers a puzzle the learner
 * hasn't just seen over one they have, same "session-local, per-device"
 * pattern as the difficulty override above.
 */
export function readRecentWarmUpPuzzleIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(RECENT_WARMUP_PUZZLES_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function recordWarmUpPuzzlesShown(puzzleIds: string[]): void {
  if (typeof window === "undefined" || puzzleIds.length === 0) return;
  try {
    const previous = [...readRecentWarmUpPuzzleIds()];
    const merged = [...previous.filter((id) => !puzzleIds.includes(id)), ...puzzleIds].slice(-RECENT_WARMUP_PUZZLES_LIMIT);
    window.localStorage.setItem(RECENT_WARMUP_PUZZLES_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}
