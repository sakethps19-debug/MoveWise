/**
 * Parses an optional numeric env-var override, falling back to `fallback`
 * only when the value is genuinely unset, empty, or non-numeric — not
 * merely falsy. `Number(raw) || fallback` looks equivalent but silently
 * discards an explicit "0" (a real, meaningful override, e.g. "block
 * everything") since 0 is falsy in JS; `Number("")` is also 0, not NaN,
 * so an empty-string env var (as common in practice as an unset one)
 * needs its own check too.
 */
export function parseEnvNumberOverride(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}
