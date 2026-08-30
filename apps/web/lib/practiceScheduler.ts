import type { Puzzle } from "@movewise/exercise-schema";
import type { MasteryStatus } from "./masteryModel";
import type { ConceptEvidenceLevel } from "./placementEvidence";
import type { WarmUpCandidate, WarmUpDifficulty } from "./warmUp";

/**
 * P1 "build real personalized practice": replaces the earlier
 * frontier-unit-only warm-up selection (lib/warmUp.ts's `frontierUnitId` +
 * `pickWarmUpPuzzles`, which only ever looked at "which unit is the
 * learner's current chapter") with a transparent priority function over
 * every concept the learner has ever touched, plus a real due-date
 * scheduler. Both halves are pure and independently testable — no fs/db
 * access here, callers (app/practice/warm-up/page.tsx for signed-in
 * learners, components/WarmUpRunner.tsx for guests) supply already-loaded
 * signals.
 */

/**
 * A documented, tested Leitner-derived review schedule: a "box" is just
 * the learner's current consecutive-correct streak on this concept
 * (capped), so no new persisted state is needed beyond the
 * ExerciseAttempt history computeMasteryStatus already reads — a miss
 * resets the streak (and the box) to zero, a hit advances it, and each
 * box maps to a longer wait before the concept is due again.
 */
export const LEITNER_INTERVALS_DAYS: readonly number[] = [1, 2, 4, 7, 14, 30];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewScheduleAttempt {
  correct: boolean;
  at: Date;
}

export interface ReviewSchedule {
  box: number;
  intervalDays: number;
  nextDueAt: Date;
}

/**
 * `attemptsOldestFirst` is the same per-concept ExerciseAttempt history
 * `computeMasteryStatus` already consumes (app/actions.ts's
 * `recomputeMasteryForConcepts`) — this is a separate pure function
 * rather than a field bolted onto that one's result so its existing,
 * already-tested return shape (`{ status, exerciseConfidence }`) never
 * has to change.
 */
export function computeReviewSchedule(attemptsOldestFirst: ReviewScheduleAttempt[], now: Date = new Date()): ReviewSchedule {
  if (attemptsOldestFirst.length === 0) {
    return { box: 0, intervalDays: LEITNER_INTERVALS_DAYS[0]!, nextDueAt: now };
  }
  let box = 0;
  for (let i = attemptsOldestFirst.length - 1; i >= 0; i--) {
    if (attemptsOldestFirst[i]!.correct) box++;
    else break;
  }
  box = Math.min(box, LEITNER_INTERVALS_DAYS.length - 1);
  const intervalDays = LEITNER_INTERVALS_DAYS[box]!;
  const last = attemptsOldestFirst[attemptsOldestFirst.length - 1]!.at;
  return { box, intervalDays, nextDueAt: new Date(last.getTime() + intervalDays * DAY_MS) };
}

/**
 * Everything the priority function considers for one concept. Every
 * field is optional/nullable so the same function serves a signed-in
 * learner (full UserConceptMastery + ExerciseAttempt history) and a guest
 * (only placement evidence and locally-tracked mistake counts —
 * lib/guestProgress.ts) without a second code path.
 */
export interface ConceptPracticeSignal {
  conceptId: string;
  status: MasteryStatus | null;
  /** 0-1, UserConceptMastery.exerciseConfidence — how sure the existing evidence is, independent of the "when did we last check" question `nextDueAt` answers. */
  exerciseConfidence: number;
  lastPracticedAt: Date | null;
  nextDueAt: Date | null;
  placementEvidenceLevel: ConceptEvidenceLevel | null;
  /** Incorrect attempts within recent memory (the same "recent incorrect attempts" signal the product brief names) — a small integer, not a lifetime total. */
  recentIncorrectCount: number;
}

export interface RankedConcept {
  conceptId: string;
  score: number;
  /** A short, human-readable explanation for why this concept was queued — every queued puzzle must show one, never a generic "solid pick". */
  reason: string;
}

const STATUS_WEIGHT: Record<MasteryStatus, number> = {
  "not-started": 4,
  learning: 12,
  practising: 18,
  "ready-for-assessment": 14,
  proficient: 2,
  mastered: 0,
  "revision-due": 22,
  struggling: 32,
  recovered: 6,
};

/**
 * Scores and ranks concepts highest-priority-first. Considers: review due
 * date (overdue concepts score higher, proportional to how overdue),
 * recent incorrect attempts, concept mastery status, placement evidence
 * confidence, and time since last exposure — the exact signal list the
 * product brief calls for, minus "difficulty fit" and "repetition
 * avoidance", which are properties of *which puzzle* is chosen for a
 * concept, not of the concept's priority (see `buildPracticeQueue`).
 */
export function rankConceptsForPractice(signals: ConceptPracticeSignal[], now: Date = new Date()): RankedConcept[] {
  return signals.map((s) => scoreConcept(s, now)).sort((a, b) => b.score - a.score);
}

