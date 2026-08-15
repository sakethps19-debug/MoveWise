# ADR-0004: Hearts floor at zero with no lockout; stars from raw mistake count

## Status
Accepted (product/pedagogy decision made autonomously within engineering
scope — flagged here for product-owner review, not blocking on it, since
it's a small and easily-reversed default).
**Superseded in part by ADR-0007**: zero hearts now triggers a guided
recovery interstitial rather than an unbounded floor (the "floor at
zero, no lockout" principle itself is unchanged — recovery isn't a
lockout), and stars are computed from hint usage as well as mistakes
(`starsForPerformance`, replacing `starsForMistakes`).

## Context
The consolidated product brief asks for "hearts or attempts" (Section 9)
and "mastery stars" (Section 9) as engagement-system foundations, but
doesn't specify exact mechanics. The brief also explicitly warns:
"Gamification must support learning. Do not add manipulative mechanics
merely to increase screen time," and separately: don't clone Duolingo's
mechanics. The common hearts pattern in the category (Duolingo included)
locks the learner out of a lesson once hearts are depleted, until a
time-based refill or restart.

## Decision
Hearts (5 per lesson attempt) are a purely visual/motivational signal:
they lose one per wrong answer, floor at zero, and never block further
interaction — the learner can keep attempting the current exercise
regardless of how many hearts remain. Verified directly: 6 consecutive
wrong answers on one exercise still let the 7th (correct) answer register
normally.

Mastery stars are tiered from the mistake count on a lesson's best-ever
run: 0 mistakes → 3 stars, 1–2 → 2 stars, 3+ → 1 star. The raw `mistakes`
integer is what's persisted (`LessonCompletion.mistakes`); star tiers are
computed from it at display time (`apps/web/lib/mastery.ts`), not stored,
so the tiering rule can change later without a data migration. Re-completing
a lesson keeps the *lowest* mistake count across all attempts, so replaying
a mastered lesson sloppily doesn't downgrade its stars.

## Consequences
- This is a lower-pressure design than the category norm — appropriate for
  the stated 0–1200-rating, "approachable for younger learners" audience,
  but a genuine product judgment call, not a neutral technical default.
  If the product owner wants a harder gate (time-based lockout, forced
  lesson restart at zero hearts), that's a straightforward change
  localized to `LessonRunner`'s `advance()`/status handling — nothing
  about the hearts *data model* would need to change.
- Star tiers (0/1-2/3+ mistakes) are an initial guess, not user-tested.
  Cheap to retune since only `starsForMistakes()` encodes the thresholds.
