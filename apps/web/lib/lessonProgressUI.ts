/**
 * Client-side "started but not finished" signal, purely for the learning
 * path's "in progress" status (Phase 4). Deliberately separate from real
 * completion data (LessonCompletion / guestProgress.ts): this is a UI
 * affordance, not a progress record — it's never read by anything that
 * grants XP, mastery, or unlocking, so it's safe to track for signed-in
 * users too (not just guests) without touching the DB. Best-effort, same
 * as guestProgress.ts: a no-op off the client or when storage is
 * unavailable, never thrown.
 */

const STARTED_LESSONS_KEY = "movewise_started_lessons";

function readStartedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STARTED_LESSONS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function markLessonStarted(lessonId: string): void {
  if (typeof window === "undefined") return;
  try {
    const started = readStartedSet();
    if (started.has(lessonId)) return;
    started.add(lessonId);
    window.localStorage.setItem(STARTED_LESSONS_KEY, JSON.stringify([...started]));
  } catch {
    // Storage full or unavailable — "in progress" just won't show; not worth surfacing.
  }
}

/** Clears the "started" marker for a lesson once it's actually completed — completed supersedes in-progress. */
export function clearLessonStarted(lessonId: string): void {
  if (typeof window === "undefined") return;
  try {
    const started = readStartedSet();
    if (!started.has(lessonId)) return;
    started.delete(lessonId);
    window.localStorage.setItem(STARTED_LESSONS_KEY, JSON.stringify([...started]));
  } catch {
    // Nothing to do — see markLessonStarted.
  }
}

export function readStartedLessons(): Set<string> {
  return readStartedSet();
}

export function clearAllStartedLessons(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STARTED_LESSONS_KEY);
  } catch {
    // Nothing to do.
  }
}
