# ADR-0001: Discard the prototype's OpenAI-Sites/vinext hosting harness

## Status
Accepted (decided autonomously per explicit product-owner delegation, August 2026).

## Context
The MoveWise prototype was scaffolded on `vinext` (Cloudflare's Next-on-Workers
runtime), deployed via OpenAI's "Sites" hosting product, with Cloudflare D1/R2
bindings and a "Sign in with ChatGPT" (SIWC) auth stub (`app/chatgpt-auth.ts`).
The chess rules (chess.js) and Stockfish engine integration inside that
prototype are sound and are being ported forward (see Phase 0 audit doc); the
hosting/build/auth harness around them is specific to that platform.

The product goal is to become the #1 global chess-learning app across all
ages and levels — that implies our own auth/accounts, our own data ownership,
and a deployment story not coupled to a third-party chat-assistant hosting
product.

## Decision
Rebuild on a standard Next.js (App Router) + TypeScript application, deployed
to Vercel or self-hosted Node, with our own PostgreSQL database (Prisma) and
our own authentication (Auth.js/Clerk/Supabase — TBD in a later ADR). None of
`worker/index.ts`, `build/sites-vite-plugin.ts`, `scripts/sites-env.sh`,
`.openai/hosting.json`-style bindings, or `app/chatgpt-auth.ts` carry forward.

## Consequences
- We lose nothing in game logic — chess.js and the Stockfish Worker/UCI
  pattern port cleanly into `packages/chess-rules` and `packages/engine`
  regardless of hosting platform.
- We gain full control over auth, data residency, and deployment — required
  for COPPA-aware handling of under-13 users (see the "all ages" product
  goal) and for eventual i18n/multi-region deployment.
- We take on standing up Postgres/Prisma/auth from scratch, since the
  prototype had no working data layer to migrate (`db/schema.ts` was empty).
