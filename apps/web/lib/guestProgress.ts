/**
 * Client-side, best-effort persistence for guest (not-signed-in) lesson
 * progress. Deliberately not imported anywhere server-only — this reads
 * and writes `window.localStorage` directly, and every function is a
 * no-op off the client (SSR, or storage disabled/full in private
 * browsing) rather than throwing, since losing a guest's local progress
 * is a degraded experience, not a failure worth surfacing.
 *
 * Migrated into a real account on signup/login — see
 * `migrateGuestProgress` in app/actions.ts — and cleared once a signed-in
 * user's real completions are the source of truth (LearningPath.tsx).
 */

const GUEST_PROGRESS_KEY = "movewise_guest_progress";

export interface GuestProgress {
  [lessonId: string]: { xpEarned: number; mistakes: number };
}

export function readGuestProgress(): GuestProgress {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GUEST_PROGRESS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as GuestProgress) : {};
  } catch {
    return {};
  }
}

export function recordGuestCompletion(lessonId: string, xpEarned: number, mistakes: number): void {
  if (typeof window === "undefined") return;
  const progress = readGuestProgress();
  const existing = progress[lessonId];
  // Same "keep the best run" rule as the signed-in path (completeLessonAction).
  const bestMistakes = existing ? Math.min(existing.mistakes, mistakes) : mistakes;
  progress[lessonId] = { xpEarned, mistakes: bestMistakes };
  try {
    window.localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or unavailable — nothing to do.
  }
}

export function clearGuestProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_PROGRESS_KEY);
  } catch {
    // ignore
  }
}
