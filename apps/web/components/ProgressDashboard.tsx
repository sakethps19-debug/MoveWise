"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readGuestProgress } from "../lib/guestProgress";
import type { ProgressSummary } from "../lib/progressSummary";
import { ProgressBar } from "./ui/ProgressBar";

type NextAction = { kind: "review"; label: string; principleId: string } | { kind: "lesson"; label: string } | { kind: "none" };

/**
 * A guest's own view — computed client-side from localStorage, since
 * guest progress never touches the server (lib/guestProgress.ts). Much
 * lighter than the signed-in dashboard: no mastery/practice/game data
 * exists for a guest at all, so this is honest about what it can show,
 * with a clear CTA toward the full, persisted version.
 */
function GuestProgressView({ totalLessons }: { totalLessons: number }) {
  const [lessonsCompleted, setLessonsCompleted] = useState<number | null>(null);

  useEffect(() => {
    const progress = readGuestProgress();
    setLessonsCompleted(Object.keys(progress).length);
  }, []);

  return (
    <div className="mw-progress-guest">
      <h1 className="mw-page-title">Progress</h1>
      <p className="mw-page-subtitle">
        {lessonsCompleted === null
          ? "Loading your local progress…"
          : `${lessonsCompleted} of ${totalLessons} lessons completed on this device.`}
      </p>
      <div className="mw-progress-guest-cta">
        <p>
          Guest progress lives only in this browser. Create a free account to track mastery by concept, practice
          accuracy, streaks, and full game analysis history.
        </p>
        <Link href="/signup" className="mw-btn mw-btn--primary">
          Create an account
        </Link>
      </div>
    </div>
  );
}

function NextActionCard({ nextAction }: { nextAction: NextAction }) {
  if (nextAction.kind === "none") {
    return (
      <div className="mw-progress-next-action mw-progress-next-action--none" role="status">
        <p>You&apos;re all caught up — nothing urgent to review, and every unlocked lesson is complete.</p>
      </div>
    );
  }
  const href = nextAction.kind === "review" ? `/review/${nextAction.principleId}` : "/";
  return (
    <div className="mw-progress-next-action" role="status">
      <span className="mw-badge mw-badge--neutral">Recommended next</span>
      <Link href={href} className="mw-progress-next-action-link">
        {nextAction.label}
      </Link>
    </div>
  );
}

export function ProgressDashboard({
  isGuest,
  summary,
  nextAction,
  totalLessons,
}: {
  isGuest: boolean;
  summary: ProgressSummary | null;
  nextAction: NextAction | null;
  totalLessons: number;
}) {
  if (isGuest || !summary) {
    return <GuestProgressView totalLessons={totalLessons} />;
  }

  return (
    <div className="mw-progress-dashboard">
      <h1 className="mw-page-title">Progress</h1>
      <p className="mw-page-subtitle">Your learning at a glance.</p>

      {nextAction && <NextActionCard nextAction={nextAction} />}

      <div className="mw-progress-grid">
        <div className="mw-progress-stat mw-card">
          <span className="mw-progress-stat-value">{summary.lessonsCompleted}</span>
          <span className="mw-progress-stat-label">of {summary.totalLessons} lessons completed</span>
        </div>
        <div className="mw-progress-stat mw-card">
          <span className="mw-progress-stat-value">{summary.xp.toLocaleString()}</span>
          <span className="mw-progress-stat-label">total XP</span>
        </div>
        <div className="mw-progress-stat mw-card">
          <span className="mw-progress-stat-value">{summary.streakDays}</span>
          <span className="mw-progress-stat-label">day streak</span>
        </div>
        <div className="mw-progress-stat mw-card">
          <span className="mw-progress-stat-value">{summary.gamesPlayed}</span>
          <span className="mw-progress-stat-label">games played</span>
        </div>
        <div className="mw-progress-stat mw-card">
          <span className="mw-progress-stat-value">
            {summary.practiceAccuracy
              ? `${Math.round((summary.practiceAccuracy.correct / summary.practiceAccuracy.total) * 100)}%`
              : "—"}
          </span>
          <span className="mw-progress-stat-label">practice accuracy</span>
        </div>
      </div>

      <h2 className="mw-progress-section-heading">Unit progress</h2>
      <ul className="mw-progress-units">
        {summary.units.map((unit) => (
          <li key={unit.unitId} className="mw-progress-unit">
            <span className="mw-progress-unit-title">{unit.title}</span>
            <ProgressBar value={unit.completed} max={unit.total} label={`${unit.title} progress`} />
            <span className="mw-progress-unit-count">
              {unit.completed}/{unit.total}
            </span>
          </li>
        ))}
      </ul>

      {summary.reviewDue.length > 0 && (
        <>
          <h2 className="mw-progress-section-heading">Review due</h2>
          <ul className="mw-progress-review-list">
            {summary.reviewDue.map((item) =>
              item.principleId ? (
                <li key={item.conceptId}>
                  <Link href={`/review/${item.principleId}`}>{item.title}</Link>
                </li>
              ) : (
                <li key={item.conceptId}>{item.title}</li>
              ),
            )}
          </ul>
        </>
      )}

      {summary.recentlyImproved.length > 0 && (
        <>
          <h2 className="mw-progress-section-heading">Recently improved</h2>
          <ul className="mw-progress-improved-list">
            {summary.recentlyImproved.map((item) => (
              <li key={item.conceptId}>{item.title}</li>
            ))}
          </ul>
        </>
      )}

      {summary.mistakesByCategory.length > 0 && (
        <>
          <h2 className="mw-progress-section-heading">Mistakes from analysed games</h2>
          <ul className="mw-progress-mistakes-list">
            {summary.mistakesByCategory.map((m) => (
              <li key={m.conceptId}>
                {m.title} <span className="mw-progress-mistake-count">×{m.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
