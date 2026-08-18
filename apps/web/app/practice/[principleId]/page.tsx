import { notFound, redirect } from "next/navigation";
import { prisma } from "@movewise/db";
import { findPrincipleById } from "../../../lib/principles";
import { loadPuzzlesForPrinciple } from "../../../lib/puzzles";
import { getSession } from "../../../lib/auth";
import { PuzzleRunner } from "../../../components/PuzzleRunner";
import { recordPuzzleAttemptAction } from "../../actions";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ principleId: string }>;
}) {
  const { principleId } = await params;
  const principle = findPrincipleById(principleId);
  if (!principle) notFound();
  if (principle.puzzleIds.length === 0) notFound(); // no puzzle pool authored for this principle yet

  const user = await getSession();

  // Server-side gating, mirroring app/learn/[lessonId]/page.tsx: puzzle
  // practice is meant to come after a principle's sub-lessons (per
  // docs/learner-model.md's `practising` state definition), so a
  // signed-in learner who hasn't finished them yet gets redirected
  // rather than shown an empty-feeling practice pool. Guests aren't
  // tracked server-side (no session) — same "no data to check" reasoning
  // as the lesson route guard, guest sequencing is enforced client-side
  // in LearningPath.tsx instead.
  if (user) {
    const completed = await prisma.lessonCompletion.findMany({
      where: { userId: user.id, lessonId: { in: principle.subLessonIds } },
      select: { lessonId: true },
    });
    const completedIds = new Set(completed.map((c) => c.lessonId));
    const missing = principle.subLessonIds.some((id) => !completedIds.has(id));
    if (missing) {
      redirect(`/?locked=${encodeURIComponent(`${principle.title} practice`)}&needs=${encodeURIComponent(principle.title)}`);
    }
  }

  const puzzles = loadPuzzlesForPrinciple(principle);

  return (
    <main>
      <PuzzleRunner
        puzzles={puzzles}
        principleTitle={principle.title}
        onAttempt={user ? recordPuzzleAttemptAction : undefined}
      />
    </main>
  );
}
