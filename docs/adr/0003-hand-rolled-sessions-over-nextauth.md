# ADR-0003: Hand-rolled database sessions over an auth framework

## Status
Accepted (decided autonomously — reversible, no cost/data implications).
ADR-0001 flagged auth provider as "TBD in a later ADR"; this is that ADR.

## Context
Needed real accounts and persistence with no external OAuth credentials
available in this environment (no way to register a Google/GitHub OAuth
app, no secrets to inject). NextAuth v5 ("Auth.js") supports a Credentials
provider that doesn't need OAuth, so it was considered, but as of this
decision it's still in a long beta with a history of breaking API changes
across beta versions, and its Credentials provider forces a JWT session
strategy with its own conventions to learn correctly on the first try,
under the same offline-docs constraint noted in ADR-0002.

## Decision
Hand-rolled, database-backed opaque-token sessions instead:
`bcryptjs` for password hashing; a random 32-byte hex token as the session
identifier, stored in a `Session` table (`packages/db/prisma/schema.prisma`)
with an expiry, set as an httpOnly cookie. `apps/web/lib/auth.ts` is the
entire implementation — `hashPassword`, `verifyPassword`, `createSession`,
`getSession`, `destroySession` — about 60 lines, fully understood line by
line rather than delegated to a framework's internals.

## Consequences
- **Not a JWT.** The cookie carries no data, just a lookup key — trivially
  revocable (delete the `Session` row) and there's no signing-secret
  management, at the cost of a DB read on every authenticated request
  (acceptable at this scale; would need a cache in front of it at real
  traffic).
- **No OAuth/social login.** Email+password only. Adding a provider later
  is additive (a new `Session`-compatible flow), not a rewrite.
- **No role/permission system yet.** Every `User` row is implicitly a
  "learner" — there's no admin/author/reviewer role, which the brief's
  authoring-portal plan (Section 14) will need. Adding a `role` column to
  `User` is a small additive migration when that's built; it doesn't
  require replacing the session mechanism.
- **Rate limiting is not implemented.** `loginAction`/`signupAction` have no
  attempt throttling — flagged in `docs/known-risks.md`, not addressed here.
