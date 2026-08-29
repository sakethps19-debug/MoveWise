import { notFound } from "next/navigation";
import { findPrincipleById } from "../../../lib/principles";
import { loadPuzzlesForPrinciple } from "../../../lib/puzzles";
import { getSession } from "../../../lib/auth";
import { PuzzleRunner } from "../../../components/PuzzleRunner";
import { recordPuzzleAttemptAction } from "../../actions";

const WARM_UP_PRINCIPLE_ID = "meet-the-pieces.board-basics";

/**
 * A fixed, never-gated practice pool a brand-new learner (guest or
 * signed-in, zero lessons completed) can play immediately — P1's "an
 * immediately-playable Daily Warm-up before any lesson completion"
 * requirement. Reuses the real Board-basics puzzles (not fabricated
 * placeholder content) via the exact same PuzzleRunner/recordPuzzleAttemptAction
 * path `/practice/[principleId]` uses; the only difference from that
 * route is the missing prerequisite-lesson gate, deliberately, since this
 * exists specifically for learners who haven't cleared it yet. Once those
 * two lessons are actually completed, the same puzzles also appear as the
 * unlocked "Board basics" pool in PracticeHub — same content, same
 * recorded attempts, no duplication of data either way.
 */
export default async function WarmUpPracticePage() {
  const principle = findPrincipleById(WARM_UP_PRINCIPLE_ID);
  if (!principle) notFound();

  const user = await getSession();
  const puzzles = loadPuzzlesForPrinciple(principle);

  return (
    <main>
      <PuzzleRunner
        puzzles={puzzles}
        principleTitle="Daily warm-up"
        onAttempt={user ? recordPuzzleAttemptAction : undefined}
        isWarmUp
      />
    </main>
  );
}
