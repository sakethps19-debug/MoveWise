"use client";

import Link from "next/link";
import type { Lesson } from "@movewise/exercise-schema";
import type { MasteryStatus } from "../lib/masteryModel";
import { statusOf } from "../lib/lessonStatus";
import { useEffectiveCompletions, type CompletionRecord } from "../lib/useEffectiveCompletions";
import { MasteryBadge } from "./ui/MasteryBadge";
import type { UnitWithLessons } from "./LearningPath";

/**
 * The `/practice` aggregation hub ADR-0008 describes: every unit's puzzle
 * pool in one place, instead of only reachable one principle at a time
 * from LearningPath's per-principle "Practice puzzles" row. Reuses that
 * same row's exact unlock computation (lib/lessonStatus.ts,
 * lib/useEffectiveCompletions.ts) rather than re-deriving it — a pool
 * that's reachable here must be exactly the same set LearningPath already
 * offers, just gathered across all three units.
 *
 * Still not the full pool ADR-0008 ultimately describes: course puzzles
 * only, no game-derived positions, spaced repetition, or saved positions
 * yet (see docs/roadmap.md's Phase B/C) — those need infrastructure this
 * pass doesn't build.
 */
export function PracticeHub({
  units,
  completions,
  conceptMastery,
}: {
  units: UnitWithLessons[];
  completions: Map<string, CompletionRecord> | null;
  conceptMastery: Map<string, MasteryStatus> | null;
}) {
  const { completedIds } = useEffectiveCompletions(completions);

  const allPrinciplesById = new Map(units.flatMap((u) => u.principles).map((p) => [p.id, p]));
  const statusFor = (lesson: Lesson) =>
    statusOf(
      lesson,
      completedIds,
      allPrinciplesById,
      units.find((u) => u.id === lesson.unitId)?.principles ?? [],
      conceptMastery,
    );

  // Same "regressed to struggling" signal LearningPath's own "Review
  // needed" section surfaces — repeated here rather than aggregated
  // globally so this page still reads correctly if reached directly.
  const needsReview =
    conceptMastery === null
      ? []
      : units
          .flatMap((u) => u.principles.map((p) => ({ unit: u, principle: p })))
          .filter(({ principle }) => conceptMastery.get(principle.conceptId) === "struggling");

  const pools = units.flatMap((unit) =>
    unit.principles
      .filter((principle) => principle.puzzleIds.length > 0)
      .map((principle) => {
        const subLessons = principle.subLessonIds
          .map((id) => unit.lessons.find((l) => l.id === id))
          .filter((l): l is Lesson => l !== undefined);
        const unlocked = subLessons.length > 0 && subLessons.every((l) => statusFor(l) === "completed");
        const nextNeededLesson = subLessons.find((l) => statusFor(l) !== "completed") ?? null;
        return { unit, principle, unlocked, nextNeededLesson };
      }),
  );
  const unlockedPools = pools.filter((p) => p.unlocked);
  const lockedPools = pools.filter((p) => !p.unlocked);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-6)" }}>
      <section>
        <Link href="/practice/warm-up" className="mw-lesson-node-link">
          <div className="mw-lesson-node mw-lesson-node--available">
            <span className="mw-lesson-node-icon" aria-hidden="true">
              ☀️
            </span>
            <span className="mw-lesson-node-body">
              <span className="mw-lesson-node-title">Daily warm-up</span>
              <span className="mw-lesson-node-reason">2 quick puzzles — play now, no lesson required</span>
            </span>
          </div>
        </Link>
      </section>

      {needsReview.length > 0 && (
        <div className="mw-review-needed">
          <h2 className="mw-review-needed-title">Review needed</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-2)" }}>
            {needsReview.map(({ principle }) => (
              <Link key={principle.id} href={`/review/${principle.id}`} className="mw-review-needed-item">
                <span className="mw-review-needed-item-title">{principle.title}</span>
                <span className="mw-review-needed-item-detail">
                  A few recent attempts went wrong — a quick refresher and some easier practice will help this stick.
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <section>
        <h2 className="mw-page-title" style={{ fontSize: 20, marginBottom: "var(--mw-space-3)" }}>
          Puzzle pools
        </h2>
        {pools.length === 0 ? (
          <p className="mw-page-subtitle">No puzzle pools yet — check back once more units are curated.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-2)" }}>
            {unlockedPools.map(({ unit, principle }) => {
              const status = conceptMastery?.get(principle.conceptId);
              return (
                <Link key={principle.id} href={`/practice/${principle.id}`} className="mw-lesson-node-link">
                  <div className="mw-lesson-node mw-lesson-node--available">
                    <span className="mw-lesson-node-icon" aria-hidden="true">
                      🧩
                    </span>
                    <span className="mw-lesson-node-body">
                      <span className="mw-lesson-node-title">{principle.title}</span>
                      <span className="mw-lesson-node-reason">
                        {unit.title} · {principle.puzzleIds.length} puzzle{principle.puzzleIds.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <MasteryBadge status={status} />
                  </div>
                </Link>
              );
            })}
            {lockedPools.map(({ unit, principle, nextNeededLesson }) => (
              // Real, confirmed gap: the old design put a plain inline text
              // link ("finish X") inside a row whose whole opacity was
              // dimmed to 0.55 (the same treatment as a genuinely disabled
              // lesson node) — the one actionable thing here read as
              // disabled along with everything else, not as the enabled
              // path forward it actually is. Only the lock icon stays
              // dimmed now (design-system.css's own comment explains why
              // title/reason don't — dimming them failed real WCAG
              // contrast checks); the CTA to the real next lesson is a
              // normal, full-opacity, full-size button — always enabled,
              // since it always points somewhere real.
              <div key={principle.id} className="mw-lesson-node mw-lesson-node--locked-cta">
                <span className="mw-lesson-node-icon" aria-hidden="true">
                  🔒
                </span>
                <span className="mw-lesson-node-body">
                  <span className="mw-lesson-node-title">{principle.title}</span>
                  <span className="mw-lesson-node-reason">
                    {unit.title}
                    {nextNeededLesson ? ` · finish "${nextNeededLesson.title}" to unlock` : " · finish its lessons to unlock"}
                  </span>
                </span>
                {nextNeededLesson && (
                  <Link href={`/learn/${nextNeededLesson.id}`} className="mw-btn mw-btn--ghost mw-lesson-node-cta">
                    Go to lesson
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
