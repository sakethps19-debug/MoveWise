"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@movewise/db";
import { createSession, destroySession, getSession, hashPassword, verifyPassword } from "../lib/auth";
import { checkRateLimit, formatRetryAfter } from "../lib/rate-limit";
import { loadLesson } from "../lib/lessons";
import { findPuzzle } from "../lib/puzzles";
import { computeMasteryStatus, type MasteryStatus } from "../lib/masteryModel";
import { canAnalyze, summarize, type GameReview, type MoveAnalysis } from "../lib/gameAnalysis";
import { buildStoredGameReview } from "../lib/studyPlan";
import type { AttemptRecord } from "../components/LessonRunner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_SIGNUP_AGE = 13;

// Deliberately generous: this is meant to stop automated abuse, not slow
// down a real user retyping a mistyped password a few times, and every
// key here can collapse many real, unrelated users into one bucket —
// shared NAT (a school computer lab is exactly this product's audience)
// collapses by IP, and any deploy that doesn't sit behind a proxy
// setting x-forwarded-for collapses *every* visitor into the "unknown"
// bucket (see clientIp below). Generous limits are the only lever
// available against that until this moves to a real per-user/session
// signal — see lib/rate-limit.ts for why this is a stopgap, not the
// final answer.
// The count is overridable via SIGNUP_RATE_LIMIT (falls back to 20,
// production's real anti-abuse tuning, when unset or invalid) — CI runs
// the full E2E suite from a single IP, and the suite's own total real
// signups across every spec file sits right at 20, so any retry or added
// signup-dependent test pushes it over its own budget and fails with no
// connection to an actual regression. Widening the window/count here
// would weaken real abuse protection; widening it only for CI's own
// traffic (ci.yml sets this explicitly) doesn't.
const SIGNUP_LIMIT = { limit: Number(process.env.SIGNUP_RATE_LIMIT) || 20, windowMs: 60 * 60 * 1000 }; // 20/hour per IP by default
const LOGIN_IP_LIMIT = { limit: 15, windowMs: 15 * 60 * 1000 }; // 15/15min per IP
const LOGIN_EMAIL_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000 }; // 8/15min per email, catches distributed attempts against one account

