# MoveWise — Phase 0: Discovery & Design (v2, post-audit)

## 0. Audit method and a sandbox limitation worth flagging

I extracted `movewise-prototype-source_tar.gz`, read every source file, and attempted `npm install` / a local run. Install failed with a `403` from the npm registry — this sandbox has **no network egress**, not a problem with your project. I could not execute `npm run dev` or the build here as a result. What follows is a complete **static** audit (full read of every `.ts`/`.tsx` file, the CSS, the test, and the build config) rather than a runtime-verified one. If you want a runtime-verified check too, that needs to happen somewhere with registry access — happy to write you a short verification checklist to run there.

That said, the static read was enough to reach firm conclusions on every item you asked about, because the codebase is small (one main component, one worker script, one CSS file) and self-contained.

## 1. Repository assessment (real, code-level)

**The most important finding first:** this prototype isn't a plain Next.js app. It's scaffolded on **`vinext`** (Cloudflare's Next-on-Workers runtime) and built through **OpenAI's "Sites" hosting platform** — `app/chatgpt-auth.ts` implements OpenAI's dispatch-owned "Sign in with ChatGPT" flow, `.openai/hosting.json`-style Cloudflare D1/R2 bindings are wired in `worker/index.ts` and `db/index.ts`, and the whole build/install/test lifecycle (`scripts/sites-env.sh`, `scripts/build-verified.sh`, `scripts/validate-artifact.sh`, `wrangler`) is specific to that hosting product. **None of this build/deploy/auth harness should carry forward** — it's a different platform than the Next.js-on-Postgres architecture the brief calls for, and keeping it would quietly lock the product into OpenAI Sites hosting and ChatGPT-account auth instead of your own. This is a **product-owner decision to confirm explicitly**, since it changes what "the prototype already proved out" means: it proved out the *game/coaching logic*, not the *hosting story*.

With that separated out, here's what the actual application logic looks like — one client component, `app/page.tsx`, at 1,265 lines, holding all state, Stockfish wiring, coaching heuristics, and rendering together.

### Reusable as-is (logic/pattern, not the file itself)
- **Legal move handling** — uses `chess.js` (`^1.4.0`) via `game.moves({square, verbose: true})` for legal-destination highlighting, `game.move()` for execution, and `isCheckmate()/isStalemate()/isThreefoldRepetition()/isInsufficientMaterial()/isDrawByFiftyMoves()` for end-of-game detection. This is exactly the API surface the recommended `chess-rules` package should wrap — solid choice, keep it.
- **Stockfish integration** — a single-threaded WASM build (`stockfish-18-lite-single.js/.wasm`, GPLv3) loaded in a `Worker`, driven by hand-rolled UCI messages (`uci`, `setoption`, `position fen`, `go depth`) with a one-job-at-a-time queue (`engineJobRef`) that resolves/rejects a promise per analysis request. This is a clean, already-correct pattern — port it into the recommended `engine` package essentially unchanged, just move it out of the component and behind a typed interface (`evaluate`, `bestMove`).
- **Hint escalation** — `hintLevel` 0→3 (restate the idea → highlight the piece → show an arrow to the destination → reveal the full solution) is already implemented and matches the brief's 4-stage hint model almost exactly. Port the *shape* directly into the exercise schema's `hints` field.
- **Retry functionality** — `retryLesson()` reloads the pre-mistake FEN and clears state cleanly; matches the "retry from mistake" requirement and generalizes well to lesson exercises.
- **Board interaction primitives** — the board is *not* using `react-chessboard`'s interactive board (that package is used only for its `defaultPieces` SVG set); the grid, click-to-select, legal-destination dots, last-move highlight, and per-square `aria-label`/`aria-pressed` are hand-built. This is a good accessibility baseline to build the new board component from — worth preserving as a pattern even though the component itself needs to be rebuilt as a reusable, headless-ish piece.
- **Coaching-heuristic library** — `buildLesson`/`coachMessageForMove` map centipawn loss + tactical pattern detection (mate-in-one reply available, piece left hanging, missed capture, missed check, early queen move) into specific English explanations. Not directly reusable as *lesson* feedback (it's built for freeform full games, not authored exercises), but it's a strong reference for the misconception-specific feedback the brief requires — worth mining for Practice-mode post-game analysis and as a style guide.

### Must be rebuilt, not extended
- **Everything lives in one 1,265-line client component.** State, engine wiring, coaching text generation, and JSX are fully entangled. This directly violates the brief's "don't bury content in large components" / "scalable to hundreds of lessons" requirements and cannot be incrementally patched into the Learn/Practice/Play structure — it needs to be decomposed into the packages described in Section 3 before any real lesson content is added.
- **No data persistence at all.** `db/schema.ts` is intentionally empty (`export {}`); the Cloudflare D1 binding in `db/index.ts` is wired but nothing uses it. The only "progress" is a lesson counter in `localStorage`. The entire relational data model (Section 4) needs to be built from nothing — there's no schema debt to migrate, which is actually a small silver lining.
- **No accounts.** `chatgpt-auth.ts` only reads identity headers injected by OpenAI's Sites platform (`oai-authenticated-user-email` etc.) — there's no login flow of our own here to reuse, and it shouldn't be, per the decision above.
- **No meaningful automated tests.** The single test (`tests/rendered-html.test.mjs`) asserts that a dev-preview `<meta>` tag is present in server-rendered HTML — it does not test chess rules, coaching logic, or any interaction. Every testing requirement in the brief (legal/illegal move tests, exercise schema validation, E2E, accessibility) starts from zero.
- **CSS is a single untokenized 1,002-line stylesheet** with two breakpoints (900px, 520px) and no evident design-token system. Fine as a *tone/palette* reference, not as a base to extend — rebuild with tokens per the frontend-design approach rather than growing this file further.

### Not reusable / to discard outright
- The entire `vinext`/Cloudflare Workers/Wrangler/OpenAI-Sites build-and-auth harness (`worker/index.ts`, `build/sites-vite-plugin.ts`, `scripts/*`, `.npmrc` tuned for that platform's cache, `examples/d1/`). None of it is wrong, it's just a different product's infrastructure than the one specified in the brief.

## 2. Recommended architecture (confirmed, with one change)

Unchanged from the original proposal, **plus** an explicit call-out: **do not build on `vinext`/Cloudflare Workers-via-OpenAI-Sites.** Target a standard Next.js (App Router) + TypeScript app, deployed to Vercel or self-hosted Node, with your own Postgres (Prisma) and your own auth (Auth.js/Clerk/Supabase) — as originally planned. The prototype's chess/engine/coaching *logic* moves over; its *hosting and auth plumbing* does not.

- **Chess rules:** `chess.js` — validated by the prototype's working use, keep it.
- **Engine:** the prototype's Stockfish WASM build + Worker + UCI job-queue pattern — port near-verbatim into `packages/engine`.
- **Everything else** (Next.js/Prisma/Postgres/Auth.js/Vitest/Playwright/GitHub Actions) as in the original Section 2 — no changes needed there; the prototype didn't use any of it, so there's nothing to reconcile.

## 3. Proposed folder structure (unchanged from v1, now with migration mapping)

```
movewise/
  apps/web/                 # Next.js app — NEW, replaces vinext/page.tsx entirely
  packages/
    chess-rules/            # NEW package, thin wrapper — PORTS chess.js usage from page.tsx
    engine/                 # NEW package — PORTS the Worker/UCI job-queue from page.tsx almost unchanged
    exercise-engine/        # NEW — renders exercise types; hint-escalation pattern PORTED from hintLevel logic
    exercise-schema/        # NEW — zod schema + validators
    content/units/          # NEW — lesson data
    gamification/           # NEW — XP/streak/hearts/mastery; only prior art is the localStorage lesson counter
    db/                     # NEW — Prisma schema, migrations (prototype's db/schema.ts was empty)
    analytics/              # NEW
  docs/
    ...
    adr/0001-discard-vinext-hosting-harness.md   # NEW — record the Section 1 decision formally
```

## 4. Database & lesson-schema outline

No changes from v1 (see below) — there was no existing schema to reconcile with.

### Relational data model (high level)
- `users`, `profiles`
- `courses`, `course_versions`
- `units`, `lessons`, `lesson_versions`
- `exercises` (belongs to a lesson_version, ordered)
- `concepts`/`skills`, `lesson_concepts`
- `lesson_attempts`, `exercise_attempts`, `completions`
- `user_skill_mastery`
- `xp_transactions`, `streaks`, `achievements`, `user_achievements`
- `practice_recommendations`
- `saved_games`, `analysed_moves`
- `content_sources`, `audit_logs`

`lesson_versions`/`course_versions` are immutable once published; attempts reference a specific version id, so editing a lesson never rewrites history.

### Lesson content schema (Zod, conceptually)

```ts
LessonSchema = {
  id: string; version: number; unitId: string; title: string;
  objectives: string[]; prerequisites: string[];
  steps: ExerciseStep[];
  xpReward: number; masteryTags: string[];
  difficulty: 1 | 2 | 3; estimatedDurationSec: number;
}

ExerciseStep =
  | { type: "explain"; text: string; boardFen?: string; highlights?: Square[] }
  | { type: "select-square"; fen: string; correctSquares: Square[]; hints: Hint[]; feedback: FeedbackMap }
  | { type: "move-piece"; fen: string; expectedMoves: string[]; altValid: string[]; hints: Hint[]; feedback: FeedbackMap }
  | { type: "capture"; fen: string; expectedMoves: string[]; feedback: FeedbackMap }
  | { type: "find-legal-move"; fen: string; validMoves: string[]; feedback: FeedbackMap }
  | { type: "mcq"; prompt: string; options: string[]; correctIndex: number; feedback: FeedbackMap }
  | { type: "true-false"; prompt: string; correct: boolean; feedback: FeedbackMap }
  | { type: "order-steps"; items: string[]; correctOrder: number[] }
  | { type: "find-check" | "find-checkmate"; fen: string; correctSquares: Square[]; feedback: FeedbackMap }
  | { type: "guided-sequence"; fen: string; forcedReplies: string[]; playerMoves: string[] }
  | { type: "mini-game"; fen: string; objective: string; winCondition: string }
  | { type: "review"; summary: string }
```

Hint objects follow the prototype's proven 4-stage shape: `{ level: 1, text }` (restate objective) → `{ level: 2, highlightSquares }` → `{ level: 3, arrow: {from, to} }` → `{ level: 4, solutionText }`.

Every FEN + expected-move pair is validated at CI time against `chess-rules` (legality check) — required, since the prototype had zero such validation.

## 5. UX structure

Unchanged from v1: bottom tabs (Learn/Practice/Play/Progress/Profile), vertical Learn path, single-focus lesson screen, non-color-only board states. Worth explicitly preserving from the prototype: its per-square `aria-label` pattern (`"e4, white pawn"` / `"e5, empty"`) and `aria-pressed` on the selected square — carry that convention into the new board component.

## 6. Migration plan (new — from prototype to target architecture)

1. Do **not** fork the prototype repo forward. Start the new monorepo clean (Section 3), and copy code *into* it deliberately, file by file, per the reuse list in Section 1 — not via `git subtree`/wholesale copy, since ~80% of the repo (hosting harness) shouldn't come along.
2. Port `chess.js` usage into `packages/chess-rules` first; write the legal/illegal-move unit tests the prototype never had.
3. Port the Worker + UCI job-queue into `packages/engine`, same tests treatment.
4. Extract the hint-escalation and coaching-heuristic logic into reference material for `exercise-schema`/`exercise-engine` design — rewritten, not copy-pasted, since it needs to serve authored lessons rather than freeform games.
5. Rebuild the board as a standalone component in `apps/web`, preserving the aria-label/aria-pressed convention noted above.
6. Everything else (routing, data model, gamification, auth) is new build, not migration.
7. The prototype's coached-freeform-game mode becomes the seed for **Play mode** in Phase 4 — not Phase 1. Don't build it early just because it already exists; Phase 1 is Learn-only per the brief.

## 7. Phase 1 implementation plan (Learning MVP)

1. Scaffold monorepo, CI (lint/typecheck/test/build).
2. Build `chess-rules` and `engine` packages (ported logic + new tests, per Section 6).
3. Build `exercise-schema` + CI validation script (FEN legality, reachable success state, hint/solution consistency) — the prototype had none of this, so it's built from scratch, not migrated.
4. Build `exercise-engine` renderer for the exercise types "Meet the Pieces" needs (explain, select-square, move-piece, capture, mcq, true-false, review).
5. Author the 12 "Meet the Pieces" lessons as data.
6. Build the Learn home path UI (guest/local-progress only, no auth).
7. Build gamification primitives (XP, hearts, mastery stars) as pure functions with tests — only prior art is the prototype's single `localStorage` counter, which doesn't carry forward as-is.
8. Accessibility pass (start from the prototype's aria-label/aria-pressed pattern) + responsive QA (small phone / large phone / desktop).
9. E2E test walking the full 12-lesson unit start to finish.
10. Write PRD, architecture doc (including ADR-0001 recording the "discard the OpenAI-Sites/vinext harness" decision), curriculum architecture, content-authoring guide stub, content-source register.

## 8. Risks & open decisions (need product-owner input)

- **Confirm discarding the OpenAI Sites/vinext/Cloudflare-Workers hosting harness.** This is the one material decision the audit surfaced: if there's a reason the product needs to stay on that hosting platform (e.g., distribution inside ChatGPT), the target architecture in Section 2 changes substantially — Postgres/Prisma/Auth.js assume a normal Node/Vercel deployment, not Cloudflare Workers + D1 + SIWC. Please confirm before Phase 1 scaffolding starts, since it affects the very first commits.
- **Child-safety/age scope** (carried over from v1, still unresolved): "age-neutral" is stated but ChessKid and parental consent are also referenced — need a decision on whether under-13 users are in scope for Phase 1, since it changes data-collection and consent requirements.
- **Runtime verification of the prototype** wasn't possible in this sandbox (no network egress for `npm install`). The static audit is thorough but if you want a live-run smoke test before Phase 1 starts, that needs an environment with registry access.
- Chess-rules-library choice, auth provider, hosting/DB provider, guest-progress storage mechanism: unchanged from v1, still open but lower-stakes than the two items above.

## 9. Acceptance criteria — "Meet the Pieces" unit (first release)

Unchanged from v1:
- All 12 lessons present, each completable in ~3–5 minutes, each covering only 1–2 new concepts.
- Every exercise's FEN is chess-legal; every expected move and declared alternative is legal; automated validation passes in CI for 100% of exercises.
- Every exercise has a reachable success path.
- Wrong-answer feedback is misconception-specific everywhere an exercise can be answered wrong.
- Hints escalate through the 4 defined stages (pattern proven in the prototype, reimplemented for authored exercises).
- White/black contrast and selected/legal/correct/incorrect states pass a manual color-blindness check (not color-only).
- Full unit completable via keyboard only, with screen-reader labels on every interactive board square/control (prototype's aria pattern as the starting convention).
- Lesson completion persists to local guest storage and survives a reload.
- XP and mastery stars update correctly after each lesson and the unit mastery challenge.
- E2E suite walks all 12 lessons end to end unattended.
- Responsive check passes on ~360px, ~390–430px, tablet, and desktop.
- Content-source register includes an entry per lesson noting pedagogical inspiration.

---

**Next step:** once the two flagged decisions (hosting-platform discard, child-safety scope) are confirmed, I'll proceed directly into Phase 1 scaffolding per the brief.
