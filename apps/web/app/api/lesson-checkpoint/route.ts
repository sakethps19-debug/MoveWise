import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { writeLessonCheckpoint, closeLessonCheckpoint } from "../../../lib/lessonCheckpointStore";

/**
 * P0 lesson-resume race fix: a signed-in learner's in-progress lesson
 * position was previously saved via a Next.js Server Action
 * (saveLessonCheckpointAction/clearLessonCheckpointAction) fired
 * fire-and-forget on every step advance. Real, reproduced-under-load bug
 * this replaces: a browser drops an in-flight fetch (Server Actions
 * included — they're just a fetch under the hood) the moment the page
 * navigates away, and nothing in the product ever waited for the *last*
 * step's save before letting the learner leave — closing the tab, typing
 * a new URL, or a test's own `page.goto()` right after the final click
 * all cancel that request mid-flight. A plain Route Handler lets the
 * client call `fetch(..., { keepalive: true })` instead, which Chromium
 * (and other modern browsers) keeps alive across page unload for a
 * small payload like this one — a Server Action's internal fetch call
 * isn't something this app can attach that flag to.
 *
 * A single POST handles both an ordinary save and a "close" (Start
 * over / superseded by completion) — see lib/lessonCheckpointStore.ts's
 * own doc comment for why closing is a revision-guarded write rather
 * than a DELETE. There is deliberately no DELETE method here anymore:
 * a hard delete has no revision to reject a late-arriving stale save
 * against, which is exactly the residual race a prior version of this
 * fix still hit under repeated stress testing.
 */

interface CheckpointBody {
  lessonId: string;
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
  const { lessonId, revision, closed } = body;
  if (typeof lessonId !== "string" || typeof revision !== "number") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (closed) {
    await closeLessonCheckpoint(user.id, lessonId, revision);
    return NextResponse.json({ ok: true });
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

  const result = await writeLessonCheckpoint(user.id, lessonId, revision, {
    lessonVersion,
    stepIndex,
    mistakes,
    hintsUsed,
    attempts,
  });
  return NextResponse.json({ ok: true, skipped: result === "stale" ? "stale" : undefined });
}
