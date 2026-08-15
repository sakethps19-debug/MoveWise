# ADR-0006: Remove the webpack `externals` workaround for `@movewise/db`

## Status
Accepted. Fixes a real production bug found during the first actual
deploy attempt (Vercel) — not a hypothetical, an app that returned a
500 on every request.

## Context
ADR-0002 added a webpack `externals` override so `@movewise/db` (and
its driver adapter) would be `require()`'d at runtime instead of bundled
by webpack, working around `better-sqlite3`'s native-binding lookup
breaking under webpack's path-rewriting during bundling.

ADR-0005 swapped the adapter to `@prisma/adapter-pg` (pure JS, TCP-based,
no native bindings) but left the `externals` override in place unchanged
— the original reason for it no longer applied, but nothing forced a
re-examination at the time, and the local build/dev/CI verification that
had always passed kept passing regardless (see Consequences).

The first real Vercel deploy built successfully but returned `500` on
every request. Runtime logs: `Error: require() of ES Module
/var/task/packages/db/...`. Root cause: `@movewise/db`'s `package.json`
declares `"type": "module"` (it's an ES Module), and Vercel's serverless
function runtime loads externalized dependencies via CommonJS
`require()` — which cannot load an ESM module at all, regardless of
Node version. This is a Vercel-runtime-specific loading behavior that a
local `next start` doesn't reproduce (confirmed directly: local
`next start` served the app fine even with the externals override still
in place), which is exactly why it went undetected through every local
build, every CI run, and every `pnpm dev` session this whole project.

## Decision
Removed the `webpack.externals` override entirely. Added `@movewise/db`
to `transpilePackages` alongside the other internal workspace packages,
so webpack bundles it normally like everything else. `pg` has no native
addons to break under bundling, so the reason this needed special
handling at all no longer exists.

## Consequences
- This is the concrete example ADR-0005's Consequences section
  anticipated only abstractly ("a real deploy is when [things] stop
  being a theoretical gap"). The specific lesson: **a successful
  `next build` and a working `next start` do not prove a Vercel
  deployment will work** — Vercel's serverless packaging/runtime differs
  from a plain Node process in ways that only surface against the real
  platform. Confirmed the fix the same way: rebuilt, ran `next start`
  locally (still passes, as expected — it never reproduced the bug),
  and separately ran a real Server Action (signup) against that
  production server to exercise the exact code path
  (`@movewise/db` import) that broke on Vercel. That's the strongest
  verification available without direct access to Vercel itself, which
  this environment's network policy blocks outright.
- No other package has this problem: `@movewise/chess-rules`,
  `@movewise/exercise-schema`, and `@movewise/engine` were already
  bundled via `transpilePackages` (not externals) and never hit this
  class of bug.
- If a future dependency genuinely needs to stay external (a real
  native-binding package, the original ADR-0002 scenario), re-adding a
  narrowly-scoped `externals` entry for *that* package is fine — the
  lesson here is "don't default to externalizing a workspace package
  without a concrete reason," not "never use externals."
