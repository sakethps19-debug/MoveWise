import type { Lesson, Principle } from "@movewise/exercise-schema";
import { PROFICIENT_STATUSES, type MasteryStatus } from "./masteryModel";

/**
 * Extracted from components/LearningPath.tsx so a second surface
 * (components/PracticeHub.tsx, the /practice aggregation page) can
 * compute the same locked/available/completed status and unlock reason
 * without re-implementing the gating logic a second time — this is the
 * single source of truth both share, not a coincidentally-similar copy.
 */
export type CoreStatus = "locked" | "available" | "completed";

/**
 * Mirrors the server-side gate in app/learn/[lessonId]/page.tsx exactly —
 * a lesson that would redirect when opened must not show as "available"
 * here, or the learner sees an inviting ▶ that just bounces them back.
 * Lesson completion alone (the old `prerequisites`-only check) is not
 * sufficient once a lesson is a principle's first sub-lesson (ADR-0008).
 *
 * `conceptMastery` must be the raw per-session value here — `null` means
 * "no signed-in session, no UserConceptMastery to check" (a guest),
 * `Map` (even an empty one) means "signed in, real tracking exists".
 * Collapsing that distinction away (as an earlier version of this
 * function did, via a derived "effective" value that went `null` once
 * *any* progress existed, guest or not) meant a guest's missing mastery
 * data read as "checked and not proficient" instead of "nothing to
 * check" — a real bug: a guest who aced a principle's lessons still saw
 * its next principle's first lesson as locked, even though the
 * server-side route guard (below, already correctly scoped to
 * `if (user && ...)`) would have let them straight in by URL. Confirmed
 * live via Playwright before this fix, not assumed from reading the code.
 */
export function statusOf(
  lesson: Lesson,
  completedIds: Set<string> | null,
  principlesById: Map<string, Principle>,
  principlesInOrder: Principle[],
  conceptMastery: Map<string, MasteryStatus> | null,
  /**
   * Concept ids a placement assessment has already demonstrated real
   * evidence for (lib/placement.ts's `scorePlacement`) — a second,
   * additive way past both gates below, alongside `completedIds` and
   * `conceptMastery`, never in place of either. Deliberately does NOT
   * make a lesson read as "completed": a rated player who tested out of
   * meet-the-pieces still sees its lessons as "available" (so they can
   * open one to double-check or review), not falsely marked done — a
   * placement result is exactly evidence-based, unlike an onboarding
   * self-report (which the codebase already documents as never gating
   * anything, in lib/onboarding.ts). Satisfies the P0 "do not unlock
   * advanced content solely from self-reported ability" requirement
   * without violating "never falsely mark a concept completed".
   */
  demonstratedConceptIds?: Set<string>,
  /**
   * Every lesson by id, needed only to resolve a *prerequisite*'s own
   * `kind`/`unitId` for the mastery-challenge bypass immediately below.
   * Optional and additive: omitting it just means a mastery-challenge
   * prerequisite can only be passed by literal completion, matching this
   * function's behavior before this parameter existed — every existing
   * caller that doesn't pass it keeps its exact prior behavior.
   */
  lessonsById?: Map<string, Lesson>,
): CoreStatus {
  if (completedIds === null) return "available"; // guest: no progress tracked, nothing to lock against
  if (completedIds.has(lesson.id)) return "completed";

  const demonstratedLessonIds = demonstratedLessonIdsFrom(principlesById, demonstratedConceptIds);
  const passesPrereq = (p: string) => {
    if (completedIds.has(p) || demonstratedLessonIds.has(p)) return true;
    // Real, confirmed bug this closes: a mastery-challenge lesson (e.g.
    // meet-the-pieces.12-unit-mastery-challenge) belongs to no principle's
    // own subLessonIds at all, so `demonstratedLessonIdsFrom` above can
    // never cover it directly — a *downstream* lesson whose prerequisite
    // IS a mastery-challenge lesson (e.g. check-and-checkmate.01-what-is-
    // check) stayed locked here even once every principle in that
    // mastery-challenge's own unit was genuinely demonstrated, because
    // this function had no equivalent to the special-cased bypass
    // app/learn/[lessonId]/page.tsx's server-side route guard already
    // implemented separately for signed-in learners — the exact
    // "recommendation says available, route says locked" contradiction
    // reported live, reproduced here structurally so it can't recur the
    // next time a caller (e.g. a guest-only client-side gate) is added
    // without re-deriving this same special case badly or not at all.
    const prereqLesson = lessonsById?.get(p);
    if (prereqLesson?.kind === "mastery-challenge") {
      const unitPrinciples = [...principlesById.values()].filter((pr) => pr.unitId === prereqLesson.unitId);
      return unitFullyDemonstrated(unitPrinciples, demonstratedConceptIds);
    }
    return false;
  };
  if (!lesson.prerequisites.every(passesPrereq)) return "locked";

  // No signed-in session to check proficiency against at all (a guest) —
  // skip the principle gate entirely rather than reading "no data" as
  // "not proficient". Matches the server-side guard's own `if (user && ...)`.
  if (lesson.principleId && conceptMastery !== null) {
    const principle = principlesById.get(lesson.principleId);
    if (principle && principle.subLessonIds[0] === lesson.id) {
      const index = principlesInOrder.findIndex((p) => p.id === principle.id);
      const previous = index > 0 ? principlesInOrder[index - 1] : undefined;
      if (previous) {
        const status = conceptMastery.get(previous.conceptId);
        const demonstratedPrevious = demonstratedConceptIds?.has(previous.conceptId) ?? false;
        if ((!status || !PROFICIENT_STATUSES.has(status)) && !demonstratedPrevious) return "locked";
      }
    }
  }

  return "available";
}

