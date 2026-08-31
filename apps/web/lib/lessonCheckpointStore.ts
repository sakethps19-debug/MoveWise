import "server-only";
import { prisma, Prisma } from "@movewise/db";

/**
 * P0 "complete checkpoint state model": the explicit state machine a
 * LessonCheckpoint row moves through, and the single write path
 * (writeLessonCheckpoint/closeLessonCheckpoint) both the checkpoint Route
 * Handler (app/api/lesson-checkpoint/route.ts, ordinary saves surviving
 * navigation via keepalive) and completeLessonAction (app/actions.ts) go
 * through — so the two call sites can never disagree about ordering.
 *
 * STATES
 *   1. No attempt          — no row exists yet for this (user, lesson).
 *   2. Active attempt      — a row exists, stepIndex >= 0: genuinely in
 *                             progress, resumable.
 *   3. Closed by restart    — the learner explicitly chose "Start over"
 *                             while an active attempt existed. Recorded as
 *                             the sentinel below at the OLD epoch; a new
 *                             epoch then begins state 4.
 *   4. New active attempt   — the same row, now at a strictly higher
 *                             epoch, stepIndex >= 0 again. From the
 *                             learner's perspective this is indistinguishable
 *                             from state 2 (an ordinary in-progress
 *                             checkpoint) — the epoch bump is invisible
 *                             product behavior, purely a server-side
 *                             ordering primitive.
 *   5. Closed by completion — the lesson was finished. Recorded as the
 *                             sentinel below at whatever epoch the
 *                             finishing attempt was using. Terminal for
 *                             that epoch: the only way out is a *new*
 *                             epoch (revisiting and replaying a completed
 *                             lesson starts fresh exactly like state 3->4).
 *
 * TRANSITIONS a write can request: an ordinary save (stays within the
 * caller's current epoch, bumps revision), or a close (the same write
 * path, with the sentinel stepIndex below — used for both "Start over"
 * and completion; the only difference is which epoch the *next* attempt,
 * if any, will use).
 *
 * ORDERING RULE (the actual state-machine guard, applied to every write):
 *   - incoming.epoch <  stored.epoch  -> ALWAYS rejected ("stale-epoch").
 *     This is what makes an old browser tab's leftover writes harmless
 *     after a restart (or a fresh attempt) begins in another tab or a
 *     later page load: no revision number from the superseded attempt can
 *     ever look "newer" than a genuinely new epoch, because epoch is
 *     compared first and absolutely.
 *   - incoming.epoch >  stored.epoch  -> ALWAYS accepted, adopting the new
 *     epoch and revision unconditionally. A client only ever sends a
 *     higher epoch when it has deliberately decided to start a new
 *     attempt (see components/LessonResumeGate.tsx's `isFreshStart`), so
 *     this is a real, intended transition, not a race to arbitrate.
 *   - incoming.epoch == stored.epoch  -> ordinary same-attempt ordering:
 *     incoming.revision >  stored.revision -> accepted.
 *     incoming.revision == stored.revision -> rejected ("stale-collision")
 *       — two writers (most commonly two tabs open on the same attempt)
 *       independently produced the same revision number; the second one
 *       to arrive is a no-op rather than silently overwriting the first,
 *       and the distinct reason lets the client tell its learner their
 *       change may not be the one that's saved (see checkpointClient.ts).
 *     incoming.revision <  stored.revision -> rejected ("stale-revision")
 *       — an ordinary out-of-order arrival within the same attempt.
 *
 * Content-version mismatches (a lesson edited since the checkpoint was
 * saved) are handled separately, at read time, in
 * app/learn/[lessonId]/page.tsx — a genuinely different concern (content
 * changed underneath a stale row, not a write race) with no concurrent
 * writer to race against, so a plain delete there remains correct.
 */

/** Sentinel stepIndex marking a checkpoint as closed for its current epoch (completed, or explicitly restarted) — apps/web/app/learn/[lessonId]/page.tsx's read path treats this identically to "no checkpoint row at all". */
export const LESSON_CHECKPOINT_CLOSED_STEP = -1;

export interface LessonCheckpointWrite {
  lessonVersion: number;
  stepIndex: number;
  mistakes: number;
  hintsUsed: number;
  attempts: unknown[];
}

export type LessonCheckpointWriteResult = "applied" | "stale-epoch" | "stale-revision" | "stale-collision";

export async function writeLessonCheckpoint(
  userId: string,
  lessonId: string,
  epoch: number,
  revision: number,
  write: LessonCheckpointWrite,
): Promise<LessonCheckpointWriteResult> {
  const existing = await prisma.lessonCheckpoint.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { epoch: true, revision: true },
  });

  if (existing) {
    if (epoch < existing.epoch) return "stale-epoch";
    if (epoch === existing.epoch) {
      if (revision === existing.revision) return "stale-collision";
      if (revision < existing.revision) return "stale-revision";
    }
    // epoch > existing.epoch, or (epoch === existing.epoch && revision > existing.revision): applied below.
  }

  const attemptsJson = write.attempts as unknown as Prisma.InputJsonValue;
  await prisma.lessonCheckpoint.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { epoch, revision, ...write, attempts: attemptsJson },
    create: { userId, lessonId, epoch, revision, ...write, attempts: attemptsJson },
  });
  return "applied";
}

/**
 * The epoch/revision a fresh page load must seed its client-side counters
 * from (components/LessonResumeGate.tsx) — never unconditionally 0. Both
 * are global per (user, lesson), not per browser tab/mount: a learner who
 * leaves mid-lesson and reopens it starts brand new client-side counters,
 * but the *server's* stored state from their previous session is still
 * sitting there.
 */
export async function readLessonCheckpointState(
  userId: string,
  lessonId: string,
): Promise<{ epoch: number; revision: number }> {
  const existing = await prisma.lessonCheckpoint.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { epoch: true, revision: true },
  });
  return { epoch: existing?.epoch ?? 0, revision: existing?.revision ?? 0 };
}

export async function closeLessonCheckpoint(userId: string, lessonId: string, epoch: number, revision: number): Promise<void> {
  await writeLessonCheckpoint(userId, lessonId, epoch, revision, {
    lessonVersion: 0,
    stepIndex: LESSON_CHECKPOINT_CLOSED_STEP,
    mistakes: 0,
    hintsUsed: 0,
    attempts: [],
  });
}
