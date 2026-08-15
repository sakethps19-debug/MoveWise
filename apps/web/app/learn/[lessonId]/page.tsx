import { notFound, redirect } from "next/navigation";
import { prisma } from "@movewise/db";
import { loadLesson } from "../../../lib/lessons";
import { loadUnitPrinciples, findPreviousPrinciple } from "../../../lib/principles";
import { PROFICIENT_STATUSES, type MasteryStatus } from "../../../lib/masteryModel";
import { LessonRunner } from "../../../components/LessonRunner";
import { completeLessonAction } from "../../actions";
import { getSession } from "../../../lib/auth";

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

  return (
    <main>
      <LessonRunner lesson={lesson} onComplete={completeLessonAction.bind(null, lesson.id)} isGuest={!user} />
    </main>
  );
}
