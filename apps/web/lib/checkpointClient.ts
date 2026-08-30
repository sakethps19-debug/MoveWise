"use client";

import type { LessonCheckpointState } from "../components/LessonRunner";

/**
 * Client-side calls to app/api/lesson-checkpoint/route.ts — see that
 * route's own doc comment for why this is a plain `fetch` with
 * `keepalive: true` rather than a Server Action, and
 * lib/lessonCheckpointStore.ts for the epoch/revision state machine
 * `epoch`/`revision` implement. Both are monotonically increasing
 * counters the caller (components/LessonResumeGate.tsx) manages — epoch
 * bumped only when starting a genuinely new attempt, revision on every
 * call within one attempt.
 *
 * Returns "ok" only when the write actually applied. A network failure
 * (the fetch itself rejecting — offline, a dropped connection) resolves
 * "network-error", never throws — this is still best-effort by design
 * (a save surviving navigation via keepalive has no reliable way to
 * report success back to a page that's already gone), but a caller that
 * *is* still around (an ordinary same-tab save) can use this to tell the
 * learner their progress may not have saved, instead of failing silently.
 */
export type CheckpointRequestResult = "ok" | "stale-epoch" | "stale-revision" | "stale-collision" | "network-error";

export async function saveLessonCheckpointRequest(
  lessonId: string,
  lessonVersion: number,
  state: LessonCheckpointState,
  epoch: number,
  revision: number,
): Promise<CheckpointRequestResult> {
  try {
    const response = await fetch("/api/lesson-checkpoint", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, lessonVersion, epoch, revision, ...state }),
    });
    if (!response.ok) return "network-error";
    const body: { skipped?: string } = await response.json();
    return (body.skipped as CheckpointRequestResult | undefined) ?? "ok";
  } catch {
    return "network-error";
  }
}

export async function clearLessonCheckpointRequest(
  lessonId: string,
  epoch: number,
  revision: number,
): Promise<CheckpointRequestResult> {
  try {
    const response = await fetch("/api/lesson-checkpoint", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, epoch, revision, closed: true }),
    });
    if (!response.ok) return "network-error";
    const body: { skipped?: string } = await response.json();
    return (body.skipped as CheckpointRequestResult | undefined) ?? "ok";
  } catch {
    return "network-error";
  }
}
