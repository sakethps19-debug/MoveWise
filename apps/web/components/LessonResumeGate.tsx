"use client";

import { useEffect, useState } from "react";
import type { Lesson } from "@movewise/exercise-schema";
import { LessonRunner, type AttemptRecord, type LessonCheckpointState } from "./LessonRunner";
import { Button } from "./ui/Button";
import { readGuestLessonCheckpoint, clearGuestLessonCheckpoint } from "../lib/guestProgress";

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
  onCheckpoint?: (state: LessonCheckpointState) => void;
  onClearCheckpoint?: () => void;
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
  onCheckpoint,
  onClearCheckpoint,
}: LessonResumeGateProps) {
  const [guestCheckpoint, setGuestCheckpoint] = useState<LessonCheckpointState | null>(null);
  const [choice, setChoice] = useState<"resume" | "restart" | null>(null);

  useEffect(() => {
    if (isGuest) {
      setGuestCheckpoint(readGuestLessonCheckpoint(lesson.id, lesson.version));
    }
  }, [isGuest, lesson.id, lesson.version]);

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
              else onClearCheckpoint?.();
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
      onComplete={onComplete}
      initialCheckpoint={effectiveInitialCheckpoint}
      onCheckpoint={onCheckpoint}
    />
  );
}
