import "server-only";
import { prisma, Prisma } from "@movewise/db";

/**
 * P0 "finish checkpoint reliability": the single place that decides
 * whether an incoming LessonCheckpoint write is stale, shared by both
 * call sites that can mutate this row — the ordinary-save/clear Route
 * Handler (app/api/lesson-checkpoint/route.ts, called via keepalive
 * fetch so it survives navigation) and completeLessonAction
 * (app/actions.ts, a Server Action). Before this, completion did a blind
 * `deleteMany` with no revision awareness at all — a save's keepalive
 * fetch that outlived the page just far enough to arrive at the server
 * *after* that delete would silently recreate a "finished" lesson's
 * checkpoint. Routing both call sites through the same revision guard
 * closes that gap: whichever write reaches the database with the higher
 * revision always wins, never whichever happens to arrive first.
 *
 * Completion and "Start over" never hard-delete the row for the same
 * reason — a delete has no revision to compare against, so a stale write
 * arriving afterward has nothing to reject it against and just recreates
 * the row via upsert's create branch. Both instead write a permanent
 * "closed" sentinel (stepIndex = LESSON_CHECKPOINT_CLOSED_STEP) through
 * this same revision-guarded path, so a later stale write is rejected
 * exactly like any other regression, and a genuinely new attempt
 * (a fresh "Start over" run, saved at a higher revision than the close)
 * still succeeds normally.
 */

/** Sentinel stepIndex marking a checkpoint as permanently closed (completed, or explicitly restarted) — apps/web/app/learn/[lessonId]/page.tsx's read path treats this identically to "no checkpoint row at all". */
export const LESSON_CHECKPOINT_CLOSED_STEP = -1;

export interface LessonCheckpointWrite {
  lessonVersion: number;
  stepIndex: number;
  mistakes: number;
  hintsUsed: number;
  attempts: unknown[];
}

export type LessonCheckpointWriteResult = "applied" | "stale";

export async function writeLessonCheckpoint(
  userId: string,
  lessonId: string,
  revision: number,
  write: LessonCheckpointWrite,
): Promise<LessonCheckpointWriteResult> {
  const existing = await prisma.lessonCheckpoint.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { revision: true },
  });
  // Strictly greater, not >= — a retried request carrying the exact same
  // revision as what's already stored is a harmless no-op duplicate, not
  // a new write to reject as "stale" (a stale write is specifically an
  // OLDER revision arriving late).
  if (existing && existing.revision >= revision) return "stale";

  const attemptsJson = write.attempts as unknown as Prisma.InputJsonValue;
  await prisma.lessonCheckpoint.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { revision, ...write, attempts: attemptsJson },
    create: { userId, lessonId, revision, ...write, attempts: attemptsJson },
  });
  return "applied";
}

/**
 * The revision a fresh page load must seed its client-side counter from
 * (components/LessonResumeGate.tsx) — never 0 unconditionally. The
 * revision guard is global per (user, lesson), not per browser tab/mount:
 * a learner who leaves mid-lesson and reopens it starts a brand new
 * client-side counter, but the *server's* stored revision from their
 * previous session is still sitting there. Starting back at 0 would make
 * every one of the resumed session's own saves read as stale against
 * that leftover high-water mark — a real bug this function exists to
 * close, caught by e2e/lesson-resume.spec.ts's own resume test failing
 * against it during development.
 */
export async function readLessonCheckpointRevision(userId: string, lessonId: string): Promise<number> {
  const existing = await prisma.lessonCheckpoint.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { revision: true },
  });
  return existing?.revision ?? 0;
}

export async function closeLessonCheckpoint(userId: string, lessonId: string, revision: number): Promise<void> {
  await writeLessonCheckpoint(userId, lessonId, revision, {
    lessonVersion: 0,
    stepIndex: LESSON_CHECKPOINT_CLOSED_STEP,
    mistakes: 0,
    hintsUsed: 0,
    attempts: [],
  });
}
