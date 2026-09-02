import Link from "next/link";
import { prisma } from "@movewise/db";
import { loadUnitLessons, loadLesson } from "../lib/lessons";
import { loadUnitPrinciples, loadConceptTitles } from "../lib/principles";
import { getSession } from "../lib/auth";
import { logoutAction } from "./actions";
import { LearningPath } from "../components/LearningPath";
import { Nav } from "../components/Nav";
import { DevResetControl } from "../components/DevResetControl";
import { TodayPlan } from "../components/TodayPlan";
import type { TodayPlanInput } from "../lib/todayPlan";
import { PROFICIENT_STATUSES, type MasteryStatus } from "../lib/masteryModel";
import { statusOf } from "../lib/lessonStatus";
import { rankConceptsForPractice, type ConceptPracticeSignal } from "../lib/practiceScheduler";
import { NEEDS_CONFIRMATION_LEVELS, BYPASS_EVIDENCE_LEVELS, conceptIdsAtOrAbove, type ConceptEvidence, type ConceptEvidenceLevel } from "../lib/placementEvidence";
import { LESSON_CHECKPOINT_CLOSED_STEP } from "../lib/lessonCheckpointStore";

const UNITS = [
  { id: "meet-the-pieces", title: "Meet the Pieces" },
  { id: "check-and-checkmate", title: "Check and Checkmate Basics" },
  { id: "basic-tactics", title: "Basic Tactics" },
  { id: "tactical-vision", title: "Tactical Vision" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string; needs?: string; needsProficiency?: string }>;
}) {
  const { locked, needs, needsProficiency } = await searchParams;
  const units = UNITS.map((unit) => ({
    ...unit,
    lessons: loadUnitLessons(unit.id),
    principles: loadUnitPrinciples(unit.id),
  }));
  const user = await getSession();

  let totalXp = 0;
  let completions: Map<string, { xpEarned: number; mistakes: number; hintsUsed: number }> | null = null;
  let conceptMastery: Map<string, MasteryStatus> | null = null;
  // P1 "build the Today experience": everything TodayPlan needs, built once
  // here from the exact same rows every other surface already reads
  // (UserConceptMastery, PlacementAttempt, LessonCheckpoint, Game) — Today
  // is a view over existing evidence, never a second source of truth.
  // Scoped to signed-in learners only this pass: a full guest-side
  // equivalent would need to mirror review-due-date scheduling
  // (lib/practiceScheduler.ts's nextRevisionDueAt) entirely client-side,
  // which doesn't exist today — an honest, documented scope cut, not an
  // oversight (see the session's final report).
  let todayInput: Omit<TodayPlanInput, "minutesBudget" | "goal" | "experience"> | null = null;
  if (user) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const allPrinciples = units.flatMap((u) => u.principles);
    const principlesByConceptId = new Map(allPrinciples.map((p) => [p.conceptId, p]));
    const conceptTitleById = loadConceptTitles();

    const [rows, masteryRows, latestPlacement, recentAttempts, todayAttempts, checkpoints, games] = await Promise.all([
      prisma.lessonCompletion.findMany({ where: { userId: user.id } }),
      prisma.userConceptMastery.findMany({ where: { userId: user.id } }),
      prisma.placementAttempt.findFirst({ where: { userId: user.id }, orderBy: { completedAt: "desc" } }),
      prisma.exerciseAttempt.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { conceptIds: true, correct: true, puzzleId: true },
        take: 500,
      }),
      prisma.exerciseAttempt.findMany({
        where: { userId: user.id, createdAt: { gte: todayStart } },
        select: { puzzleId: true, conceptIds: true },
      }),
      prisma.lessonCheckpoint.findMany({
        where: { userId: user.id, stepIndex: { not: LESSON_CHECKPOINT_CLOSED_STEP } },
        orderBy: { updatedAt: "desc" },
        take: 1,
      }),
      prisma.game.findMany({
        where: { userId: user.id },
        orderBy: { playedAt: "desc" },
        include: { analysis: { include: { moves: true } } },
      }),
    ]);
    totalXp = rows.reduce((sum, c) => sum + c.xpEarned, 0);
    completions = new Map(
      rows.map((c) => [c.lessonId, { xpEarned: c.xpEarned, mistakes: c.mistakes, hintsUsed: c.hintsUsed }]),
    );
    conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));

    const evidenceByConceptId = new Map(
      ((latestPlacement?.conceptEvidence as unknown as ConceptEvidence[] | null) ?? []).map((e) => [e.conceptId, e.level]),
    );
    // Same bypass useDemonstratedConcepts.ts computes client-side for
    // LearningPath/PracticeHub — real accuracy-based proficiency OR real
    // placement/confirmation evidence, either one. Recomputed here (not
    // imported from that hook, which is "use client"-only) so the
    // frontier walk below can never disagree with what LearningPath
    // itself would show as unlocked — the exact class of bug just fixed
    // in app/practice/[principleId]/page.tsx for the pool-unlock gate.
    const demonstratedConceptIds = new Set<string>();
    for (const m of masteryRows) {
      if (PROFICIENT_STATUSES.has(m.status as MasteryStatus)) demonstratedConceptIds.add(m.conceptId);
      if (m.evidenceLevel && BYPASS_EVIDENCE_LEVELS.has(m.evidenceLevel as ConceptEvidenceLevel)) demonstratedConceptIds.add(m.conceptId);
    }

    const now = new Date();
    const recentByConceptId = new Map<string, boolean[]>();
    for (const attempt of recentAttempts) {
      for (const conceptId of attempt.conceptIds) {
        const list = recentByConceptId.get(conceptId);
        if (list) {
          if (list.length < 5) list.push(attempt.correct);
        } else {
          recentByConceptId.set(conceptId, [attempt.correct]);
        }
      }
    }
    const signals: ConceptPracticeSignal[] = [...principlesByConceptId.keys()].map((conceptId) => {
      const mastery = masteryRows.find((m) => m.conceptId === conceptId);
      const recent = recentByConceptId.get(conceptId) ?? [];
      return {
        conceptId,
        status: (mastery?.status as MasteryStatus | undefined) ?? null,
        exerciseConfidence: mastery?.exerciseConfidence ?? 0,
        lastPracticedAt: mastery?.lastPracticedAt ?? null,
        nextDueAt: mastery?.nextRevisionDueAt ?? null,
        placementEvidenceLevel: evidenceByConceptId.get(conceptId) ?? null,
        recentIncorrectCount: recent.filter((correct) => !correct).length,
      };
    });
    const rankedConcepts = rankConceptsForPractice(signals, now);
    const reviewDueSignals = signals.filter((s) => s.nextDueAt !== null && s.nextDueAt <= now);

    const toConceptTarget = (conceptId: string, reason: string) => {
      const principle = principlesByConceptId.get(conceptId);
      if (!principle || principle.puzzleIds.length === 0) return null;
      return { conceptId, principleId: principle.id, title: conceptTitleById[conceptId] ?? principle.title, reason };
    };
    const topReviewConceptFull =
      rankedConcepts
        .filter((r) => reviewDueSignals.some((s) => s.conceptId === r.conceptId))
        .map((r) => toConceptTarget(r.conceptId, r.reason))
        .find((t): t is NonNullable<typeof t> => t !== null) ?? null;
    const topPracticeConceptFull =
      rankedConcepts
        .filter((r) => r.conceptId !== topReviewConceptFull?.conceptId)
        .map((r) => toConceptTarget(r.conceptId, r.reason))
        .find((t): t is NonNullable<typeof t> => t !== null) ?? null;
    // TodayPlanInput doesn't need the bare conceptId — trim it back off
    // now that it's done its job disambiguating review vs. practice above.
    const topReviewConcept = topReviewConceptFull && { principleId: topReviewConceptFull.principleId, title: topReviewConceptFull.title, reason: topReviewConceptFull.reason };
    const topPracticeConcept = topPracticeConceptFull && { principleId: topPracticeConceptFull.principleId, title: topPracticeConceptFull.title, reason: topPracticeConceptFull.reason };

    const unconfirmedConceptIds = [...conceptIdsAtOrAbove(
      (latestPlacement?.conceptEvidence as unknown as ConceptEvidence[] | null) ?? [],
      NEEDS_CONFIRMATION_LEVELS,
    )].filter((id) => !conceptMastery!.has(id));
    const pendingConfirmationConceptId = unconfirmedConceptIds[0] ?? null;
    const pendingConfirmationPrinciple = pendingConfirmationConceptId ? principlesByConceptId.get(pendingConfirmationConceptId) : null;

    const checkpoint = checkpoints[0] ?? null;
    const checkpointLesson = checkpoint ? loadLesson(checkpoint.lessonId) : null;

    const completedLessonIds = new Set(rows.map((c) => c.lessonId));
    const allLessonsById = new Map(units.flatMap((u) => u.lessons).map((l) => [l.id, l]));
    const frontierLessons: { lessonId: string; title: string }[] = [];
    outer: for (const unit of units) {
      const principlesById = new Map(unit.principles.map((p) => [p.id, p]));
      for (const lesson of unit.lessons) {
        if (
          statusOf(lesson, completedLessonIds, principlesById, unit.principles, conceptMastery, demonstratedConceptIds, allLessonsById) ===
          "available"
        ) {
          frontierLessons.push({ lessonId: lesson.id, title: lesson.title });
          if (frontierLessons.length >= 2) break outer;
        }
      }
    }

    const NON_MISTAKE: ReadonlySet<string> = new Set(["brilliant", "best", "excellent", "good", "forced"]);
    const gameWithMistake = games.find((g) => g.analysis?.moves.some((m) => !NON_MISTAKE.has(m.classification)));
    const mistakeToReview = gameWithMistake
      ? {
          gameId: gameWithMistake.id,
          title: `Game vs. Stockfish, ${gameWithMistake.playedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        }
      : null;

    const todayPuzzleAttempts = todayAttempts.filter((a) => a.puzzleId !== null);
    const didLearnToday =
      rows.some((c) => c.completedAt >= todayStart) ||
      (pendingConfirmationConceptId !== null &&
        todayPuzzleAttempts.some((a) => a.conceptIds.includes(pendingConfirmationConceptId)));

    todayInput = {
      didAnyPuzzlePracticeToday: todayPuzzleAttempts.length > 0,
      didLearnToday,
      didPlayGameToday: games.some((g) => g.playedAt >= todayStart),
      reviewDueCount: reviewDueSignals.length,
      topReviewConcept,
      inProgressLesson: checkpoint && checkpointLesson ? { lessonId: checkpoint.lessonId, title: checkpointLesson.title } : null,
      pendingConfirmation:
        pendingConfirmationConceptId && pendingConfirmationPrinciple
          ? { principleId: pendingConfirmationPrinciple.id, conceptTitle: conceptTitleById[pendingConfirmationConceptId] ?? pendingConfirmationPrinciple.title }
          : null,
      nextLesson: frontierLessons[0] ?? null,
      alternateNextLesson: frontierLessons[1] ?? null,
      topPracticeConcept,
      mistakeToReview,
      isBrandNewLearner: rows.length === 0 && masteryRows.length === 0 && !latestPlacement && games.length === 0,
    };
  }

  return (
    <div className="mw-app-shell">
      <Nav active="learn" user={user ? { email: user.email } : null} totalXp={totalXp} />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <div className="mw-page-head">
          <div>
            <h1 className="mw-page-title">Learn &amp; Play</h1>
            <p className="mw-page-subtitle">Learn how to think during a chess game.</p>
          </div>
          {user ? (
            <form action={logoutAction}>
              <button type="submit" className="mw-btn mw-btn--ghost">
                Sign out
              </button>
            </form>
          ) : (
            <div style={{ fontSize: 14 }}>
              <Link href="/login">Sign in</Link> or <Link href="/signup">create an account</Link>
            </div>
          )}
        </div>

        {process.env.NODE_ENV === "development" && <DevResetControl isGuest={!user} />}

        {locked && (
          <p role="alert" className="mw-feedback mw-feedback--error" style={{ marginBottom: "var(--mw-space-5)" }}>
            {needsProficiency
              ? `"${locked}" is locked until your performance on "${needsProficiency}" is strong enough — completing the lessons isn't quite enough on its own. Try its exercises again for a stronger result.`
              : needs
                ? `"${locked}" is locked until you complete "${needs}" first.`
                : `"${locked}" is locked until you complete its prerequisites first.`}
          </p>
        )}

        {todayInput && <TodayPlan input={todayInput} />}

        <LearningPath units={units} completions={completions} conceptMastery={conceptMastery} />
      </main>
    </div>
  );
}
