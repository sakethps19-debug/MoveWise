"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lesson } from "@movewise/exercise-schema";
import { starsForPerformance } from "../lib/mastery";
import { clearGuestProgress, readGuestProgress } from "../lib/guestProgress";

export interface UnitWithLessons {
  id: string;
  title: string;
  lessons: Lesson[];
}

type LessonStatus = "locked" | "available" | "completed";

function statusOf(lesson: Lesson, completedIds: Set<string> | null): LessonStatus {
  if (completedIds === null) return "available"; // guest: no progress tracked, nothing to lock against
  if (completedIds.has(lesson.id)) return "completed";
  return lesson.prerequisites.every((p) => completedIds.has(p)) ? "available" : "locked";
}

function Stars({ count }: { count: 1 | 2 | 3 }) {
  return (
    <span aria-label={`${count} of 3 stars`} style={{ color: "#c68a00", letterSpacing: 1 }}>
      {"★".repeat(count)}
      <span style={{ opacity: 0.3 }}>{"★".repeat(3 - count)}</span>
    </span>
  );
}

/**
 * The default home screen: a status-aware syllabus (locked / available /
 * completed, with mastery stars), not a flat link list. Deliberately not
 * a winding node-path — a clean vertical list of unit sections, each a
 * row per lesson, reads as a course outline rather than a Duolingo-style
 * bubble path.
 *
 * "In progress" and "due for revision" aren't modeled — both need real
 * attempt-tracking / spaced-repetition infrastructure this pass doesn't
 * build (the product brief itself scopes spaced repetition to a later
 * phase). Guests fall back to locally-persisted progress (below) —
 * everything unlocked only until localStorage is read, mirroring the
 * signed-in behavior instead of always showing everything open.
 */
export function LearningPath({
  units,
  completions,
}: {
  units: UnitWithLessons[];
  completions: Map<string, { xpEarned: number; mistakes: number; hintsUsed: number }> | null;
}) {
  const [guestCompletions, setGuestCompletions] = useState<Map<
    string,
    { xpEarned: number; mistakes: number; hintsUsed: number }
  > | null>(null);

  // Server-rendered `completions` is only non-null for a signed-in user.
  // For a guest, fall back to whatever this browser has recorded locally
  // (read after mount, so the first paint matches the server's guest
  // render and avoids a hydration mismatch). Once signed in, any
  // lingering local guest data has already been migrated into the
  // account (see migrateGuestProgress in app/actions.ts) and is now
  // stale, so clear it rather than let it resurface after a future
  // logout.
  useEffect(() => {
    if (completions === null) {
      setGuestCompletions(new Map(Object.entries(readGuestProgress())));
    } else {
      clearGuestProgress();
    }
  }, [completions]);

  const effectiveCompletions = completions ?? guestCompletions;
  const completedIds = effectiveCompletions ? new Set(effectiveCompletions.keys()) : null;

  const allLessons = units.flatMap((u) => u.lessons);
  const nextUp = allLessons.find((l) => statusOf(l, completedIds) === "available");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {nextUp && (
        <Link
          href={`/learn/${nextUp.id}`}
          style={{
            display: "block",
            padding: "14px 16px",
            borderRadius: 10,
            background: "#4c3fd6",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {completedIds && completedIds.size > 0 ? "Continue learning" : "Start here"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{nextUp.title}</div>
        </Link>
      )}

      {units.map((unit) => {
        const completedInUnit = unit.lessons.filter((l) => statusOf(l, completedIds) === "completed").length;
        const progress = unit.lessons.length > 0 ? completedInUnit / unit.lessons.length : 0;

        return (
          <div key={unit.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: "0 0 6px" }}>{unit.title}</h2>
              <span style={{ fontSize: 13, opacity: 0.6 }}>
                {completedInUnit} / {unit.lessons.length}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "#e5e5ea", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress * 100}%`, background: "#4c3fd6" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {unit.lessons.map((lesson) => {
                const status = statusOf(lesson, completedIds);
                const record = effectiveCompletions?.get(lesson.id);

                const row = (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #e5e5ea",
                      opacity: status === "locked" ? 0.5 : 1,
                      background: status === "completed" ? "#faf8ff" : "transparent",
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 20, textAlign: "center" }}>
                      {status === "locked" ? "🔒" : status === "completed" ? "✓" : "▶"}
                    </span>
                    <span style={{ flex: 1 }}>{lesson.title}</span>
                    {status === "completed" && record && (
                      <Stars count={starsForPerformance(record.mistakes, record.hintsUsed)} />
                    )}
                  </div>
                );

                return status === "locked" ? (
                  <div key={lesson.id} aria-disabled="true">
                    {row}
                  </div>
                ) : (
                  <Link key={lesson.id} href={`/learn/${lesson.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    {row}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
