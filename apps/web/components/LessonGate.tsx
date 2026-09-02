"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { readGuestProgress } from "../lib/guestProgress";
import { computeGuestDemonstratedConceptIds } from "../lib/useDemonstratedConcepts";
import { statusOf, unlockReason } from "../lib/lessonStatus";

interface LessonGateProps {
  lesson: Lesson;
  /** Every principle across every unit, serialized from the server component — content data, not user-specific, safe to pass down. Mirrors LearningPath.tsx's own `allPrinciplesById`. */
  allPrinciples: Principle[];
  /** Every lesson across every unit, serialized the same way — needed to resolve a prerequisite's own `kind`/`unitId` for the mastery-challenge bypass (see lib/lessonStatus.ts's statusOf). */
  allLessons: Lesson[];
  /** This lesson's own unit's principles, in declared order — the same `principlesInOrder` shape statusOf needs for the "previous principle proficient" check. */
  unitPrinciplesInOrder: Principle[];
  children: ReactNode;
}

/**
 * Route-level protection for a guest (not-signed-in) learner opening a
 * lesson URL directly. `app/learn/[lessonId]/page.tsx` already gates a
 * signed-in learner server-side (real `LessonCompletion` rows, checked
 * before anything renders) — but a guest has no session, so that check
 * is skipped entirely for them (`if (user && ...)`), and until this
 * component existed, a guest typing a locked lesson's URL got the full
 * lesson content immediately. Guest progress only exists in this
 * browser's `localStorage`, unreadable from the server, so this has to
 * be a client-side check — done here, once, rather than duplicated
 * anywhere else a guest can reach a lesson route directly.
 *
 * P0 "one availability resolver": this used to run its own, independent
 * completedIds-only check — a real, confirmed bug, since it never
 * accounted for placement evidence at all. A guest whose placement
 * assessment demonstrated a lesson's prerequisite concept still got
 * bounced back to "/" as locked, even though the homepage's own
 * recommendation (built from `lib/lessonStatus.ts`'s `statusOf`, via
 * `lib/useDemonstratedConcepts.ts`) correctly showed the exact same
 * lesson as available — client-side card and client-side route guard
 * disagreeing on identical evidence. This now calls the same `statusOf`/
 * `unlockReason` functions every other surface (LearningPath.tsx cards,
 * PracticeHub.tsx, the signed-in server-side guard in
 * app/learn/[lessonId]/page.tsx) already uses, fed the same
 * `computeGuestDemonstratedConceptIds()` evidence-gathering
 * `useDemonstratedConcepts.ts`'s reactive hook itself calls — so a
 * recommendation can no longer link to a destination that then rejects
 * the same learner state.
 *
 * Hydration safety: this always renders the neutral loading state on
 * first paint (matching the server's guest render, since neither knows
 * yet whether the prerequisite is met), reads `localStorage` only after
 * mount, then either reveals `children` or redirects to the same
 * `/?locked=...&needs=...` banner the signed-in server-side gate already
 * uses. Lesson content is never rendered before that check resolves.
 */
export function LessonGate({ lesson, allPrinciples, allLessons, unitPrinciplesInOrder, children }: LessonGateProps) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(lesson.prerequisites.length === 0);

  useEffect(() => {
    if (lesson.prerequisites.length === 0) return;
    const completedIds = new Set(Object.keys(readGuestProgress()));
    const demonstratedConceptIds = computeGuestDemonstratedConceptIds();
    const principlesById = new Map(allPrinciples.map((p) => [p.id, p]));
    const lessonsById = new Map(allLessons.map((l) => [l.id, l]));

    const status = statusOf(lesson, completedIds, principlesById, unitPrinciplesInOrder, null, demonstratedConceptIds, lessonsById);
    if (status === "locked") {
      const reason = unlockReason(lesson, completedIds, lessonsById, principlesById, unitPrinciplesInOrder, false, demonstratedConceptIds);
      // unlockReason only ever names a missing lesson-prerequisite for a
      // guest (the principle-proficiency gate is signed-in-only, per its
      // own `hasConceptMasteryTracking` guard) — extract just the quoted
      // title for the banner's `needs` param, falling back to the raw
      // prerequisite id if parsing ever fails.
      const match = reason?.match(/"([^"]+)"/);
      const needsTitle = match?.[1] ?? lesson.prerequisites[0] ?? "an earlier lesson";
      router.replace(`/?locked=${encodeURIComponent(lesson.title)}&needs=${encodeURIComponent(needsTitle)}`);
    } else {
      setUnlocked(true);
    }
    // Only re-check if the target lesson itself changes — re-running on
    // every render would re-read localStorage needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  if (!unlocked) {
    return (
      <div role="status" aria-live="polite" className="mw-lesson-gate-loading">
        <p>Checking your progress&hellip;</p>
      </div>
    );
  }

  return <>{children}</>;
}
