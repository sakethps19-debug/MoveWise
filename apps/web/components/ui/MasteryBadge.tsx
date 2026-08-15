import type { MasteryStatus } from "../../lib/masteryModel";
import { PROFICIENT_STATUSES } from "../../lib/masteryModel";

const LABELS: Record<MasteryStatus, string> = {
  "not-started": "Not started",
  learning: "Learning",
  practising: "Practising",
  "ready-for-assessment": "Ready for assessment",
  proficient: "Proficient",
  mastered: "Mastered",
  "revision-due": "Revision due",
  struggling: "Needs review",
  recovered: "Recovered",
};

function variantFor(status: MasteryStatus): "success" | "warning" | "error" | "neutral" {
  if (status === "struggling") return "error";
  if (status === "revision-due") return "warning";
  if (PROFICIENT_STATUSES.has(status)) return "success";
  return "neutral";
}

/** Renders nothing for "not-started" — same as before, no badge until there's real evidence. */
export function MasteryBadge({ status }: { status: MasteryStatus | undefined }) {
  if (!status || status === "not-started") return null;
  return <span className={`mw-badge mw-badge--${variantFor(status)}`}>{LABELS[status]}</span>;
}
