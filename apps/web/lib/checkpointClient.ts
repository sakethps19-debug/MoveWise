"use client";

import type { LessonCheckpointState } from "../components/LessonRunner";

/**
 * Client-side calls to app/api/lesson-checkpoint/route.ts — see that
 * route's own doc comment for why this is a plain `fetch` with
 * `keepalive: true` rather than a Server Action: a Server Action's
 * internal fetch can't be given that flag, so it gets silently canceled
 * the moment the page navigates away, which is exactly when a lesson's
 * last-step checkpoint save most needs to survive. `revision` is a
 * monotonically increasing counter the caller (components/LessonResumeGate.tsx)
 * bumps once per call — see lib/lessonCheckpointStore.ts for how the
 * server uses it to reject stale/out-of-order writes.
 */

export function saveLessonCheckpointRequest(
  lessonId: string,
  lessonVersion: number,
  state: LessonCheckpointState,
  revision: number,
): Promise<void> {
  return fetch("/api/lesson-checkpoint", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, lessonVersion, revision, ...state }),
  })
    .then(() => undefined)
    .catch(() => undefined); // best-effort — see persistCheckpoint's own doc comment in LessonRunner.tsx
}

export function clearLessonCheckpointRequest(lessonId: string, revision: number): Promise<void> {
  return fetch("/api/lesson-checkpoint", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, revision, closed: true }),
  })
    .then(() => undefined)
    .catch(() => undefined);
}
