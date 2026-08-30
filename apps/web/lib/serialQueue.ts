/**
 * A strict FIFO queue for fire-and-forget async calls that all touch the
 * same server-side resource — real bug this exists to fix:
 * LessonRunner.tsx fires a checkpoint-save (or, on "Start over", a
 * checkpoint-clear) without awaiting the previous call, so a fast
 * learner — or an automated test, or just a page navigation right after
 * the last click — can have two or three of these calls in flight
 * against the same LessonCheckpoint row at once. Nothing about a
 * network request or a client-side route change guarantees they resolve
 * in the order they were *sent*: under real contention (a slow
 * connection, a busy server, unlucky scheduling) a later click's save
 * can complete before an earlier one, and the earlier, stale write
 * landing last silently regresses the saved step — or, worse, recreates
 * a row an explicit "Start over" had just cleared.
 *
 * `enqueue` guarantees each task only *starts* once every task enqueued
 * before it has fully settled, so calls reach the server in the same
 * order the user actually triggered them — the race is closed at its
 * root (ordering), not patched at one specific symptom.
 */
export function createSerialQueue(): (task: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (task: () => Promise<void>) => {
    const settled = tail.then(task);
    // Never let one failed task poison the queue for tasks enqueued
    // after it — each caller still gets its own rejection if it awaits
    // the returned promise, but the *queue's* internal tail always moves
    // forward.
    tail = settled.catch(() => {});
    return settled;
  };
}
