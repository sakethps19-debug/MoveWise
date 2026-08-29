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
