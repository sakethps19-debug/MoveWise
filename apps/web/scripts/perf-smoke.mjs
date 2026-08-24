/**
 * A load *smoke* check, not real load testing: a short burst of modest
 * concurrent traffic against a handful of key routes on a real
 * production build (`next start`, not `next dev` — dev mode's on-demand
 * per-route compilation makes concurrent-throughput numbers meaningless),
 * asserting there are no failed requests and no gross latency blowup.
 * Exists to catch a route that falls over or degrades badly under a
 * handful of concurrent users — not to characterize capacity, find a
 * breaking point, or tune performance. autocannon (not a custom HTTP
 * loop) so the numbers come from a real, widely-used load generator.
 *
 * Usage: node scripts/perf-smoke.mjs [baseUrl]
 * Defaults to http://localhost:3000 (this repo's playwright.config.ts /
 * `next start` default port). Exits non-zero, with a clear reason
 * printed, if any route fails the checks below.
 */
import autocannon from "autocannon";

const baseUrl = process.argv[2] ?? "http://localhost:3000";

// Guest-reachable GET routes only — no signup/login POSTs, so this
// script never creates accounts or touches the database beyond the
// read queries LearningPath/PlayRunner already make for a guest.
const ROUTES = ["/", "/login", "/signup", "/play"];

// Deliberately modest — this app has no production traffic history to
// size against, and the point is "does it fall over," not "how much can
// it take." 10 concurrent connections for 8s per route.
const CONNECTIONS = 10;
const DURATION_SECONDS = 8;

// Generous on purpose (see file comment) — this is a real production
// build, so tighter than performance.spec.ts's dev-mode budgets, but
// still meant to catch "an order of magnitude slower," not to tune.
const P99_LATENCY_BUDGET_MS = 2_000;

async function runRoute(path) {
  const url = `${baseUrl}${path}`;
  const result = await autocannon({
    url,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
  });

  const nonOkCount = Object.entries(result.statusCodeStats ?? {})
    .filter(([code]) => Number(code) >= 400)
    .reduce((sum, [, stats]) => sum + stats.count, 0);

  const problems = [];
  if (result.errors > 0) problems.push(`${result.errors} connection error(s)`);
  if (result.timeouts > 0) problems.push(`${result.timeouts} timeout(s)`);
  if (nonOkCount > 0) problems.push(`${nonOkCount} non-2xx/3xx response(s)`);
  if (result.latency.p99 > P99_LATENCY_BUDGET_MS) {
    problems.push(`p99 latency ${result.latency.p99}ms exceeds ${P99_LATENCY_BUDGET_MS}ms budget`);
  }

  const status = problems.length === 0 ? "OK" : "FAIL";
  console.log(
    `[${status}] ${path} — ${result.requests.total} requests, ` +
      `${result.throughput.average.toFixed(0)} B/s avg, ` +
      `latency avg=${result.latency.average}ms p99=${result.latency.p99}ms`,
  );
  for (const problem of problems) console.log(`         ${problem}`);

  return problems.length === 0;
}

let allOk = true;
for (const path of ROUTES) {
  const ok = await runRoute(path);
  allOk = allOk && ok;
}

if (!allOk) {
  console.error("\nperf-smoke: one or more routes failed their budget — see above.");
  process.exit(1);
}
console.log("\nperf-smoke: all routes within budget.");