async function clientIp(): Promise<string> {
  const h = await headers();
  // First hop only — good enough for the abuse this stops (spoofing the
  // rest of the chain doesn't help an attacker bypass a limit keyed on
  // the value their own proxy/client sent first). Falls back to a
  // literal "unknown" when there's no x-forwarded-for at all (plain
  // `next dev`/`next start` with no reverse proxy in front) — every
  // visitor then shares that one bucket, which is the scenario the
  // comment above SIGNUP_LIMIT/LOGIN_IP_LIMIT is about.
  const forwardedFor = h.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

const MAX_GUEST_LESSONS = 200; // generous headroom over the current ~16 lessons

/**
 * Folds this browser's locally-stored guest progress (see
 * lib/guestProgress.ts) into the account that just signed up or signed
 * in — sent as a hidden form field so it lands in the same request that
 * creates the session, no separate round trip. Applies to both signup
 * and login: a guest who then signs into an *existing* account is
 * treated the same as one who just created it, since either way "this
 * browser's local progress" is the intent to carry it in. Uses the same
 * best-mistakes merge as completeLessonAction, so it can never downgrade
 * progress the account already has.
 *
 * Untrusted client input, so shape/type/range checked before any write —
 * this is form data an attacker fully controls, not app-generated state.
 */
async function migrateGuestProgress(userId: string, formData: FormData): Promise<void> {
  const raw = formData.get("guestProgress");
  if (typeof raw !== "string" || !raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof parsed !== "object" || parsed === null) return;

  const entries = Object.entries(parsed as Record<string, unknown>).slice(0, MAX_GUEST_LESSONS);

  for (const [lessonId, value] of entries) {
    if (!lessonId || typeof value !== "object" || value === null) continue;
    const { xpEarned, mistakes, hintsUsed } = value as { xpEarned?: unknown; mistakes?: unknown; hintsUsed?: unknown };
    if (typeof xpEarned !== "number" || typeof mistakes !== "number") continue;
    if (!Number.isFinite(xpEarned) || !Number.isFinite(mistakes)) continue;
    // hintsUsed is newer than the rest of this shape — older localStorage
    // blobs saved before it existed won't have it, so default rather than
    // drop the whole (still-valid) xpEarned/mistakes entry.
    const rawHints = typeof hintsUsed === "number" && Number.isFinite(hintsUsed) ? hintsUsed : 0;

    const clampedXp = Math.max(0, Math.min(10_000, Math.round(xpEarned)));
    const clampedMistakes = Math.max(0, Math.min(10_000, Math.round(mistakes)));
    const clampedHints = Math.max(0, Math.min(10_000, Math.round(rawHints)));

    const existing = await prisma.lessonCompletion.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const bestMistakes = existing ? Math.min(existing.mistakes, clampedMistakes) : clampedMistakes;
    const bestHintsUsed = existing ? Math.min(existing.hintsUsed, clampedHints) : clampedHints;

    await prisma.lessonCompletion.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { xpEarned: clampedXp, mistakes: bestMistakes, hintsUsed: bestHintsUsed },
      create: { userId, lessonId, xpEarned: clampedXp, mistakes: bestMistakes, hintsUsed: bestHintsUsed },
    });

    // Real bug this closes: migration wrote LessonCompletion rows only,
    // never UserConceptMastery — so a guest who was proficient enough to
    // have unlocked a principle-gated lesson (the guest path never
    // checks proficiency at all, see LearningPath.tsx's statusOf) would
    // find that same lesson *locked* immediately after signing up, since
    // the signed-in gate does check proficiency and found zero mastery
    // rows. Guests never record per-step ExerciseAttempt data (only the
    // lesson-level xpEarned/mistakes/hintsUsed aggregate), so this
    // synthesizes a reasonable proxy from the one signal that *is*
    // real: `mistakes` wrong attempts followed by one correct attempt,
    // per concept the lesson teaches — the same shape a real playthrough
    // with that many mistakes would have produced, run through the exact
    // same `recordAttemptsAndUpdateMastery` path a live completion uses,
    // not a separate ad hoc calculation.
    const migratedLesson = loadLesson(lessonId);
    if (migratedLesson) {
      const attempts: AttemptRecord[] = [
        ...Array.from({ length: clampedMistakes }, (_, i) => ({
          stepId: `guest-migration-${i}`,
          correct: false,
          wrongAnswerKey: "guest-migration",
        })),
        { stepId: "guest-migration-final", correct: true, wrongAnswerKey: null },
      ];
      await recordAttemptsAndUpdateMastery(userId, lessonId, attempts);
    }
  }
}

export interface FormState {
  error?: string;
}

