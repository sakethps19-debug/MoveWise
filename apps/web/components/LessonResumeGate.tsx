"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@movewise/exercise-schema";
import { LessonRunner, type AttemptRecord, type LessonCheckpointState } from "./LessonRunner";
import { Button } from "./ui/Button";
import { readGuestLessonCheckpoint, clearGuestLessonCheckpoint } from "../lib/guestProgress";
import { createSerialQueue } from "../lib/serialQueue";
import { saveLessonCheckpointRequest, clearLessonCheckpointRequest } from "../lib/checkpointClient";

interface LessonResumeGateProps {
  lesson: Lesson;
  isGuest: boolean;
  /** Signed-in only — read server-side in app/learn/[lessonId]/page.tsx, already version-checked. Always null for guests. */
  initialCheckpoint: LessonCheckpointState | null;
  onComplete?: (
    xpEarned: number,
    mistakes: number,
    hintsUsed: number,
    attempts: AttemptRecord[],
  ) => void | Promise<void>;
}

/**
 * The "reopening a lesson restarted at step 1" fix's other half: even once
 * a checkpoint exists, silently resuming into it isn't what was asked for
 * either — "Resume lesson" and "Restart lesson" must be two distinct,
 * explicit actions. This sits in front of LessonRunner and asks first,
 * whenever there's a checkpoint past step 1 to ask about.
 *
 * Signed-in: the checkpoint is already known at SSR time (initialCheckpoint,
 * loaded and version-checked server-side in the lesson page), so the very
 * first paint can already show the choice — no flash, no hydration
 * mismatch. Guests have no server session for that; their checkpoint lives
 * in localStorage, unreadable during SSR, so it's read client-side in an
 * effect (same "must match the server's first paint, update after mount"
 * pattern lib/lessonProgressUI.ts already uses for the same reason) — a
 * returning guest may see the lesson start rendering at step 1 for an
 * instant before this swaps to the resume choice.
 */
export function LessonResumeGate({
  lesson,
  isGuest,
  initialCheckpoint,
  onComplete,
}: LessonResumeGateProps) {
  const [guestCheckpoint, setGuestCheckpoint] = useState<LessonCheckpointState | null>(null);
  const [choice, setChoice] = useState<"resume" | "restart" | null>(null);

  // One shared FIFO queue per lesson instance for every network call that
  // touches this signed-in learner's LessonCheckpoint row — both ordinary
  // saves (onCheckpoint, fired on every step advance) and the explicit
  // clear ("Start over" below) go through the SAME queue, not separate
  // ones, since they all race for the same row and must stay ordered
  // relative to EACH OTHER, not just among their own kind. See
  // lib/serialQueue.ts's own doc comment for the exact bug this closes —
  // a real, reproduced-under-load race where a stale save landed after a
  // newer save, or even after an explicit clear, silently regressing or
  // resurrecting the saved step.
  const checkpointQueueRef = useRef<ReturnType<typeof createSerialQueue> | null>(null);
  if (!checkpointQueueRef.current) checkpointQueueRef.current = createSerialQueue();

  useEffect(() => {
    if (isGuest) {
      setGuestCheckpoint(readGuestLessonCheckpoint(lesson.id, lesson.version));
    }
  }, [isGuest, lesson.id, lesson.version]);

  // Signed-in only (guests persist via guestProgress.ts's localStorage
  // path instead, unchanged) — a plain keepalive fetch to
  // app/api/lesson-checkpoint/route.ts, not a Server Action, specifically
  // so the request survives the learner navigating away mid-save (see
  // that route's own doc comment for why a Server Action can't do this).
  // Still routed through the shared queue below for correct ordering
  // among themselves and relative to onComplete's own checkpoint-clear.
  const serializedOnCheckpoint = isGuest
    ? undefined
    : (state: LessonCheckpointState) => {
        checkpointQueueRef.current!(() => saveLessonCheckpointRequest(lesson.id, lesson.version, state));
      };
  const serializedOnClearCheckpoint = isGuest
    ? undefined
    : () => {
        checkpointQueueRef.current!(() => clearLessonCheckpointRequest(lesson.id));
      };
  // completeLessonAction also deletes this same LessonCheckpoint row
  // server-side (finishing supersedes any in-progress save) — it MUST go
  // through the identical queue, not run independently of it, or the
  // very last step's still-in-flight checkpoint save can land after
  // completion's delete and resurrect a "finished" lesson's checkpoint
  // with stale data. LessonRunner already awaits this call directly (to
  // drive its own saving/error UI), so — unlike the two fire-and-forget
  // wrappers above — this one must return the queued promise, not just
  // enqueue and forget.
  const serializedOnComplete = onComplete
    ? (xpEarned: number, mistakes: number, hintsUsed: number, attempts: AttemptRecord[]) =>
        checkpointQueueRef.current!(() => Promise.resolve(onComplete(xpEarned, mistakes, hintsUsed, attempts)))
    : undefined;

  const checkpoint = isGuest ? guestCheckpoint : initialCheckpoint;
  const hasResumableProgress = !!checkpoint && checkpoint.stepIndex > 0;

  if (hasResumableProgress && choice === null) {
    return (
      <div className="mw-resume-gate" role="status" style={{ maxWidth: 600, margin: "var(--mw-space-7) auto" }}>
        <h2>Welcome back</h2>
        <p>
          You were on step {checkpoint!.stepIndex + 1} of {lesson.steps.length} in &ldquo;{lesson.title}&rdquo;.
        </p>
        <div style={{ display: "flex", gap: "var(--mw-space-3)", flexWrap: "wrap" }}>
          <Button onClick={() => setChoice("resume")}>Resume lesson</Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (isGuest) clearGuestLessonCheckpoint(lesson.id);
              else serializedOnClearCheckpoint?.();
              setChoice("restart");
            }}
          >
            Start over
          </Button>
        </div>
      </div>
    );
  }

  const effectiveInitialCheckpoint = choice === "restart" ? null : checkpoint;

  return (
    <LessonRunner
      lesson={lesson}
      isGuest={isGuest}
      onComplete={serializedOnComplete}
      initialCheckpoint={effectiveInitialCheckpoint}
      onCheckpoint={serializedOnCheckpoint}
    />
  );
}
