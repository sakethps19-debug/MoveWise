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
  [lessonId: string]: { xpEarned: number; mistakes: number; hintsUsed: number };
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

export function recordGuestCompletion(lessonId: string, xpEarned: number, mistakes: number, hintsUsed: number): void {
  if (typeof window === "undefined") return;
  const progress = readGuestProgress();
  const existing = progress[lessonId];
  // Same "keep the best run" rule as the signed-in path (completeLessonAction).
  const bestMistakes = existing ? Math.min(existing.mistakes, mistakes) : mistakes;
  const bestHintsUsed = existing ? Math.min(existing.hintsUsed, hintsUsed) : hintsUsed;
  progress[lessonId] = { xpEarned, mistakes: bestMistakes, hintsUsed: bestHintsUsed };
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

const GUEST_CHECKPOINTS_KEY = "movewise_guest_checkpoints";

/** Mirrors the signed-in LessonCheckpoint row (packages/db) for a guest's in-progress lesson. */
export interface GuestLessonCheckpoint {
  lessonVersion: number;
  stepIndex: number;
  mistakes: number;
  hintsUsed: number;
  attempts: Array<{ stepId: string; correct: boolean; wrongAnswerKey: string | null }>;
  updatedAt: number;
}

interface GuestCheckpoints {
  [lessonId: string]: GuestLessonCheckpoint;
}

function readGuestCheckpoints(): GuestCheckpoints {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GUEST_CHECKPOINTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as GuestCheckpoints) : {};
  } catch {
    return {};
  }
}

/** Returns null if there's no saved checkpoint, or it was saved against a since-edited lesson version. */
export function readGuestLessonCheckpoint(lessonId: string, lessonVersion: number): GuestLessonCheckpoint | null {
  const checkpoint = readGuestCheckpoints()[lessonId];
  if (!checkpoint || checkpoint.lessonVersion !== lessonVersion) return null;
  return checkpoint;
}

export function saveGuestLessonCheckpoint(
  lessonId: string,
  lessonVersion: number,
  state: { stepIndex: number; mistakes: number; hintsUsed: number; attempts: GuestLessonCheckpoint["attempts"] },
): void {
  if (typeof window === "undefined") return;
  const checkpoints = readGuestCheckpoints();
  checkpoints[lessonId] = { ...state, lessonVersion, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(GUEST_CHECKPOINTS_KEY, JSON.stringify(checkpoints));
  } catch {
    // Storage full or unavailable — resume just won't be offered next time.
  }
}

export function clearGuestLessonCheckpoint(lessonId: string): void {
  if (typeof window === "undefined") return;
  const checkpoints = readGuestCheckpoints();
  if (!(lessonId in checkpoints)) return;
  delete checkpoints[lessonId];
  try {
    window.localStorage.setItem(GUEST_CHECKPOINTS_KEY, JSON.stringify(checkpoints));
  } catch {
    // ignore
  }
}

/**
 * The rest of this file (below) extends guest tracking beyond lesson
 * completions to everything the signed-in Progress dashboard already
 * shows: streak, practice accuracy, warm-ups, and games played/analysed.
 * A guest previously left every one of these unrecorded — not because
 * the underlying activity didn't happen (real puzzle attempts, real
 * games, real analysis all already ran client-side), but because nothing
 * wrote it anywhere, so `/progress` for a guest showed only a lesson
 * count. Same rules as the rest of this file: localStorage only, best-
 * effort (a no-op off the client or when storage is unavailable), never
 * synced to the server or migrated into an account — signup already
 * offers the real, persisted alternative.
 */

const GUEST_ACTIVITY_KEY = "movewise_guest_activity_days";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Marks today as a day with real guest activity — the same signal `computeStreak` (lib/progressSummary.ts) already uses for signed-in learners, just sourced from localStorage instead of completion timestamps. */
export function recordGuestActivityDay(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(GUEST_ACTIVITY_KEY);
    const days: string[] = raw ? JSON.parse(raw) : [];
    const today = todayKey();
    if (!days.includes(today)) days.push(today);
    // Unbounded growth isn't a real concern (one short string per active
    // day), but a guest session is realistically weeks/months, not years —
    // capped generously so this never becomes a genuinely large value.
    window.localStorage.setItem(GUEST_ACTIVITY_KEY, JSON.stringify(days.slice(-400)));
  } catch {
    // Storage full or unavailable — the streak just won't extend today.
  }
}

/** The real activity-day dates `computeStreak` needs — parsed back into `Date`s at local midnight UTC, matching how it reads them. */
export function readGuestActivityDates(): Date[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_ACTIVITY_KEY);
    if (!raw) return [];
    const days: unknown = JSON.parse(raw);
    if (!Array.isArray(days)) return [];
    return days.filter((d): d is string => typeof d === "string").map((d) => new Date(`${d}T00:00:00Z`));
  } catch {
    return [];
  }
}

