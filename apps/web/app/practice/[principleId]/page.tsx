import { notFound, redirect } from "next/navigation";
import { prisma } from "@movewise/db";
import { findPrincipleById } from "../../../lib/principles";
import { loadPuzzlesForPrinciple } from "../../../lib/puzzles";
import { getSession } from "../../../lib/auth";
import { PROFICIENT_STATUSES, type MasteryStatus } from "../../../lib/masteryModel";
import { BYPASS_EVIDENCE_LEVELS, type ConceptEvidenceLevel } from "../../../lib/placementEvidence";
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
    const [completed, mastery] = await Promise.all([
      prisma.lessonCompletion.findMany({
        where: { userId: user.id, lessonId: { in: principle.subLessonIds } },
        select: { lessonId: true },
      }),
      prisma.userConceptMastery.findUnique({
        where: { userId_conceptId: { userId: user.id, conceptId: principle.conceptId } },
      }),
    ]);
    const completedIds = new Set(completed.map((c) => c.lessonId));
    const missing = principle.subLessonIds.some((id) => !completedIds.has(id));
    // A concept already proficient (placement, or ordinary practice) bypasses
    // the sub-lesson requirement, mirroring lib/lessonStatus.ts's
    // demonstratedConceptIds bypass — never falsely marks the lessons
    // "completed", just recognizes real evidence the pool's own gate would
    // otherwise ignore. This is the exact PracticeHub.tsx "brutal user
    // journey" bug, fixed at the server route too.
    //
    // Two independent axes both count: `status` (ordinary accuracy-driven
    // mastery, lib/masteryModel.ts) AND `evidenceLevel` (placement or a
    // passed confirmation, lib/placementEvidence.ts). Checking `status`
    // alone reproduced the exact bug this comment describes one level up —
    // PracticeHub.tsx's own unlock check (useDemonstratedConcepts) already
    // trusts BYPASS_EVIDENCE_LEVELS, so it would show this pool as
    // unlocked and link straight to this route; without this check, a
    // learner unlocked purely by placement (no `status` row yet) would
    // click that link and land right back on the locked redirect below.
    const demonstratedStatus = mastery?.status as MasteryStatus | undefined;
    const demonstratedByStatus = !!demonstratedStatus && PROFICIENT_STATUSES.has(demonstratedStatus);
    const demonstratedByEvidence =
      !!mastery?.evidenceLevel && BYPASS_EVIDENCE_LEVELS.has(mastery.evidenceLevel as ConceptEvidenceLevel);
    const demonstrated = demonstratedByStatus || demonstratedByEvidence;
    if (missing && !demonstrated) {
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
