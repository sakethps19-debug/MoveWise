"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readGuestActivityDates,
  readGuestGameStats,
  readGuestPracticeStats,
  readGuestProgress,
  readGuestWarmUpsCompleted,
  type GuestGameStats,
} from "../lib/guestProgress";
import { CLASSIFICATION_LABEL, type MoveClassification } from "../lib/gameAnalysis";
import { computeStreak, type ProgressSummary } from "../lib/progressSummary";
import { ProgressBar } from "./ui/ProgressBar";

type NextAction = { kind: "review"; label: string; principleId: string } | { kind: "lesson"; label: string } | { kind: "none" };

interface GuestSnapshot {
  lessonsCompleted: number;
  xp: number;
  streakDays: number;
  warmUpsCompleted: number;
  practice: { attempts: number; correct: number };
  games: GuestGameStats;
}

function readGuestSnapshot(): GuestSnapshot {
  const progress = readGuestProgress();
  return {
    lessonsCompleted: Object.keys(progress).length,
    xp: Object.values(progress).reduce((sum, p) => sum + p.xpEarned, 0),
    streakDays: computeStreak(readGuestActivityDates()),
    warmUpsCompleted: readGuestWarmUpsCompleted(),
    practice: readGuestPracticeStats(),
    games: readGuestGameStats(),
  };
}

/** A guest's own next-step nudge — deliberately simpler than `recommendNextAction` (no mastery data exists for a guest), but real: it looks at what this device's own local data actually shows, never a placeholder. */
function guestNextAction(snapshot: GuestSnapshot, totalLessons: number): string {
  if (snapshot.games.reviewItems > 0) {
    return `You have ${snapshot.games.reviewItems} move${snapshot.games.reviewItems === 1 ? "" : "s"} to learn from in your analysed games — open a game from Play & Learn's history to review them.`;
  }
  if (snapshot.lessonsCompleted < totalLessons) {
    return "Continue with the next lesson on your learning path.";
  }
  return "You're caught up on every lesson — play a game or try a puzzle pool to keep sharp.";
}

/**
 * A guest's own view — computed client-side from localStorage, since
 * guest progress never touches the server (lib/guestProgress.ts). Uses
 * every piece of local data a guest can actually generate (lesson
 * completions/XP, a real local streak, warm-ups, practice accuracy,
 * games played/analysed and their real classification counts) instead of
 * just a lesson count — the puzzle attempts, games, and analyses
 * themselves were always real; only the *display* of them was previously
 * missing for anyone without an account.
 */
function GuestProgressView({ totalLessons }: { totalLessons: number }) {
  const [snapshot, setSnapshot] = useState<GuestSnapshot | null>(null);

  useEffect(() => {
    setSnapshot(readGuestSnapshot());
  }, []);

  const practiceAccuracy =
    snapshot && snapshot.practice.attempts > 0 ? Math.round((snapshot.practice.correct / snapshot.practice.attempts) * 100) : null;
  const classificationEntries = snapshot
    ? (Object.entries(snapshot.games.classificationTotals) as [MoveClassification, number][]).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="mw-progress-guest">
      <h1 className="mw-page-title">Progress</h1>
      <p className="mw-page-subtitle">
        {snapshot === null
          ? "Loading your local progress…"
          : `${snapshot.lessonsCompleted} of ${totalLessons} lessons completed on this device.`}
      </p>

      {snapshot && (
        <>
          <div className="mw-progress-next-action" role="status">
            <span className="mw-badge mw-badge--neutral">Recommended next</span>
            <span>{guestNextAction(snapshot, totalLessons)}</span>
          </div>

          <div className="mw-progress-grid">
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{snapshot.lessonsCompleted}</span>
              <span className="mw-progress-stat-label">of {totalLessons} lessons completed</span>
            </div>
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{snapshot.xp.toLocaleString()}</span>
              <span className="mw-progress-stat-label">total XP</span>
            </div>
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{snapshot.streakDays}</span>
              <span className="mw-progress-stat-label">day streak</span>
            </div>
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{snapshot.warmUpsCompleted}</span>
              <span className="mw-progress-stat-label">warm-ups completed</span>
            </div>
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{practiceAccuracy === null ? "—" : `${practiceAccuracy}%`}</span>
              <span className="mw-progress-stat-label">
                practice accuracy{snapshot.practice.attempts > 0 ? ` (${snapshot.practice.attempts} attempts)` : ""}
              </span>
            </div>
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{snapshot.games.gamesPlayed}</span>
              <span className="mw-progress-stat-label">games played</span>
            </div>
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{snapshot.games.gamesAnalysed}</span>
              <span className="mw-progress-stat-label">games analysed</span>
            </div>
            <div className="mw-progress-stat mw-card">
              <span className="mw-progress-stat-value">{snapshot.games.reviewItems}</span>
              <span className="mw-progress-stat-label">review items from analysed games</span>
            </div>
          </div>

          {classificationEntries.length > 0 && (
            <>
              <h2 className="mw-progress-section-heading">Move classifications from analysed games</h2>
              <ul className="mw-progress-mistakes-list">
                {classificationEntries.map(([classification, count]) => (
                  <li key={classification}>
                    {CLASSIFICATION_LABEL[classification] ?? classification} <span className="mw-progress-mistake-count">×{count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="mw-progress-guest-cta">
        <p>
          Guest progress lives only in this browser, on this device — it isn&apos;t synchronised anywhere, and clearing
          your browser data clears it too. Create a free account to keep this history permanently and sync it across
          devices, plus unlock mastery tracking by concept.
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
