import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { writeLessonCheckpoint, LESSON_CHECKPOINT_CLOSED_STEP } from "../../../lib/lessonCheckpointStore";

/**
 * P0 lesson-resume race fix: a signed-in learner's in-progress lesson
 * position was previously saved via a Next.js Server Action, fired
 * fire-and-forget on every step advance. Real, reproduced-under-load bug
 * this replaces: a browser drops an in-flight fetch (Server Actions
 * included — they're just a fetch under the hood) the moment the page
 * navigates away, and nothing in the product ever waited for the *last*
 * step's save before letting the learner leave. A plain Route Handler
 * lets the client call `fetch(..., { keepalive: true })` instead, which
 * Chromium (and other modern browsers) keeps alive across page unload for
 * a small payload like this one.
 *
 * A single POST handles both an ordinary save and a "close" (Start over,
 * or superseded by completion) — see lib/lessonCheckpointStore.ts's own
 * doc comment for the full epoch/revision state machine this enforces.
 * There is deliberately no DELETE method here anymore: a hard delete has
 * nothing to compare a late-arriving stale write against. `skipped` (when
 * present) tells the client exactly why a write didn't apply
 * (stale-epoch/stale-revision/stale-collision) so it can decide whether
 * the learner needs to be told their progress may not have saved here
 * (checkpointClient.ts).
 */

interface CheckpointBody {
  lessonId: string;
  epoch: number;
  revision: number;
  closed?: boolean;
  lessonVersion?: number;
  stepIndex?: number;
  mistakes?: number;
  hintsUsed?: number;
  attempts?: unknown[];
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: CheckpointBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { lessonId, epoch, revision, closed } = body;
  if (typeof lessonId !== "string" || typeof epoch !== "number" || typeof revision !== "number") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (closed) {
    const result = await writeLessonCheckpoint(user.id, lessonId, epoch, revision, {
      lessonVersion: 0,
      stepIndex: LESSON_CHECKPOINT_CLOSED_STEP,
      mistakes: 0,
      hintsUsed: 0,
      attempts: [],
    });
    return NextResponse.json({ ok: true, skipped: result === "applied" ? undefined : result });
  }

  const { lessonVersion, stepIndex, mistakes, hintsUsed, attempts } = body;
  if (
    typeof lessonVersion !== "number" ||
    typeof stepIndex !== "number" ||
    typeof mistakes !== "number" ||
    typeof hintsUsed !== "number" ||
    !Array.isArray(attempts)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await writeLessonCheckpoint(user.id, lessonId, epoch, revision, {
    lessonVersion,
    stepIndex,
    mistakes,
    hintsUsed,
    attempts,
  });
  return NextResponse.json({ ok: true, skipped: result === "applied" ? undefined : result });
}
