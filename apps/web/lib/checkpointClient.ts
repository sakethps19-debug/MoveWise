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
 * resolving nor rejecting. Since components/LessonResumeGate.tsx runs
 * every one of these calls through one shared serial queue (so ordering
 * against other checkpoint saves and the lesson-completion call itself
 * is guaranteed), a single unsettled call doesn't just leave its own
 * caller stuck — it permanently blocks every later call already queued
 * behind it, including the lesson-completion write, leaving the learner
 * looking at "Saving your progress…" forever with no way to reach the
 * retryable error screen. The race guarantees this function itself
 * always settles, so the queue can never stall on it.
 */
export type CheckpointRequestResult = "ok" | "stale-epoch" | "stale-revision" | "stale-collision" | "network-error";

/** Generous relative to a real request's normal latency (tens to low-hundreds of ms locally), but bounded well under the completion flow's own error-screen assertion budget (e2e/network-resilience.spec.ts) — an unsettled call sitting ahead of the completion call in the shared queue must clear in time for that call's own round trip to still finish and render within the same window. */
const TIMEOUT_MS = 2500;

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
