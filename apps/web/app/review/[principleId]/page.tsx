import { notFound, redirect } from "next/navigation";
import { prisma } from "@movewise/db";
import type { ExplainStep } from "@movewise/exercise-schema";
import { findPrincipleById } from "../../../lib/principles";
import { loadLesson } from "../../../lib/lessons";
import { loadPuzzlesForPrinciple } from "../../../lib/puzzles";
import { getSession } from "../../../lib/auth";
import { RemediationRunner } from "../../../components/RemediationRunner";
import { recordPuzzleAttemptAction } from "../../actions";

/** docs/learner-model.md's remediation flow: "a shortened reteach... not the whole sub-lesson replayed" — capped, not the full explain-step count across every sub-lesson. */
const MAX_RETEACH_STEPS = 2;
/** "Serve 2-3 easier Puzzles... before returning to the mastery-challenge difficulty." */
const MAX_REMEDIATION_PUZZLES = 3;
const EASY_PUZZLE_DIFFICULTY = 1;

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ principleId: string }>;
}) {
  const { principleId } = await params;
  const principle = findPrincipleById(principleId);
  if (!principle) notFound();

  // Remediation is meaningless without a session — "struggling" is a
  // server-tracked UserConceptMastery state a guest never has (same
  // reasoning as every other conceptMastery-gated check in this app).
  const user = await getSession();
  if (!user) redirect("/");

  const mastery = await prisma.userConceptMastery.findUnique({
    where: { userId_conceptId: { userId: user.id, conceptId: principle.conceptId } },
  });
  // Gates on having *any* evidence for this concept — not specifically
  // "struggling". Recording a puzzle attempt is a Server Action, and
  // Next.js refreshes the current route's Server Components after one
  // resolves; a learner doing well in the easier-puzzle round can
  // legitimately progress struggling -> recovered -> proficient within
  // the same round (especially with little prior attempt history to
  // average against), and gating strictly on "struggling" bounced them
  // back to "/" mid-round the moment their status improved — confirmed
  // live via Playwright before this fix, not assumed from reading the
  // code. Enumerating every reachable successor status is exactly the
  // kind of whack-a-mole that bug came from; instead this treats
  // /review the same way /practice/[principleId] already treats its own
  // pool — "reachable once relevant, repeatable afterward, not a
  // one-shot gate" — since extra reteach-and-practice for a concept
  // already engaged with is harmless even once no longer struggling.
  // Only a principle with *zero* evidence at all (never attempted)
  // still redirects, since there'd be nothing to remediate.
  if (!mastery) redirect("/");

  const reteachSteps: ExplainStep[] = [];
  outer: for (const lessonId of principle.subLessonIds) {
    const lesson = loadLesson(lessonId);
    if (!lesson) continue;
    for (const step of lesson.steps) {
      if (step.type !== "explain") continue;
      reteachSteps.push(step);
      if (reteachSteps.length >= MAX_RETEACH_STEPS) break outer;
    }
  }

  const allPuzzles = loadPuzzlesForPrinciple(principle);
  // Prefer the pool's easiest puzzles; not every unit has difficulty-1
  // puzzles yet (check-and-checkmate/basic-tactics are all difficulty 2
  // today — see docs/known-risks.md), so fall back to whatever exists
  // rather than leaving remediation with nothing to serve.
  const easyPuzzles = allPuzzles.filter((p) => p.difficulty === EASY_PUZZLE_DIFFICULTY);
  const puzzles = (easyPuzzles.length > 0 ? easyPuzzles : allPuzzles).slice(0, MAX_REMEDIATION_PUZZLES);

  return (
    <main>
      <RemediationRunner
        reteachSteps={reteachSteps}
        puzzles={puzzles}
        principleTitle={principle.title}
        retryHref={`/learn/${principle.subLessonIds[0]}`}
        onAttempt={recordPuzzleAttemptAction}
      />
    </main>
  );
}
