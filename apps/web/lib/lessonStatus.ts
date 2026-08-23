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
): CoreStatus {
  if (completedIds === null) return "available"; // guest: no progress tracked, nothing to lock against
  if (completedIds.has(lesson.id)) return "completed";
  if (!lesson.prerequisites.every((p) => completedIds.has(p))) return "locked";

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
        if (!status || !PROFICIENT_STATUSES.has(status)) return "locked";
      }
    }
  }

  return "available";
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
): string | null {
  if (completedIds === null) return null; // guest: no per-row reason, matches statusOf's "everything open" treatment
  const missingPrereq = lesson.prerequisites.find((p) => !completedIds.has(p));
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
      if (previous) return `Unlocks once "${previous.title}" is proficient`;
    }
  }
  return null;
}