export async function signupAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  const signupLimit = await checkRateLimit(`signup:${ip}`, SIGNUP_LIMIT.limit, SIGNUP_LIMIT.windowMs);
  if (!signupLimit.allowed) {
    return { error: `Too many signup attempts. Try again in ${formatRetryAfter(signupLimit.retryAfterMs!)}.` };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const birthYear = Number(formData.get("birthYear"));

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (!birthYear || birthYear < 1900 || birthYear > new Date().getFullYear()) {
    return { error: "Enter your birth year." };
  }

  // Conservative COPPA-aware gate: block signup outright for under-13s
  // rather than collecting a child's email/password without any real
  // verifiable-parental-consent flow in place. This is a year-only
  // approximation (no month/day), and birth year is used only for this
  // check — it isn't persisted, per data-minimization.
  const age = new Date().getFullYear() - birthYear;
  if (age < MIN_SIGNUP_AGE) {
    return {
      error:
        "MoveWise doesn't yet support account creation for users under 13 — that requires verifiable parental consent (COPPA), which isn't built yet.",
    };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  await createSession(user.id);
  await migrateGuestProgress(user.id, formData);
  redirect("/");
}

export async function loginAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const ip = await clientIp();
  const ipLimit = await checkRateLimit(`login-ip:${ip}`, LOGIN_IP_LIMIT.limit, LOGIN_IP_LIMIT.windowMs);
  const emailLimit = email
    ? await checkRateLimit(`login-email:${email}`, LOGIN_EMAIL_LIMIT.limit, LOGIN_EMAIL_LIMIT.windowMs)
    : { allowed: true as const };
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, emailLimit.retryAfterMs ?? 0);
    return { error: `Too many login attempts. Try again in ${formatRetryAfter(retryAfterMs)}.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }
  await createSession(user.id);
  await migrateGuestProgress(user.id, formData);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function deleteAccountAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "You must be signed in." };

  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect password." };
  }

  // Cascades to Session and LessonCompletion (see schema.prisma's
  // onDelete: Cascade on both relations) — one delete, nothing orphaned.
  await prisma.user.delete({ where: { id: user.id } });
  await destroySession(); // clears the cookie; the session row is already gone via the cascade above
  redirect("/");
}

/**
 * Phase 4's "clearly isolated development-only progress reset mechanism."
 * Guarded here, server-side, not just by the calling UI being hidden in
 * production (components/DevResetControl.tsx already only renders under
 * `process.env.NODE_ENV === "development"`) — a Server Action is its own
 * callable endpoint regardless of what the client renders, so the actual
 * safety boundary has to live in the action itself. Only ever deletes the
 * signed-in caller's own rows (never another user's, never guest
 * localStorage server-side) — same blast radius as the self-service
 * account deletion above, just without deleting the account itself.
 */
export async function devResetProgressAction(): Promise<{ error?: string }> {
  if (process.env.NODE_ENV !== "development") {
    return { error: "Not available outside development." };
  }
  const user = await getSession();
  if (!user) return { error: "You must be signed in." };

  await prisma.exerciseAttempt.deleteMany({ where: { userId: user.id } });
  await prisma.userConceptMastery.deleteMany({ where: { userId: user.id } });
  await prisma.lessonCompletion.deleteMany({ where: { userId: user.id } });
  revalidatePath("/");
  return {};
}

export async function completeLessonAction(
  lessonId: string,
  xpEarned: number,
  mistakes: number,
  hintsUsed: number,
  attempts: AttemptRecord[],
): Promise<void> {
  const user = await getSession();
  if (!user) return; // guest: XP is session-local only, nothing to persist

  const existing = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });
  // Keep the best (lowest-mistake, lowest-hint) run's star rating — redoing
  // a mastered lesson sloppily shouldn't downgrade it.
  const bestMistakes = existing ? Math.min(existing.mistakes, mistakes) : mistakes;
  const bestHintsUsed = existing ? Math.min(existing.hintsUsed, hintsUsed) : hintsUsed;

  await prisma.lessonCompletion.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    update: { xpEarned, mistakes: bestMistakes, hintsUsed: bestHintsUsed },
    create: { userId: user.id, lessonId, xpEarned, mistakes, hintsUsed },
  });

  await recordAttemptsAndUpdateMastery(user.id, lessonId, attempts);
  revalidatePath("/");
}

/**
 * Recomputes UserConceptMastery for each given concept from the
 * learner's full ExerciseAttempt history on that concept — not just the
 * attempts just recorded, so a concept taught/practised across multiple
 * lessons and puzzles (or revisited later) accumulates one real signal.
 * Shared by both the lesson-completion path and the puzzle-attempt path
 * below; each attempt's `source` ("lesson" vs "puzzle") is derived from
 * which of `lessonId`/`puzzleId` is set on the row, not stored
 * separately — see masteryModel.ts's `practising`/`ready-for-assessment`
 * doc comment for why the source distinction matters.
 */
async function recomputeMasteryForConcepts(userId: string, conceptIds: string[]): Promise<void> {
  for (const conceptId of conceptIds) {
    const [existingMastery, history] = await Promise.all([
      prisma.userConceptMastery.findUnique({ where: { userId_conceptId: { userId, conceptId } } }),
      prisma.exerciseAttempt.findMany({
        where: { userId, conceptIds: { has: conceptId } },
        orderBy: { createdAt: "asc" },
        select: { correct: true, puzzleId: true, gameId: true },
      }),
    ]);

    const { status, exerciseConfidence } = computeMasteryStatus(
      (existingMastery?.status as MasteryStatus | undefined) ?? null,
      history.map((a) => ({
        correct: a.correct,
        source: a.puzzleId ? ("puzzle" as const) : a.gameId ? ("game" as const) : ("lesson" as const),
      })),
    );

    await prisma.userConceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: { status, exerciseConfidence, lastPracticedAt: new Date() },
      create: { userId, conceptId, status, exerciseConfidence, lastPracticedAt: new Date() },
    });
  }
}

/**
 * ADR-0008 / docs/learner-model.md's concrete first implementation step:
 * persist every attempt (not just the lesson-level aggregate), then
 * recompute mastery for every concept this lesson teaches.
 */
async function recordAttemptsAndUpdateMastery(userId: string, lessonId: string, attempts: AttemptRecord[]): Promise<void> {
  if (attempts.length === 0) return;
  const lesson = loadLesson(lessonId);
  if (!lesson) return; // shouldn't happen — the lesson was just completed — but never let a lookup miss crash the completion flow

  const conceptIds = lesson.masteryTags;

  await prisma.exerciseAttempt.createMany({
    data: attempts.map((a) => ({
      userId,
      lessonId,
      stepId: a.stepId,
      conceptIds,
      correct: a.correct,
      wrongAnswerKey: a.wrongAnswerKey,
    })),
  });

  await recomputeMasteryForConcepts(userId, conceptIds);
}

/**
 * The puzzle-pool equivalent of the lesson path above — one row per
 * attempt against a pooled Puzzle (ADR-0008) instead of a lesson step.
 * This is the concrete evidence source docs/learner-model.md specifies
 * for `practising`/`ready-for-assessment`: "working through concept-
 * tagged Puzzles" / "puzzle accuracy above threshold".
 */
export async function recordPuzzleAttemptAction(puzzleId: string, correct: boolean): Promise<void> {
  const user = await getSession();
  if (!user) return; // guest: puzzle practice is session-local only, nothing to persist — same reasoning as completeLessonAction

  const puzzle = findPuzzle(puzzleId);
  if (!puzzle) return; // unknown puzzle id — nothing to record against

  await prisma.exerciseAttempt.create({
    data: {
      userId: user.id,
      puzzleId,
      stepId: puzzleId,
      conceptIds: puzzle.conceptIds,
      correct,
      wrongAnswerKey: null,
    },
  });

  await recomputeMasteryForConcepts(user.id, puzzle.conceptIds);
  revalidatePath("/");
}

export interface SaveCompletedGameInput {
  pgn: string;
  playerColor: "w" | "b";
  /** From the learner's own perspective. */
  result: "win" | "loss" | "draw" | "resigned";
  /** chess-rules' own GameStatus values, plus "resigned" (not a board state). */
  endReason: string;
}

/**
 * ADR-0008 Phase B: persists a completed Play-mode game so it can be
 * analyzed after the fact — Play mode was previously stateless once the
 * page unmounted. Guest games aren't persisted (no session to own the
 * row), same "session-local only" reasoning as completeLessonAction.
 */
export async function saveCompletedGameAction(input: SaveCompletedGameInput): Promise<{ gameId: string } | null> {
  const user = await getSession();
  if (!user) return null;

  const game = await prisma.game.create({
    data: {
      userId: user.id,
      source: "stockfish", // the only opponent Play mode has today
      pgn: input.pgn,
      playerColor: input.playerColor,
      result: input.result,
      endReason: input.endReason,
    },
  });
  return { gameId: game.id };
}

export type SubmittedMoveAnalysis = Omit<MoveAnalysis, "recommendedLessonIds">;

/**
 * The game-analysis equivalent of recordAttemptsAndUpdateMastery/
 * recordPuzzleAttemptAction above — a mistake lib/conceptDetection.ts
 * found in a real analysed game is exactly as real a signal that a
 * concept needs review as a wrong lesson step or puzzle attempt, but
 * until now nothing fed it into UserConceptMastery, so a concept a
 * learner kept mishandling in real play could never surface in the
 * Practice hub's "Review needed" section or the Progress dashboard's
 * review queue — only in the game's own review table. Only moves with a
 * detected concept are recorded (conceptDetection.ts already returns an
 * empty list for every non-mistake move, per its own doc comment), and
 * every one is `correct: false` — a detected mistake is itself the
 * negative evidence, there's no "correct" game-derived attempt to record.
 */
async function recordGameMistakesAndUpdateMastery(userId: string, gameId: string, moves: SubmittedMoveAnalysis[]): Promise<void> {
  const mistakes = moves.filter((m) => m.conceptIds.length > 0);
  if (mistakes.length === 0) return;

  await prisma.exerciseAttempt.createMany({
    data: mistakes.map((m, i) => ({
      userId,
      gameId,
      stepId: `${gameId}-ply-${i}`,
      conceptIds: m.conceptIds,
      correct: false,
    })),
  });

  const conceptIds = [...new Set(mistakes.flatMap((m) => m.conceptIds))];
  await recomputeMasteryForConcepts(userId, conceptIds);
}

/**
 * Persists the result of a client-side analysis pass (lib/moveClassification.ts
 * + lib/conceptDetection.ts, run in-browser against the same Stockfish Web
 * Worker Play mode already uses — see components/PlayRunner.tsx and
 * lib/useGameAnalysisRunner.ts) and resolves each move's `conceptIds`
 * into real lesson recommendations, a step that needs filesystem access
 * the client doesn't have (lib/studyPlan.ts's buildStoredGameReview).
 *
 * Cached by construction: a `GameAnalysis` already existing for this game
 * is returned as-is rather than re-persisted — "re-viewing an already-
 * analysed game must never re-run the engine" (ADR-0008, "Decision —
 * analysis pipeline"). Enforces the fair-play invariant server-side, not
 * just trusting the client sent a legitimate game (ADR-0008, "Decision —
 * fair play": "a fixed invariant to test directly ... not something to
 * trust to code review").
 */
export async function saveGameAnalysisAction(
  gameId: string,
  moves: SubmittedMoveAnalysis[],
): Promise<GameReview | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "You must be signed in to save a game analysis." };

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.userId !== user.id) return { error: "Game not found." };
  if (!canAnalyze(game)) return { error: "This game isn't eligible for analysis." };

  const masteryRows = await prisma.userConceptMastery.findMany({ where: { userId: user.id } });
  const conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));

  const existing = await prisma.gameAnalysis.findUnique({
    where: { gameId },
    include: { moves: { orderBy: { ply: "asc" } } },
  });
  const storedMoves: SubmittedMoveAnalysis[] =
    existing?.moves.map((m) => ({
      moveNumber: m.moveNumber,
      color: m.color as "w" | "b",
      playedMove: m.playedMove,
      bestMove: m.bestMove,
      evalBefore: m.evalBefore,
      evalAfter: m.evalAfter,
      evalLoss: m.evalLoss,
      classification: m.classification as MoveAnalysis["classification"],
      explanation: m.explanation ?? "",
      conceptIds: m.conceptIds,
    })) ?? moves;

  if (!existing) {
    await prisma.gameAnalysis.create({
      data: {
        gameId,
        status: "complete",
        summary: summarize(moves.map((m) => ({ ...m, recommendedLessonIds: [] }))),
        moves: {
          create: moves.map((m, i) => ({
            ply: i,
            moveNumber: m.moveNumber,
            color: m.color,
            playedMove: m.playedMove,
            bestMove: m.bestMove,
            evalBefore: m.evalBefore,
            evalAfter: m.evalAfter,
            evalLoss: m.evalLoss,
            classification: m.classification,
            conceptIds: m.conceptIds,
            explanation: m.explanation,
          })),
        },
      },
    });
    await recordGameMistakesAndUpdateMastery(user.id, gameId, moves);
  }

  return buildStoredGameReview(storedMoves, conceptMastery);
}
