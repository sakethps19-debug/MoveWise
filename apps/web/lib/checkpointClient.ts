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
 *
 * Both calls race the fetch against `TIMEOUT_MS` — real, confirmed bug
 * this fixes: a `keepalive: true` fetch that gets aborted mid-flight (a
 * genuinely dropped connection, or — reproduced directly — a network
 * proxy/browser-level abort) does not reliably reject its Promise the
 * way an ordinary fetch does; it can simply never settle, neither
 * resolving nor rejecting. components/LessonResumeGate.tsx runs ordinary
 * per-step saves and the explicit "Start over" clear through one shared
 * serial queue with each other (so they stay ordered relative to one
 * another), so an unsettled call there would otherwise block every later
 * same-kind call behind it forever, with no way to ever report the
 * failure. (Lesson completion itself no longer waits on this queue at
 * all — see LessonResumeGate.tsx's own doc comment on `serializedOnComplete`
 * for why that wait was never load-bearing for correctness in the first
 * place, only added latency.) The race guarantees this function itself
 * always settles, so the queue can never stall on it.
 */
export type CheckpointRequestResult = "ok" | "stale-epoch" | "stale-revision" | "stale-collision" | "network-error";

/**
 * Generous relative to a real request's normal latency (tens to
 * low-hundreds of ms locally) — this no longer sits on lesson
 * completion's own critical path (see above), so there's no reason to
 * cut it close the way an earlier version of this constant did. Real,
 * confirmed bug that version caused: a legitimately slow but perfectly
 * healthy request (ordinary dev-server compile-on-demand latency, a
 * loaded CI runner, a slow mobile connection) got misreported as
 * "network-error" — a false "your progress may not be saving" banner for
 * a save that was, in fact, saving. This value only needs to be well
 * short of "the learner has given up and left the page", not short of
 * any other UI's own timing budget.
 */
const TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function saveLessonCheckpointRequest(
  lessonId: string,
  lessonVersion: number,
  state: LessonCheckpointState,
  epoch: number,
  revision: number,
): Promise<CheckpointRequestResult> {
  return withTimeout(
    (async () => {
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
    })(),
    "network-error",
  );
}

export async function clearLessonCheckpointRequest(
  lessonId: string,
  epoch: number,
  revision: number,
): Promise<CheckpointRequestResult> {
  return withTimeout(
    (async () => {
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
    })(),
    "network-error",
  );
}
