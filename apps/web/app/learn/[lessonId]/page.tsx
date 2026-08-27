import { notFound, redirect } from "next/navigation";
import { prisma } from "@movewise/db";
import { loadLesson } from "../../../lib/lessons";
import { loadUnitPrinciples, findPreviousPrinciple } from "../../../lib/principles";
import { PROFICIENT_STATUSES, type MasteryStatus } from "../../../lib/masteryModel";
import { LessonResumeGate } from "../../../components/LessonResumeGate";
import { LessonGate } from "../../../components/LessonGate";
import { completeLessonAction, saveLessonCheckpointAction, clearLessonCheckpointAction } from "../../actions";
import { getSession } from "../../../lib/auth";
import type { LessonCheckpointState } from "../../../components/LessonRunner";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const lesson = loadLesson(lessonId);
  if (!lesson) notFound();

  const user = await getSession();

  // Server-side prerequisite enforcement (not just a hidden/disabled link
  // in LearningPath.tsx) — a signed-in learner could otherwise open a
  // locked lesson directly by URL. Guests aren't tracked server-side (no
  // session), so this only applies once signed in; guest sequencing is
  // still enforced client-side via localStorage in LearningPath.tsx.
  if (user && lesson.prerequisites.length > 0) {
    const completed = await prisma.lessonCompletion.findMany({
      where: { userId: user.id, lessonId: { in: lesson.prerequisites } },
      select: { lessonId: true },
    });
    const completedIds = new Set(completed.map((c) => c.lessonId));
    const missingId = lesson.prerequisites.find((p) => !completedIds.has(p));
    if (missingId) {
      const missingLesson = loadLesson(missingId);
      const needs = encodeURIComponent(missingLesson?.title ?? missingId);
      redirect(`/?locked=${encodeURIComponent(lesson.title)}&needs=${needs}`);
    }
  }

  // ADR-0008's controlled unlocking: lesson completion alone must not
  // unlock the next principle. Only gate entry at a principle's *first*
  // sub-lesson — sequencing within a principle is already handled by the
  // prerequisites check above. Guests get no server-side gate here for
  // the same reason as the prerequisites check (no session to track
  // concept mastery against).
  if (user && lesson.principleId) {
    const principles = loadUnitPrinciples(lesson.unitId);
    const principle = principles.find((p) => p.id === lesson.principleId);
    if (principle && principle.subLessonIds[0] === lesson.id) {
      const previous = findPreviousPrinciple(principle);
      if (previous) {
        const mastery = await prisma.userConceptMastery.findUnique({
          where: { userId_conceptId: { userId: user.id, conceptId: previous.conceptId } },
        });
        const status = mastery?.status as MasteryStatus | undefined;
        if (!status || !PROFICIENT_STATUSES.has(status)) {
          redirect(
            `/?locked=${encodeURIComponent(lesson.title)}&needsProficiency=${encodeURIComponent(previous.title)}`,
          );
        }
      }
    }
  }

  // Real lesson resume: a signed-in learner's saved position is looked up
  // here (server-side, so the very first paint can already show the
  // "Welcome back" choice with no flash — see LessonResumeGate). A
  // checkpoint saved against an edited lesson (lessonVersion mismatch) is
  // discarded rather than resumed into step semantics that may have
  // changed since — deleted outright so it doesn't linger as a dangling row.
  let initialCheckpoint: LessonCheckpointState | null = null;
  if (user) {
    const checkpoint = await prisma.lessonCheckpoint.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
    });
    if (checkpoint) {
      if (checkpoint.lessonVersion === lesson.version) {
        initialCheckpoint = {
          stepIndex: checkpoint.stepIndex,
          mistakes: checkpoint.mistakes,
          hintsUsed: checkpoint.hintsUsed,
          attempts: checkpoint.attempts as unknown as LessonCheckpointState["attempts"],
        };
      } else {
        await prisma.lessonCheckpoint.deleteMany({ where: { userId: user.id, lessonId: lesson.id } });
      }
    }
  }

  const runner = (
    <LessonResumeGate
      lesson={lesson}
      isGuest={!user}
      initialCheckpoint={initialCheckpoint}
      onComplete={completeLessonAction.bind(null, lesson.id)}
      onCheckpoint={
        user ? saveLessonCheckpointAction.bind(null, lesson.id, lesson.version) : undefined
      }
      onClearCheckpoint={user ? clearLessonCheckpointAction.bind(null, lesson.id) : undefined}
    />
  );

  // A signed-in learner is already fully gated above (real
  // LessonCompletion rows, checked before this point). A guest has no
  // session for that check to run against — their progress lives only in
  // this browser's localStorage, unreadable from the server — so
  // LessonGate performs the equivalent check client-side, once, right
  // here, rather than ever rendering the runner for a guest unchecked.
  if (!user && lesson.prerequisites.length > 0) {
    const prerequisites = lesson.prerequisites.map((id) => ({ id, title: loadLesson(id)?.title ?? id }));
    return (
      <main>
        <LessonGate lessonId={lesson.id} lessonTitle={lesson.title} prerequisites={prerequisites}>
          {runner}
        </LessonGate>
      </main>
    );
  }

  return <main>{runner}</main>;
}
