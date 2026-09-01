export function ProgressBar({
  value,
  max,
  label,
  /** Real, confirmed gap this closes: a unit a rated learner bypassed via
   * placement evidence showed a bar that was empty except for literal
   * completions — indistinguishable from a genuinely untouched unit.
   * When set (to `value` + however many lessons are demonstrated-but-not-
   * completed), renders a second, lighter-toned fill from `value` out to
   * this point, so "already covered by evidence" reads as visually
   * distinct from both "done" and "not yet reached" at a glance. */
  secondaryValue,
}: {
  value: number;
  max: number;
  label: string;
  secondaryValue?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const secondaryPct =
    secondaryValue !== undefined && max > 0 ? Math.min(100, Math.max(0, (secondaryValue / max) * 100)) : null;
  return (
    <div
      className="mw-progress-track"
      role="progressbar"
      aria-valuenow={secondaryValue ?? value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      {secondaryPct !== null && <div className="mw-progress-fill mw-progress-fill--demonstrated" style={{ width: `${secondaryPct}%` }} />}
      <div className="mw-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