function scoreConcept(s: ConceptPracticeSignal, now: Date): RankedConcept {
  let score = STATUS_WEIGHT[s.status ?? "not-started"];
  const reasonCandidates: string[] = [];

  // Priority order for the single reason shown to the learner — the
  // strongest, most specific signal wins, even though every signal below
  // still contributes to the numeric score regardless of which one gets
  // to explain itself in the UI.
  if (s.status === "struggling") reasonCandidates.push("still struggling with this");

  if (s.recentIncorrectCount > 0) {
    score += Math.min(30, s.recentIncorrectCount * 12);
    reasonCandidates.push(`missed ${s.recentIncorrectCount} recent attempt${s.recentIncorrectCount === 1 ? "" : "s"}`);
  }

  if (s.placementEvidenceLevel === "later_contradicted") {
    score += 20;
    reasonCandidates.push("recent practice contradicted your placement result on this");
  }

  if (s.placementEvidenceLevel === "needs_confirmation") {
    score += 18;
    reasonCandidates.push("your placement result on this needs confirming");
  }

  if (s.nextDueAt) {
    const overdueDays = (now.getTime() - s.nextDueAt.getTime()) / DAY_MS;
    if (overdueDays >= 0) {
      score += Math.min(40, 10 + overdueDays * 2);
      reasonCandidates.push(
        overdueDays < 1
          ? "due for review today"
          : `overdue for review by ${Math.floor(overdueDays)} day${Math.floor(overdueDays) === 1 ? "" : "s"}`,
      );
    }
  }

  if (s.placementEvidenceLevel === "unverified") {
    score += 10;
    reasonCandidates.push("never directly tested yet");
  }
  // Deliberately no separate bonus for inferred_high_confidence: it's
  // trusted enough to bypass a prerequisite (lib/placementEvidence.ts's
  // BYPASS_EVIDENCE_LEVELS already includes it alongside
  // directly_demonstrated), so for *scheduling priority* specifically it
  // must score the same as a direct check — a small "inference deserves a
  // little more attention" bonus here previously outranked genuinely
  // harder directly-demonstrated concepts on ties, which is exactly the
  // "rated learner keeps getting elementary puzzles" bug this whole
  // scheduler exists to prevent (see buildPracticeQueue's difficulty-fit
  // tiebreak below for how real ties are actually resolved).

  if (!s.nextDueAt && (s.status === null || s.status === "not-started")) {
    reasonCandidates.push("not yet practiced");
  }

  score += (1 - s.exerciseConfidence) * 15;

  if (s.lastPracticedAt) {
    const daysSince = (now.getTime() - s.lastPracticedAt.getTime()) / DAY_MS;
    score += Math.min(10, daysSince * 0.5);
  }

  if (s.status === "practising") reasonCandidates.push("still practising this");
  if (s.status === "proficient") reasonCandidates.push("keeping this fresh");

  return { conceptId: s.conceptId, score, reason: reasonCandidates[0] ?? "keeping your skills sharp" };
}

export interface PracticeQueueItem {
  puzzle: Puzzle;
  conceptId: string;
  reason: string;
}

/**
 * Turns a ranked concept list into an actual puzzle queue: walks the
 * ranking highest-first, picks one puzzle per concept (difficulty fit:
 * prefers an exact match, falls back rather than skipping a genuinely
 * higher-priority concept over a difficulty nicety), and skips puzzles
 * already used in this queue or recently shown (`recentlySeenPuzzleIds`)
 * so the same one or two puzzles don't repeat every single day —
 * "repetition avoidance" and "difficulty fit" both live here, not in the
 * ranking step above, because they're about *which puzzle*, not *which
 * concept*.
 *
 * Equal-scoring concepts (a real, common case: e.g. a rated learner whose
 * placement demonstrated everything, so every concept scores identically
 * "trusted") are re-sorted by how well each one's puzzle pool actually
 * fits `preferredDifficulty` before the walk below runs — otherwise a
 * flat tie falls back to array order, which happens to put the
 * curriculum's very first (easiest) concept first regardless of the
 * learner's real level, exactly the elementary-puzzle bug this scheduler
 * exists to prevent.
 */
export function buildPracticeQueue(
  candidates: WarmUpCandidate[],
  rankedConcepts: RankedConcept[],
  options: { count: number; preferredDifficulty: WarmUpDifficulty; recentlySeenPuzzleIds?: ReadonlySet<string> },
): PracticeQueueItem[] {
  const { count, preferredDifficulty, recentlySeenPuzzleIds = new Set() } = options;
  const queue: PracticeQueueItem[] = [];
  const used = new Set<string>();

  function choose(pool: WarmUpCandidate[]): WarmUpCandidate | null {
    if (pool.length === 0) return null;
    const notRecentlySeen = pool.filter((c) => !recentlySeenPuzzleIds.has(c.puzzle.id));
    const searchPool = notRecentlySeen.length > 0 ? notRecentlySeen : pool;
    const exact = searchPool.filter((c) => c.puzzle.difficulty === preferredDifficulty);
    return (exact.length > 0 ? exact : searchPool)[0]!;
  }

  function closestDifficultyDistance(conceptId: string): number {
    const pool = candidates.filter((c) => c.conceptId === conceptId);
    if (pool.length === 0) return Infinity;
    return Math.min(...pool.map((c) => Math.abs(c.puzzle.difficulty - preferredDifficulty)));
  }

  const walkOrder = [...rankedConcepts].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return closestDifficultyDistance(a.conceptId) - closestDifficultyDistance(b.conceptId);
  });

  for (const ranked of walkOrder) {
    if (queue.length >= count) break;
    const pool = candidates.filter((c) => c.conceptId === ranked.conceptId && !used.has(c.puzzle.id));
    const chosen = choose(pool);
    if (!chosen) continue;
    queue.push({ puzzle: chosen.puzzle, conceptId: ranked.conceptId, reason: ranked.reason });
    used.add(chosen.puzzle.id);
  }

  if (queue.length < count) {
    for (const c of candidates) {
      if (queue.length >= count) break;
      if (used.has(c.puzzle.id)) continue;
      queue.push({ puzzle: c.puzzle, conceptId: c.conceptId, reason: "keeping your skills sharp" });
      used.add(c.puzzle.id);
    }
  }

  return queue;
}
