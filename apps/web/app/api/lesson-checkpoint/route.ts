import { NextResponse } from "next/server";
import { prisma, Prisma } from "@movewise/db";
import { getSession } from "../../../lib/auth";

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
 * isn't something this app can attach that flag to. `stepIndex`/attempt-
 * count staleness guards below are kept as defense in depth against the
 * remaining, much narrower race (two saves genuinely in flight at once
 * arriving out of order), on top of the client-side request queue in
 * components/LessonResumeGate.tsx.
 */

interface CheckpointBody {
  lessonId: string;
  lessonVersion: number;
  stepIndex: number;
  mistakes: number;
  hintsUsed: number;
  attempts: unknown[];
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
  const { lessonId, lessonVersion, stepIndex, mistakes, hintsUsed, attempts } = body;
  if (typeof lessonId !== "string" || typeof stepIndex !== "number" || !Array.isArray(attempts)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const attemptsJson = attempts as unknown as Prisma.InputJsonValue;
  const existing = await prisma.lessonCheckpoint.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    select: { stepIndex: true, attempts: true },
  });
  if (existing) {
    const existingAttemptCount = Array.isArray(existing.attempts) ? existing.attempts.length : 0;
    const stale = existing.stepIndex > stepIndex || (existing.stepIndex === stepIndex && existingAttemptCount > attempts.length);
    if (stale) return NextResponse.json({ ok: true, skipped: "stale" });
  }

  await prisma.lessonCheckpoint.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    update: { lessonVersion, stepIndex, mistakes, hintsUsed, attempts: attemptsJson },
    create: { userId: user.id, lessonId, lessonVersion, stepIndex, mistakes, hintsUsed, attempts: attemptsJson },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const lessonId = new URL(request.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "missing lessonId" }, { status: 400 });

  await prisma.lessonCheckpoint.deleteMany({ where: { userId: user.id, lessonId } });
  return NextResponse.json({ ok: true });
}
