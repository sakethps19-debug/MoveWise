/**
 * Test-only DB helper, shared across several e2e specs (originally
 * written for cross-unit-progression.spec.ts, now also used by
 * puzzle-practice.spec.ts and remediation.spec.ts). Importing
 * `@movewise/db` directly from a `.spec.ts` file fails under Playwright's
 * own test transform ("Cannot use 'import.meta' outside a module" —
 * Prisma 7's generated client is ESM, and Playwright's transform doesn't
 * interop with it the way Next.js's webpack build does). Plain `node`
 * (run from apps/web, so workspace resolution works) imports it fine —
 * confirmed directly — so this script exists purely to sidestep
 * Playwright's transform, not to work around a real product bug. Never
 * imported by application code.
 */
import { prisma } from "@movewise/db";
import bcrypt from "bcryptjs";

const [, , command, argJson] = process.argv;
const args = argJson ? JSON.parse(argJson) : {};

async function main() {
  switch (command) {
    case "get-user-id": {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: args.email } });
      process.stdout.write(user.id);
      break;
    }
    case "create-user": {
      // Creates a real account directly (bcrypt-hashed, same as
      // hashPassword in lib/auth.ts — duplicated here rather than
      // imported since lib/auth.ts pulls in "server-only"/"next/headers"
      // and can't be imported outside the Next.js runtime). Used to log
      // a test straight into an account via the /login form instead of
      // /signup, so tests that only need a signed-in session (not the
      // signup flow itself) don't spend from signupAction's own
      // rate-limit budget (SIGNUP_LIMIT = 20/hour per IP,
      // lib/rate-limit.ts) — a real, shared-with-every-other-spec
      // constraint, not a synthetic test-only concern.
      const passwordHash = await bcrypt.hash(args.password, 10);
      const user = await prisma.user.create({ data: { email: args.email, passwordHash } });
      process.stdout.write(user.id);
      break;
    }
    case "set-mastery": {
      await prisma.userConceptMastery.upsert({
        where: { userId_conceptId: { userId: args.userId, conceptId: args.conceptId } },
        update: { status: args.status },
        create: { userId: args.userId, conceptId: args.conceptId, status: args.status },
      });
      break;
    }
    case "seed-completions": {
      await prisma.lessonCompletion.createMany({
        data: args.lessonIds.map((lessonId) => ({
          userId: args.userId,
          lessonId,
          xpEarned: 20,
          mistakes: 0,
          hintsUsed: 0,
        })),
      });
      break;
    }
    case "count-completions": {
      const count = await prisma.lessonCompletion.count({
        where: { userId: args.userId, lessonId: args.lessonId },
      });
      process.stdout.write(String(count));
      break;
    }
    case "get-lesson-checkpoint": {
      const checkpoint = await prisma.lessonCheckpoint.findUnique({
        where: { userId_lessonId: { userId: args.userId, lessonId: args.lessonId } },
      });
      process.stdout.write(checkpoint ? JSON.stringify(checkpoint) : "");
      break;
    }
    case "set-lesson-checkpoint": {
      // Test-only direct seeding of a LessonCheckpoint row — used to set
      // up a state (e.g. a stale lessonVersion) that isn't reachable
      // through the app's own UI in one step, without going through the
      // revision-guarded write path itself (lib/lessonCheckpointStore.ts).
      await prisma.lessonCheckpoint.upsert({
        where: { userId_lessonId: { userId: args.userId, lessonId: args.lessonId } },
        update: {
          lessonVersion: args.lessonVersion,
          stepIndex: args.stepIndex,
          epoch: args.epoch ?? 0,
          revision: args.revision ?? 0,
          mistakes: 0,
          hintsUsed: 0,
          attempts: [],
        },
        create: {
          userId: args.userId,
          lessonId: args.lessonId,
          lessonVersion: args.lessonVersion,
          stepIndex: args.stepIndex,
          epoch: args.epoch ?? 0,
          revision: args.revision ?? 0,
          mistakes: 0,
          hintsUsed: 0,
          attempts: [],
        },
      });
      break;
    }
    case "count-games": {
      const count = await prisma.game.count({ where: { userId: args.userId } });
      process.stdout.write(String(count));
      break;
    }
    case "get-latest-game-id": {
      const game = await prisma.game.findFirst({ where: { userId: args.userId }, orderBy: { playedAt: "desc" } });
      process.stdout.write(game?.id ?? "");
      break;
    }
    case "count-move-analysis": {
      const count = await prisma.moveAnalysis.count({ where: { gameAnalysis: { gameId: args.gameId } } });
      process.stdout.write(String(count));
      break;
    }
    case "count-game-analysis": {
      const count = await prisma.gameAnalysis.count({ where: { gameId: args.gameId } });
      process.stdout.write(String(count));
      break;
    }
    case "expire-session": {
      // Backdates every real Session row for this user so getSession()'s
      // own `session.expiresAt < new Date()` check fires for real — not
      // a fake/tampered cookie, the actual DB-backed expiry path.
      const result = await prisma.session.updateMany({
        where: { userId: args.userId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      process.stdout.write(String(result.count));
      break;
    }
    case "count-rate-limit-hits": {
      const count = await prisma.rateLimitHit.count({ where: { key: args.key } });
      process.stdout.write(String(count));
      break;
    }
    case "get-user-concept-mastery": {
      const mastery = await prisma.userConceptMastery.findUnique({
        where: { userId_conceptId: { userId: args.userId, conceptId: args.conceptId } },
      });
      process.stdout.write(mastery ? JSON.stringify(mastery) : "");
      break;
    }
    case "set-concept-evidence": {
      // Test-only seeding of the evidenceLevel provenance axis
      // (lib/placementEvidence.ts) without running the whole placement
      // flow — mimics a real placement result that unlocked a pool via
      // BYPASS_EVIDENCE_LEVELS, so confirmation-flow tests can assert
      // against a genuinely-already-unlocked pool.
      await prisma.userConceptMastery.upsert({
        where: { userId_conceptId: { userId: args.userId, conceptId: args.conceptId } },
        update: { evidenceLevel: args.evidenceLevel, evidenceSource: args.evidenceSource ?? "test-seed" },
        create: {
          userId: args.userId,
          conceptId: args.conceptId,
          status: "not-started",
          evidenceLevel: args.evidenceLevel,
          evidenceSource: args.evidenceSource ?? "test-seed",
        },
      });
      break;
    }
    case "count-exercise-attempts-for-concept": {
      const count = await prisma.exerciseAttempt.count({
        where: { userId: args.userId, conceptIds: { has: args.conceptId } },
      });
      process.stdout.write(String(count));
      break;
    }
    case "list-exercise-attempts-for-concept": {
      const attempts = await prisma.exerciseAttempt.findMany({
        where: { userId: args.userId, conceptIds: { has: args.conceptId } },
        orderBy: { createdAt: "asc" },
        select: { correct: true, hintLevelUsed: true, lessonId: true, puzzleId: true, gameId: true, createdAt: true },
      });
      process.stdout.write(JSON.stringify(attempts));
      break;
    }
    case "count-progress": {
      const [completions, mastery, attempts] = await Promise.all([
        prisma.lessonCompletion.count({ where: { userId: args.userId } }),
        prisma.userConceptMastery.count({ where: { userId: args.userId } }),
        prisma.exerciseAttempt.count({ where: { userId: args.userId } }),
      ]);
      process.stdout.write(JSON.stringify({ completions, mastery, attempts }));
      break;
    }
    case "seed-game-mistake": {
      // Test-only equivalent of what app/actions.ts's
      // recordGameMistakesAndUpdateMastery actually writes for a detected
      // game mistake (a real Game row plus one gameId-tagged, always-
      // correct:false ExerciseAttempt per mistake) — used instead of
      // driving a whole live Stockfish game + analysis pass, which can't
      // deterministically produce a chosen conceptId. Same shape, same
      // columns, just skipping the nondeterministic engine step; the shape
      // itself (gameId set, correct: false, conceptIds denormalized onto
      // the row) is exactly what recomputeMasteryForConcepts reads.
      const game = await prisma.game.create({
        data: {
          userId: args.userId,
          source: "stockfish",
          pgn: "1. e4 e5",
          playerColor: "w",
          result: "loss",
          endReason: "checkmate",
        },
      });
      await prisma.exerciseAttempt.createMany({
        data: Array.from({ length: args.count ?? 1 }, (_, i) => ({
          userId: args.userId,
          gameId: game.id,
          stepId: `${game.id}-ply-${i}`,
          conceptIds: [args.conceptId],
          correct: false,
        })),
      });
      process.stdout.write(game.id);
      break;
    }
    case "recompute-mastery": {
      // Drives the exact same pure functions app/actions.ts's
      // recomputeMasteryForConcepts uses (computeMasteryStatus,
      // computeReviewSchedule — both plain lib/ functions with no
      // "use server"/"server-only" imports, safe to import here) over
      // whatever ExerciseAttempt rows already exist for this concept —
      // used after seed-game-mistake (above) to reach the same
      // UserConceptMastery state a real completed analysis would have
      // produced, without duplicating app/actions.ts's own db-write logic
      // by hand in this test-only script.
      const { computeMasteryStatus } = await import("../lib/masteryModel.ts");
      const { computeReviewSchedule } = await import("../lib/practiceScheduler.ts");
      const existingMastery = await prisma.userConceptMastery.findUnique({
        where: { userId_conceptId: { userId: args.userId, conceptId: args.conceptId } },
      });
      const history = await prisma.exerciseAttempt.findMany({
        where: { userId: args.userId, conceptIds: { has: args.conceptId } },
        orderBy: { createdAt: "asc" },
        select: { correct: true, puzzleId: true, gameId: true, createdAt: true, hintLevelUsed: true },
      });
      const { status, exerciseConfidence } = computeMasteryStatus(
        existingMastery?.status ?? null,
        history.map((a) => ({
          correct: a.correct,
          source: a.puzzleId ? "puzzle" : a.gameId ? "game" : "lesson",
          hintLevelUsed: a.hintLevelUsed,
        })),
      );
      const { nextDueAt } = computeReviewSchedule(history.map((a) => ({ correct: a.correct, at: a.createdAt })));
      await prisma.userConceptMastery.upsert({
        where: { userId_conceptId: { userId: args.userId, conceptId: args.conceptId } },
        update: { status, exerciseConfidence, lastPracticedAt: new Date(), nextRevisionDueAt: nextDueAt },
        create: { userId: args.userId, conceptId: args.conceptId, status, exerciseConfidence, lastPracticedAt: new Date(), nextRevisionDueAt: nextDueAt },
      });
      process.stdout.write(JSON.stringify({ status, exerciseConfidence, nextDueAt }));
      break;
    }
    case "seed-placement-attempt": {
      // Test-only direct seeding of a PlacementAttempt row — the "pending
      // confirmation" state (a concept at inferred_high_confidence that
      // hasn't been confirmed or contradicted yet) genuinely can only be
      // reached, for a real signed-in user, by taking the actual placement
      // assessment (see e2e/placement-confirmation.spec.ts's "a real
      // placement run..." test, which does exactly that at real UI cost).
      // This shortcut exists for tests that only need that end state, not
      // the placement UI walkthrough itself — same "state not reachable
      // through the app's own UI in one step" reasoning as
      // set-lesson-checkpoint above. Deliberately does NOT also touch
      // UserConceptMastery — a real placement's own status:"proficient"
      // write (app/actions.ts's submitPlacementAction) only happens for
      // concepts in BYPASS_EVIDENCE_LEVELS, which callers seeding a
      // *different* concept's mastery state (or none at all) should do
      // themselves via set-mastery/set-concept-evidence if they need it.
      await prisma.placementAttempt.create({
        data: {
          userId: args.userId,
          assessmentVersion: 1,
          startedAt: new Date(),
          itemResponses: [],
          conceptEvidence: [{ conceptId: args.conceptId, level: args.level ?? "inferred_high_confidence", source: "test-seed" }],
          confidence: args.confidence ?? 0.6,
          tierResult: args.tierResult ?? "intermediate",
        },
      });
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
