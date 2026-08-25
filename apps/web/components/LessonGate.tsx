"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { readGuestProgress } from "../lib/guestProgress";

interface LessonGateProps {
  lessonId: string;
  lessonTitle: string;
  /** `lesson.prerequisites`, each paired with its own title for the locked-banner message. */
  prerequisites: { id: string; title: string }[];
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
 * Hydration safety: this always renders the neutral loading state on
 * first paint (matching the server's guest render, since neither knows
 * yet whether the prerequisite is met), reads `localStorage` only after
 * mount, then either reveals `children` or redirects to the same
 * `/?locked=...&needs=...` banner the signed-in server-side gate already
 * uses. Lesson content is never rendered before that check resolves.
 */
export function LessonGate({ lessonId, lessonTitle, prerequisites, children }: LessonGateProps) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(prerequisites.length === 0);

  useEffect(() => {
    if (prerequisites.length === 0) return;
    const completedIds = new Set(Object.keys(readGuestProgress()));
    const missing = prerequisites.find((p) => !completedIds.has(p.id));
    if (missing) {
      router.replace(`/?locked=${encodeURIComponent(lessonTitle)}&needs=${encodeURIComponent(missing.title)}`);
    } else {
      setUnlocked(true);
    }
    // Only re-check if the target lesson itself changes — re-running on
    // every render would re-read localStorage needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  if (!unlocked) {
    return (
      <div role="status" aria-live="polite" className="mw-lesson-gate-loading">
        <p>Checking your progress&hellip;</p>
      </div>
    );
  }

  return <>{children}</>;
}
