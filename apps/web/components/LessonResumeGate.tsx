"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@movewise/exercise-schema";
import { LessonRunner, type AttemptRecord, type LessonCheckpointState } from "./LessonRunner";
import { Button } from "./ui/Button";
import { readGuestLessonCheckpoint, clearGuestLessonCheckpoint } from "../lib/guestProgress";
import { createSerialQueue } from "../lib/serialQueue";
import {
  saveLessonCheckpointRequest,
  clearLessonCheckpointRequest,
  type CheckpointRequestResult,
} from "../lib/checkpointClient";

interface LessonResumeGateProps {
  lesson: Lesson;
  isGuest: boolean;
  /** Signed-in only — read server-side in app/learn/[lessonId]/page.tsx, already version-checked. Always null for guests. */
  initialCheckpoint: LessonCheckpointState | null;
  /** The server's current stored epoch/revision for this (user, lesson) checkpoint row, 0 if none exists — see lib/lessonCheckpointStore.ts's state machine. Always 0 for guests. */
  initialEpoch: number;
  initialRevision: number;
  onComplete?: (
    xpEarned: number,
    mistakes: number,
    hintsUsed: number,
    attempts: AttemptRecord[],
    epoch: number,
    revision: number,
  ) => void | Promise<void>;
}

const SYNC_ISSUE_MESSAGE: Partial<Record<CheckpointRequestResult, string>> = {
  "stale-epoch": "This lesson was restarted in another tab — your progress here wasn't saved.",
  "stale-revision": "Another tab already saved more recent progress on this lesson — this update wasn't saved.",
  "stale-collision": "Another tab saved at the same moment — this update may not have been the one that was saved.",
  "network-error": "Your progress may not be saving — check your connection.",
};

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
  initialEpoch,
  initialRevision,
  onComplete,
}: LessonResumeGateProps) {
  const [guestCheckpoint, setGuestCheckpoint] = useState<LessonCheckpointState | null>(null);
  const [choice, setChoice] = useState<"resume" | "restart" | null>(null);
  const [syncIssue, setSyncIssue] = useState<string | null>(null);

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
  const checkpointQueueRef = useRef<ReturnType<typeof createSerialQueue<CheckpointRequestResult>> | null>(null);
  if (!checkpointQueueRef.current) checkpointQueueRef.current = createSerialQueue<CheckpointRequestResult>();

  const checkpoint = isGuest ? guestCheckpoint : initialCheckpoint;

  // Which attempt this mount belongs to (lib/lessonCheckpointStore.ts's
  // state machine): a checkpoint that reads as null here — never
  // attempted, or a previously *closed* row (completed, or restarted and
  // then abandoned) already filtered out server-side — means this render
  // is starting a genuinely new attempt, one epoch ahead of whatever the
  // server has stored. An explicit "Start over" click bumps epochRef the
  // same way, below. Every ordinary step-advance in between keeps the
  // same epoch and only bumps revision.
  const isFreshStart = checkpoint === null;
  const epochRef = useRef(isFreshStart ? initialEpoch + 1 : initialEpoch);
  const revisionRef = useRef(isFreshStart ? 0 : initialRevision);
  const nextRevision = () => ++revisionRef.current;

  function reportResult(result: CheckpointRequestResult): CheckpointRequestResult {
    setSyncIssue(result === "ok" ? null : (SYNC_ISSUE_MESSAGE[result] ?? null));
    return result;
  }

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
        const revision = nextRevision();
        const epoch = epochRef.current;
        checkpointQueueRef.current!(async () =>
          reportResult(await saveLessonCheckpointRequest(lesson.id, lesson.version, state, epoch, revision)),
        );
      };
  const serializedOnClearCheckpoint = isGuest
    ? undefined
    : () => {
        const revision = nextRevision();
        const epoch = epochRef.current;
        checkpointQueueRef.current!(async () => reportResult(await clearLessonCheckpointRequest(lesson.id, epoch, revision)));
      };
  // completeLessonAction also closes this same LessonCheckpoint row
  // server-side (finishing supersedes any in-progress save) — it MUST go
  // through the identical queue, not run independently of it, or the
  // very last step's still-in-flight checkpoint save can land after
  // completion's close and resurrect a "finished" lesson's checkpoint
  // with stale data. Both requests also carry this attempt's own
  // epoch/revision, so even if the queue's send-order guarantee is
  // defeated by network-level reordering, the server's state machine is
  // the one that actually decides which write wins. LessonRunner already
  // awaits this call directly (to drive its own saving/error UI), so —
  // unlike the two fire-and-forget wrappers above — this one must return
  // the queued promise, not just enqueue and forget.
  const serializedOnComplete = onComplete
    ? async (xpEarned: number, mistakes: number, hintsUsed: number, attempts: AttemptRecord[]): Promise<void> => {
        const revision = nextRevision();
        const epoch = epochRef.current;
        await checkpointQueueRef.current!(async () => {
          await onComplete(xpEarned, mistakes, hintsUsed, attempts, epoch, revision);
          return "ok" as const;
        });
      }
    : undefined;

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
              else {
                // A genuinely new attempt begins now — one epoch ahead of
                // whatever this mount had been using, so any of the
                // outgoing attempt's writes still in flight (or a second
                // tab still open on the old attempt) can never land after
                // this and resurrect it.
                epochRef.current += 1;
                revisionRef.current = 0;
                serializedOnClearCheckpoint?.();
              }
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
    <div>
      {syncIssue && (
        <p role="alert" className="mw-feedback mw-feedback--error" style={{ marginBottom: "var(--mw-space-3)" }}>
          {syncIssue}
        </p>
      )}
      <LessonRunner
        lesson={lesson}
        isGuest={isGuest}
        onComplete={serializedOnComplete}
        initialCheckpoint={effectiveInitialCheckpoint}
        onCheckpoint={serializedOnCheckpoint}
      />
    </div>
  );
}
