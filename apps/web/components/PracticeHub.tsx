"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lesson } from "@movewise/exercise-schema";
import type { MasteryStatus } from "../lib/masteryModel";
import { statusOf, demonstratedLessonIdsFrom } from "../lib/lessonStatus";
import { useEffectiveCompletions, type CompletionRecord } from "../lib/useEffectiveCompletions";
import { useDemonstratedConcepts } from "../lib/useDemonstratedConcepts";
import { readPlacementResult } from "../lib/placementProgress";
import { readGuestContradictingConceptIds, readGuestConfirmedConceptIds } from "../lib/guestProgress";
import { NEEDS_CONFIRMATION_LEVELS, type ConceptEvidenceLevel } from "../lib/placementEvidence";
import { MasteryBadge } from "./ui/MasteryBadge";
import { ReflectIcon, StruggleIcon } from "./icons/StepIcons";
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
  evidenceLevels = null,
  unconfirmedConceptIds = new Set(),
  laterContradictedConceptIds = new Set(),
}: {
  units: UnitWithLessons[];
  completions: Map<string, CompletionRecord> | null;
  conceptMastery: Map<string, MasteryStatus> | null;
  /** P1 "make confirmation evidence meaningful": per-concept evidenceLevel (lib/placementEvidence.ts), so a passed confirmation counts toward unlock eligibility without needing `status` alone to already say "proficient". */
  evidenceLevels?: Map<string, string> | null;
  /** P1 "placement confirmation": pools already unlocked purely from an inferred (never directly checked) placement signal — offered an optional quick check to convert that into confirmed evidence, not a lock (see app/practice/page.tsx). */
  unconfirmedConceptIds?: Set<string>;
  /** A failed confirmation attempt — surfaced in "Review needed" alongside genuinely struggling concepts, never as a lock (see app/actions.ts's confirmConceptAction). */
  laterContradictedConceptIds?: Set<string>;
}) {
  const { completedIds } = useEffectiveCompletions(completions);
  // See lib/lessonStatus.ts's statusOf doc comment: real evidence (a
  // placement assessment or ordinary practice) that bypasses the literal-
  // completion check below without ever marking a lesson "completed".
  // This is the exact fix for PracticeHub's own "brutal user journey" bug
  // — `unlocked` used to require every sub-lesson literally "completed",
  // forcing a rated player through meet-the-pieces before reaching any
  // tactics pool no matter what their placement demonstrated.
  const demonstratedConceptIds = useDemonstratedConcepts(conceptMastery, evidenceLevels);

  // Guest equivalent of app/practice/page.tsx's server-side computation —
  // no session there for a server component to read, so this reads the
  // same local placement record client-side instead (hydration-safe: a
  // guest's very first paint has no local data yet, same reasoning as
  // useDemonstratedConcepts.ts).
  const [guestUnconfirmed, setGuestUnconfirmed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (conceptMastery !== null) return;
    const placement = readPlacementResult();
    const contradicted = readGuestContradictingConceptIds();
    const confirmed = readGuestConfirmedConceptIds();
    const evidence = placement?.conceptEvidence ?? [];
    const ids = evidence
      .filter(
        (e) =>
          NEEDS_CONFIRMATION_LEVELS.has(e.level as ConceptEvidenceLevel) &&
          !contradicted.has(e.conceptId) &&
          !confirmed.has(e.conceptId),
      )
      .map((e) => e.conceptId);
    setGuestUnconfirmed(new Set(ids));
  }, [conceptMastery]);
  const effectiveUnconfirmed = conceptMastery === null ? guestUnconfirmed : unconfirmedConceptIds;

  const allPrinciplesById = new Map(units.flatMap((u) => u.principles).map((p) => [p.id, p]));
  const demonstratedLessonIds = demonstratedLessonIdsFrom(allPrinciplesById, demonstratedConceptIds);
  const statusFor = (lesson: Lesson) =>
    statusOf(
      lesson,
      completedIds,
      allPrinciplesById,
      units.find((u) => u.id === lesson.unitId)?.principles ?? [],
      conceptMastery,
      demonstratedConceptIds,
    );
  const isDone = (lesson: Lesson) => statusFor(lesson) === "completed" || demonstratedLessonIds.has(lesson.id);

  // Same "regressed to struggling" signal LearningPath's own "Review
  // needed" section surfaces — repeated here rather than aggregated
  // globally so this page still reads correctly if reached directly. A
  // failed confirmation attempt (evidenceLevel === later_contradicted)
  // surfaces the same way — "we're refining your placement", never a
  // lock — see app/actions.ts's confirmConceptAction.
  //
  // The two reasons are real, evidenced differently, and honestly
  // different in weight: `struggling` is genuine accuracy evidence over
  // several attempts, `later_contradicted` is one placement inference
  // that didn't hold up under a direct check — ConfirmationActivity's own
  // completion screen goes out of its way to say so ("not marking
  // anything as failed"). Tagging each item with which one it is here
  // (rather than folding both under one "went wrong" sentence, the real
  // gap this fixes) keeps that same honesty visible wherever this list
  // is read, not just in the moment right after it happened.
  const needsReview =
    conceptMastery === null
      ? []
      : units
          .flatMap((u) => u.principles.map((p) => ({ unit: u, principle: p })))
          .map(({ unit, principle }) => ({
            unit,
            principle,
            reason:
              conceptMastery.get(principle.conceptId) === "struggling"
                ? ("struggling" as const)
                : laterContradictedConceptIds.has(principle.conceptId)
                  ? ("later_contradicted" as const)
                  : null,
          }))
          .filter((entry): entry is typeof entry & { reason: "struggling" | "later_contradicted" } => entry.reason !== null);

  const pools = units.flatMap((unit) =>
    unit.principles
      .filter((principle) => principle.puzzleIds.length > 0)
      .map((principle) => {
        const subLessons = principle.subLessonIds
          .map((id) => unit.lessons.find((l) => l.id === id))
          .filter((l): l is Lesson => l !== undefined);
        const unlocked = subLessons.length > 0 && subLessons.every(isDone);
        const nextNeededLesson = subLessons.find((l) => !isDone(l)) ?? null;
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
            {needsReview.map(({ principle, reason }) => (
              <Link
                key={principle.id}
                href={`/review/${principle.id}`}
                className={`mw-review-needed-item mw-review-needed-item--${reason === "struggling" ? "struggling" : "confirm"}`}
              >
                <span className="mw-review-needed-item-icon" aria-hidden="true">
                  {reason === "struggling" ? <StruggleIcon /> : <ReflectIcon />}
                </span>
                <span className="mw-review-needed-item-body">
                  <span className="mw-review-needed-item-title">{principle.title}</span>
                  <span className="mw-review-needed-item-detail">
                    {reason === "struggling"
                      ? "A few recent attempts went wrong — a quick refresher and some easier practice will help this stick."
                      : "A placement result here didn't hold up under a direct check — never a failure, just worth confirming for real."}
                  </span>
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
            {unlockedPools.length === 0 && (
              // Real gap this fixes: a learner with nothing unlocked yet
              // (everyone's very first visit here) previously landed
              // straight on a wall of ~17 identical locked rows with no
              // framing — technically actionable (each row's own CTA
              // still works) but reads as "nothing here for you", not as
              // a clear first step. Points at the very first pool's own
              // nextNeededLesson, so the CTA below is never a duplicate
              // of the identical one already on that first locked row.
              <div className="mw-practice-empty-hint">
                <p>
                  No puzzle pools are unlocked yet — they open up once you finish the lessons behind them. Start with
                  your first lesson and you&apos;ll have a pool to practise within a few minutes.
                </p>
                {lockedPools[0]?.nextNeededLesson && (
                  <Link href={`/learn/${lockedPools[0].nextNeededLesson.id}`} className="mw-btn mw-btn--primary">
                    Start &ldquo;{lockedPools[0].nextNeededLesson.title}&rdquo; →
                  </Link>
                )}
              </div>
            )}
            {unlockedPools.map(({ unit, principle }) => {
              const status = conceptMastery?.get(principle.conceptId);
              const needsConfirmation = effectiveUnconfirmed.has(principle.conceptId);
              return (
                <div key={principle.id} className="mw-lesson-node-link" style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-1)" }}>
                  <Link href={`/practice/${principle.id}`} className="mw-lesson-node-link">
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
                  {needsConfirmation && (
                    <Link
                      href={`/practice/confirm/${principle.id}`}
                      className="mw-lesson-node-reason"
                      style={{ marginLeft: "var(--mw-space-6)", textDecoration: "underline" }}
                    >
                      This was unlocked from your placement result, not directly tested — confirm it? →
                    </Link>
                  )}
                </div>
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
