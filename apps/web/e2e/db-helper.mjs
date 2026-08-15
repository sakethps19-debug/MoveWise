/**
 * Test-only DB helper for e2e/cross-unit-progression.spec.ts. Importing
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

const [, , command, argJson] = process.argv;
const args = argJson ? JSON.parse(argJson) : {};

async function main() {
  switch (command) {
    case "get-user-id": {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: args.email } });
      process.stdout.write(user.id);
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
