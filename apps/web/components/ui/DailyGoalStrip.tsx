"use client";

import { useEffect, useState } from "react";
import { currentStreak, completedToday, DAILY_GOAL } from "../../lib/streak";

/**
 * Phase 5's "daily goal/streak area, even if streak data is initially
 * local" (lib/streak.ts). Reads after mount, like every other
 * localStorage-backed read in this app (LearningPath.tsx's guest
 * completions / started-lesson set) — the server has no streak data to
 * render, so a value read before mount would mismatch hydration.
 */
export function DailyGoalStrip() {
  const [streak, setStreak] = useState<number | null>(null);
  const [doneToday, setDoneToday] = useState(false);

  useEffect(() => {
    setStreak(currentStreak());
    setDoneToday(completedToday());
  }, []);

  if (streak === null) return null; // avoid a flash of "0" before the real value is read

  return (
    <div className="mw-daily-goal" role="status">
      <span className="mw-daily-goal-streak">
        <span aria-hidden="true" className="mw-daily-goal-flame">
          ●
        </span>
        {streak} day{streak === 1 ? "" : "s"} streak
      </span>
      <span className="mw-daily-goal-divider" aria-hidden="true" />
      <span className="mw-daily-goal-today">
        {doneToday
          ? `Today's goal met — ${DAILY_GOAL} lesson${DAILY_GOAL === 1 ? "" : "s"} a day`
          : `Today's goal: ${DAILY_GOAL} lesson${DAILY_GOAL === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
