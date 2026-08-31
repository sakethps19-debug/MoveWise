"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildTodayPlan, type TodayPlanInput, type TodayStep } from "../lib/todayPlan";
import { readOnboardingAnswers } from "../lib/onboarding";
import type { DailyMinutes } from "../lib/onboarding";

const BUDGETS: DailyMinutes[] = [5, 10, 20];
const BUDGET_KEY = "movewise_today_budget";

function readSavedBudget(): DailyMinutes | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BUDGET_KEY);
    const n = raw ? Number(raw) : NaN;
    return n === 5 || n === 10 || n === 20 ? (n as DailyMinutes) : null;
  } catch {
    return null;
  }
}

function saveBudget(minutes: DailyMinutes): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUDGET_KEY, String(minutes));
  } catch {
    // ignore
  }
}

const STEP_ICON: Record<TodayStep["id"], string> = {
  "warm-up": "☀️",
  review: "🔁",
  learn: "📘",
  practice: "🧩",
  play: "♟️",
  reflect: "🔍",
};

/**
 * P1 "build the Today experience": the concrete daily plan produced by
 * lib/todayPlan.ts's buildTodayPlan, rendered as a short, ordered list —
 * "what should I do today", not a wall of cards. A client component (not
 * a server one) for two honest reasons: the duration budget and the
 * onboarding goal/experience it personalizes copy from are both
 * client-only, localStorage-held signals (lib/onboarding.ts's own doc
 * comment explains why — never gates content, so never worth a server
 * round-trip), and "replace this activity" needs to react instantly. Every
 * other signal (`input` below) is real, server-computed evidence passed
 * in as a prop from app/page.tsx — this component only decides layout and
 * the two client-only inputs, never invents progress data of its own.
 */
export function TodayPlan({
  input,
}: {
  /** Everything except minutesBudget/goal/experience — those three are resolved here from localStorage (client-only, never gating). */
  input: Omit<TodayPlanInput, "minutesBudget" | "goal" | "experience">;
}) {
  const [budget, setBudget] = useState<DailyMinutes>(10);
  const [goal, setGoal] = useState<TodayPlanInput["goal"]>(null);
  const [experience, setExperience] = useState<TodayPlanInput["experience"]>(null);
  const [swapped, setSwapped] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const onboarding = readOnboardingAnswers();
    setBudget(readSavedBudget() ?? onboarding?.minutesPerDay ?? 10);
    setGoal(onboarding?.goal ?? null);
    setExperience(onboarding?.experience ?? null);
    setMounted(true);
  }, []);

  // Server's very first paint has no localStorage to read yet — render
  // nothing rather than a flash of the wrong budget/goal, same hydration-
  // safe pattern as useEffectiveCompletions.ts/useDemonstratedConcepts.ts.
  if (!mounted) return null;

  const plan = buildTodayPlan({ ...input, minutesBudget: budget, goal, experience });

  return (
    <div className="mw-today-card">
      <div className="mw-today-head">
        <div>
          <h2 className="mw-today-title">Today&apos;s plan</h2>
          <p className="mw-today-subtitle">
            {plan.allDone ? "All done for today." : `${plan.steps.length} thing${plan.steps.length === 1 ? "" : "s"}, about ${plan.totalEstimatedMinutes} min.`}
          </p>
        </div>
        <div className="mw-today-budget" role="group" aria-label="How much time do you have today?">
          {BUDGETS.map((b) => (
            <button
              key={b}
              type="button"
              className={`mw-today-budget-btn${budget === b ? " mw-today-budget-btn--active" : ""}`}
              aria-pressed={budget === b}
              onClick={() => {
                setBudget(b);
                saveBudget(b);
              }}
            >
              {b} min
            </button>
          ))}
        </div>
      </div>

      {plan.allDone ? (
        <div className="mw-today-empty">
          <p className="mw-today-empty-title">Nice work today 🎉</p>
          {plan.nextUpPreview && <p className="mw-today-empty-next">{plan.nextUpPreview}</p>}
        </div>
      ) : (
        <div className="mw-today-steps">
          {plan.steps.map((step) => {
            const showAlternate = step.id === "learn" && step.alternate && !swapped;
            const active = swapped && step.id === "learn" && step.alternate ? step.alternate : step;
            return (
              <div key={step.id}>
                <Link
                  href={active.href}
                  className={`mw-today-step${step.done ? " mw-today-step--done" : ""}`}
                >
                  <span className="mw-today-step-check" aria-hidden="true">
                    {step.done ? "✓" : STEP_ICON[step.id]}
                  </span>
                  <span className="mw-today-step-body">
                    <span className="mw-today-step-title">{active.title}</span>
                    <span className="mw-today-step-reason">{active.reason}</span>
                  </span>
                  <span className="mw-today-step-time">{step.estimatedMinutes} min</span>
                </Link>
                {showAlternate && (
                  <button type="button" className="mw-today-step-swap" onClick={() => setSwapped(true)}>
                    Something else instead →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