const GUEST_PRACTICE_KEY = "movewise_guest_practice";

interface GuestPracticeStats {
  attempts: number;
  correct: number;
}

/** A guest's puzzle-practice attempt (Daily warm-up or a unit's puzzle pool) — previously discarded entirely for a guest (recordPuzzleAttemptAction is a no-op without a session); now at least visible on their own device. */
export function recordGuestPracticeAttempt(correct: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const stats = readGuestPracticeStats();
    stats.attempts += 1;
    if (correct) stats.correct += 1;
    window.localStorage.setItem(GUEST_PRACTICE_KEY, JSON.stringify(stats));
    recordGuestActivityDay();
  } catch {
    // ignore
  }
}

export function readGuestPracticeStats(): GuestPracticeStats {
  if (typeof window === "undefined") return { attempts: 0, correct: 0 };
  try {
    const raw = window.localStorage.getItem(GUEST_PRACTICE_KEY);
    if (!raw) return { attempts: 0, correct: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { attempts: 0, correct: 0 };
    const { attempts, correct } = parsed as GuestPracticeStats;
    return { attempts: typeof attempts === "number" ? attempts : 0, correct: typeof correct === "number" ? correct : 0 };
  } catch {
    return { attempts: 0, correct: 0 };
  }
}

const GUEST_WARMUPS_KEY = "movewise_guest_warmups_completed";

export function recordGuestWarmUpCompletion(): void {
  if (typeof window === "undefined") return;
  try {
    const count = readGuestWarmUpsCompleted() + 1;
    window.localStorage.setItem(GUEST_WARMUPS_KEY, String(count));
    recordGuestActivityDay();
  } catch {
    // ignore
  }
}

export function readGuestWarmUpsCompleted(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(GUEST_WARMUPS_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

const GUEST_GAMES_KEY = "movewise_guest_games";

interface GuestGameRecord {
  playedAt: number;
  analysed: boolean;
  /** Set only once the game has been analysed — the real per-classification counts from that game's GameReview.summary. */
  classificationCounts: Partial<Record<string, number>> | null;
}

function readGuestGames(): GuestGameRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_GAMES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GuestGameRecord[]) : [];
  } catch {
    return [];
  }
}

function writeGuestGames(games: GuestGameRecord[]): void {
  try {
    // A guest realistically plays a handful of games per session, not
    // hundreds — capped so this never grows unbounded, same reasoning as
    // the activity-day log above.
    window.localStorage.setItem(GUEST_GAMES_KEY, JSON.stringify(games.slice(-100)));
  } catch {
    // Storage full or unavailable — this game's record just won't be kept.
  }
}

/** Called once a guest's game ends (win/loss/draw/resignation) — mirrors when the signed-in path first persists a `Game` row, just local instead of a database write. */
export function recordGuestGamePlayed(): void {
  if (typeof window === "undefined") return;
  const games = readGuestGames();
  games.push({ playedAt: Date.now(), analysed: false, classificationCounts: null });
  writeGuestGames(games);
  recordGuestActivityDay();
}

/** Called once a guest's "Analyze this game" pass completes — attaches the real classification counts to the most recent not-yet-analysed game (there's always exactly one, since analysis only ever runs after `recordGuestGamePlayed` for the game that just ended). */
export function recordGuestGameAnalysed(classificationCounts: Record<string, number>): void {
  if (typeof window === "undefined") return;
  const games = readGuestGames();
  for (let i = games.length - 1; i >= 0; i--) {
    if (!games[i].analysed) {
      games[i] = { ...games[i], analysed: true, classificationCounts };
      writeGuestGames(games);
      recordGuestActivityDay();
      return;
    }
  }
}

export interface GuestGameStats {
  gamesPlayed: number;
  gamesAnalysed: number;
  /** Summed across every analysed guest game — the same shape as GameReview.summary, keyed loosely (string, not MoveClassification) so this file doesn't need to know that type's exact shape just to store and re-sum numbers it never interprets itself. */
  classificationTotals: Record<string, number>;
  /** mistake + blunder count across every analysed guest game — the guest-local equivalent of the signed-in dashboard's "Mistakes from analysed games" count. */
  reviewItems: number;
}

export function readGuestGameStats(): GuestGameStats {
  const games = readGuestGames();
  const classificationTotals: Record<string, number> = {};
  let reviewItems = 0;
  for (const game of games) {
    if (!game.classificationCounts) continue;
    for (const [classification, count] of Object.entries(game.classificationCounts)) {
      classificationTotals[classification] = (classificationTotals[classification] ?? 0) + (count ?? 0);
      if (classification === "mistake" || classification === "blunder") reviewItems += count ?? 0;
    }
  }
  return {
    gamesPlayed: games.length,
    gamesAnalysed: games.filter((g) => g.analysed).length,
    classificationTotals,
    reviewItems,
  };
}