/** Every lesson id belonging to a principle whose conceptId is in `demonstratedConceptIds` — the concrete bypass `statusOf`/`unlockReason` apply on top of `completedIds`. Exported so PracticeHub.tsx's own pool-unlock check (a separate literal-completion check `statusOf` doesn't control) can apply the identical bypass rather than re-deriving it. */
export function demonstratedLessonIdsFrom(
  principlesById: Map<string, Principle>,
  demonstratedConceptIds?: Set<string>,
): Set<string> {
  if (!demonstratedConceptIds || demonstratedConceptIds.size === 0) return new Set();
  const lessonIds = new Set<string>();
  for (const principle of principlesById.values()) {
    if (demonstratedConceptIds.has(principle.conceptId)) {
      for (const lessonId of principle.subLessonIds) lessonIds.add(lessonId);
    }
  }
  return lessonIds;
}

/**
 * Whether every principle belonging to `unitId` has independently
 * demonstrated evidence — the single rule that decides whether a unit's
 * own mastery-challenge lesson (which belongs to no principle's own
 * subLessonIds, so `demonstratedLessonIdsFrom` above can never cover it
 * directly) can be bypassed as a prerequisite. Exported so both
 * LearningPath.tsx's client-side "which lesson is `nextUp`" computation
 * and app/learn/[lessonId]/page.tsx's server-side route guard apply the
 * *identical* rule — real, confirmed bug this closes: before this was
 * extracted, the server route had no equivalent check at all (the
 * single-principle lookup its bypass used can never find a
 * mastery-challenge lesson), so a learner whose placement directly
 * demonstrated every concept in a unit still got redirected as locked
 * from that unit's own mastery-challenge lesson gating a later unit,
 * even though the homepage correctly recommended it. Bypassed only when
 * every principle in the unit is demonstrated — never from a partial
 * result, exactly mirroring the "completion" bar an actual mastery
 * challenge would otherwise require.
 */
export function unitFullyDemonstrated(unitPrinciples: Principle[], demonstratedConceptIds?: Set<string>): boolean {
  if (unitPrinciples.length === 0) return false;
  if (!demonstratedConceptIds || demonstratedConceptIds.size === 0) return false;
  return unitPrinciples.every((p) => demonstratedConceptIds.has(p.conceptId));
}

/**
 * What a locked lesson needs before it opens — shown on the row itself
 * (Phase 4: "clearly show what is required to unlock a lesson"), not just
 * as a banner after a bounced direct-URL attempt.
 */
export function unlockReason(
  lesson: Lesson,
  completedIds: Set<string> | null,
  lessonsById: Map<string, Lesson>,
  principlesById: Map<string, Principle>,
  principlesInOrder: Principle[],
  hasConceptMasteryTracking: boolean,
  demonstratedConceptIds?: Set<string>,
): string | null {
  if (completedIds === null) return null; // guest: no per-row reason, matches statusOf's "everything open" treatment
  const demonstratedLessonIds = demonstratedLessonIdsFrom(principlesById, demonstratedConceptIds);
  const passesPrereq = (p: string) => {
    if (completedIds.has(p) || demonstratedLessonIds.has(p)) return true;
    // Same mastery-challenge bypass as statusOf above — kept in sync so
    // the reason text and the actual lock decision can never disagree.
    const prereqLesson = lessonsById.get(p);
    if (prereqLesson?.kind === "mastery-challenge") {
      const unitPrinciples = [...principlesById.values()].filter((pr) => pr.unitId === prereqLesson.unitId);
      return unitFullyDemonstrated(unitPrinciples, demonstratedConceptIds);
    }
    return false;
  };
  const missingPrereq = lesson.prerequisites.find((p) => !passesPrereq(p));
  if (missingPrereq) {
    const title = lessonsById.get(missingPrereq)?.title ?? missingPrereq;
    return `Unlocks after "${title}"`;
  }
  // No session to check proficiency against — same reasoning as statusOf:
  // a guest is never locked by the principle gate, so there's no reason
  // to report for it either.
  if (lesson.principleId && hasConceptMasteryTracking) {
    const principle = principlesById.get(lesson.principleId);
    if (principle && principle.subLessonIds[0] === lesson.id) {
      const index = principlesInOrder.findIndex((p) => p.id === principle.id);
      const previous = index > 0 ? principlesInOrder[index - 1] : undefined;
      if (previous && !demonstratedConceptIds?.has(previous.conceptId)) {
        return `Unlocks once "${previous.title}" is proficient`;
      }
    }
  }
  return null;
}
