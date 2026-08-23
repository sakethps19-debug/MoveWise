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
    case "count-progress": {
      const [completions, mastery, attempts] = await Promise.all([
        prisma.lessonCompletion.count({ where: { userId: args.userId } }),
        prisma.userConceptMastery.count({ where: { userId: args.userId } }),
        prisma.exerciseAttempt.count({ where: { userId: args.userId } }),
      ]);
      process.stdout.write(JSON.stringify({ completions, mastery, attempts }));
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
