/**
 * Local-only daily-goal/streak tracking (Phase 5: "even if streak data is
 * initially local"). Deliberately not backed by the DB yet — this is a
 * motivational UI layer, not a progress record, so it's safe to keep
 * purely client-side for both guests and signed-in users until a real
 * cross-device streak (Phase B/C territory) is worth building.
 */

const STREAK_KEY = "movewise_streak_days"; // JSON array of "YYYY-MM-DD" strings, one per day a lesson was completed
export const DAILY_GOAL = 1; // lessons/day — deliberately low; this is a beginner product, not a grind loop

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readDays(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STREAK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Records today as a day with at least one completed lesson. Idempotent — safe to call on every completion. */
export function recordCompletionToday(): void {
  if (typeof window === "undefined") return;
  try {
    const days = readDays();
    const today = todayKey();
    if (!days.includes(today)) days.push(today);
    window.localStorage.setItem(STREAK_KEY, JSON.stringify(days));
  } catch {
    // Storage full or unavailable — the streak just won't grow; not worth surfacing.
  }
}

/** Consecutive-day streak ending today or yesterday (a streak isn't broken until a full day is missed). */
export function currentStreak(): number {
  const days = new Set(readDays());
  let streak = 0;
  const cursor = new Date();
  // If today has no completion yet, the streak is still whatever was built
  // through yesterday — don't zero it out just because today isn't done.
  if (!days.has(todayKey())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function completedToday(): boolean {
  return readDays().includes(todayKey());
}
