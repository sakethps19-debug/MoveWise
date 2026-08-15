"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@movewise/db";
import { createSession, destroySession, getSession, hashPassword, verifyPassword } from "../lib/auth";
import { checkRateLimit, formatRetryAfter } from "../lib/rate-limit";
import { loadLesson } from "../lib/lessons";
import { computeMasteryStatus, type MasteryStatus } from "../lib/masteryModel";
import type { AttemptRecord } from "../components/LessonRunner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_SIGNUP_AGE = 13;

// Deliberately generous: this is meant to stop automated abuse, not slow
// down a real user retyping a mistyped password a few times, and every
// key here can collapse many real, unrelated users into one bucket —
// shared NAT (a school computer lab is exactly this product's audience)
// collapses by IP, and any deploy that doesn't sit behind a proxy
// setting x-forwarded-for collapses *every* visitor into the "unknown"
// bucket (see clientIp below). Generous limits are the only lever
// available against that until this moves to a real per-user/session
// signal — see lib/rate-limit.ts for why this is a stopgap, not the
// final answer.
const SIGNUP_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 }; // 20/hour per IP
const LOGIN_IP_LIMIT = { limit: 15, windowMs: 15 * 60 * 1000 }; // 15/15min per IP
const LOGIN_EMAIL_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000 }; // 8/15min per email, catches distributed attempts against one account

async function clientIp(): Promise<string> {
  const h = await headers();
  // First hop only — good enough for the abuse this stops (spoofing the
  // rest of the chain doesn't help an attacker bypass a limit keyed on
  // the value their own proxy/client sent first). Falls back to a
  // literal "unknown" when there's no x-forwarded-for at all (plain
  // `next dev`/`next start` with no reverse proxy in front) — every
  // visitor then shares that one bucket, which is the scenario the
  // comment above SIGNUP_LIMIT/LOGIN_IP_LIMIT is about.
  const forwardedFor = h.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

const MAX_GUEST_LESSONS = 200; // generous headroom over the current ~16 lessons

/**
 * Folds this browser's locally-stored guest progress (see
 * lib/guestProgress.ts) into the account that just signed up or signed
 * in — sent as a hidden form field so it lands in the same request that
 * creates the session, no separate round trip. Applies to both signup
 * and login: a guest who then signs into an *existing* account is
 * treated the same as one who just created it, since either way "this
 * browser's local progress" is the intent to carry it in. Uses the same
 * best-mistakes merge as completeLessonAction, so it can never downgrade
 * progress the account already has.
 *
 * Untrusted client input, so shape/type/range checked before any write —
 * this is form data an attacker fully controls, not app-generated state.
 */
async function migrateGuestProgress(userId: string, formData: FormData): Promise<void> {
  const raw = formData.get("guestProgress");
  if (typeof raw !== "string" || !raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof parsed !== "object" || parsed === null) return;

  const entries = Object.entries(parsed as Record<string, unknown>).slice(0, MAX_GUEST_LESSONS);

  for (const [lessonId, value] of entries) {
    if (!lessonId || typeof value !== "object" || value === null) continue;
    const { xpEarned, mistakes, hintsUsed } = value as { xpEarned?: unknown; mistakes?: unknown; hintsUsed?: unknown };
    if (typeof xpEarned !== "number" || typeof mistakes !== "number") continue;
    if (!Number.isFinite(xpEarned) || !Number.isFinite(mistakes)) continue;
    // hintsUsed is newer than the rest of this shape — older localStorage
    // blobs saved before it existed won't have it, so default rather than
    // drop the whole (still-valid) xpEarned/mistakes entry.
    const rawHints = typeof hintsUsed === "number" && Number.isFinite(hintsUsed) ? hintsUsed : 0;

    const clampedXp = Math.max(0, Math.min(10_000, Math.round(xpEarned)));
    const clampedMistakes = Math.max(0, Math.min(10_000, Math.round(mistakes)));
    const clampedHints = Math.max(0, Math.min(10_000, Math.round(rawHints)));

    const existing = await prisma.lessonCompletion.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const bestMistakes = existing ? Math.min(existing.mistakes, clampedMistakes) : clampedMistakes;
    const bestHintsUsed = existing ? Math.min(existing.hintsUsed, clampedHints) : clampedHints;

    await prisma.lessonCompletion.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { xpEarned: clampedXp, mistakes: bestMistakes, hintsUsed: bestHintsUsed },
      create: { userId, lessonId, xpEarned: clampedXp, mistakes: bestMistakes, hintsUsed: bestHintsUsed },
    });
  }
}

export interface FormState {
  error?: string;
}

export async function signupAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  const signupLimit = await checkRateLimit(`signup:${ip}`, SIGNUP_LIMIT.limit, SIGNUP_LIMIT.windowMs);
  if (!signupLimit.allowed) {
    return { error: `Too many signup attempts. Try again in ${formatRetryAfter(signupLimit.retryAfterMs!)}.` };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const birthYear = Number(formData.get("birthYear"));

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (!birthYear || birthYear < 1900 || birthYear > new Date().getFullYear()) {
    return { error: "Enter your birth year." };
  }

  // Conservative COPPA-aware gate: block signup outright for under-13s
  // rather than collecting a child's email/password without any real
  // verifiable-parental-consent flow in place. This is a year-only
  // approximation (no month/day), and birth year is used only for this
  // check — it isn't persisted, per data-minimization.
  const age = new Date().getFullYear() - birthYear;
  if (age < MIN_SIGNUP_AGE) {
    return {
      error:
        "MoveWise doesn't yet support account creation for users under 13 — that requires verifiable parental consent (COPPA), which isn't built yet.",
    };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  await createSession(user.id);
  await migrateGuestProgress(user.id, formData);
  redirect("/");
}

export async function loginAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const ip = await clientIp();
  const ipLimit = await checkRateLimit(`login-ip:${ip}`, LOGIN_IP_LIMIT.limit, LOGIN_IP_LIMIT.windowMs);
  const emailLimit = email
    ? await checkRateLimit(`login-email:${email}`, LOGIN_EMAIL_LIMIT.limit, LOGIN_EMAIL_LIMIT.windowMs)
    : { allowed: true as const };
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, emailLimit.retryAfterMs ?? 0);
    return { error: `Too many login attempts. Try again in ${formatRetryAfter(retryAfterMs)}.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }
  await createSession(user.id);
  await migrateGuestProgress(user.id, formData);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function deleteAccountAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "You must be signed in." };

  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect password." };
  }

  // Cascades to Session and LessonCompletion (see schema.prisma's
  // onDelete: Cascade on both relations) — one delete, nothing orphaned.
  await prisma.user.delete({ where: { id: user.id } });
  await destroySession(); // clears the cookie; the session row is already gone via the cascade above
  redirect("/");
}

export async function completeLessonAction(
  lessonId: string,
  xpEarned: number,
  mistakes: number,
  hintsUsed: number,
  attempts: AttemptRecord[],
): Promise<void> {
  const user = await getSession();
  if (!user) return; // guest: XP is session-local only, nothing to persist

  const existing = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });
  // Keep the best (lowest-mistake, lowest-hint) run's star rating — redoing
  // a mastered lesson sloppily shouldn't downgrade it.
  const bestMistakes = existing ? Math.min(existing.mistakes, mistakes) : mistakes;
  const bestHintsUsed = existing ? Math.min(existing.hintsUsed, hintsUsed) : hintsUsed;

  await prisma.lessonCompletion.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    update: { xpEarned, mistakes: bestMistakes, hintsUsed: bestHintsUsed },
    create: { userId: user.id, lessonId, xpEarned, mistakes, hintsUsed },
  });

  await recordAttemptsAndUpdateMastery(user.id, lessonId, attempts);
  revalidatePath("/");
}

/**
 * ADR-0008 / docs/learner-model.md's concrete first implementation step:
 * persist every attempt (not just the lesson-level aggregate), then
 * recompute UserConceptMastery for every concept this lesson teaches
 * from the learner's full attempt history on that concept — not just
 * this one lesson's attempts, so a concept taught across multiple
 * lessons (or revisited later) accumulates one real signal, not one per
 * lesson.
 */
async function recordAttemptsAndUpdateMastery(userId: string, lessonId: string, attempts: AttemptRecord[]): Promise<void> {
  if (attempts.length === 0) return;
  const lesson = loadLesson(lessonId);
  if (!lesson) return; // shouldn't happen — the lesson was just completed — but never let a lookup miss crash the completion flow

  const conceptIds = lesson.masteryTags;

  await prisma.exerciseAttempt.createMany({
    data: attempts.map((a) => ({
      userId,
      lessonId,
      stepId: a.stepId,
      conceptIds,
      correct: a.correct,
      wrongAnswerKey: a.wrongAnswerKey,
    })),
  });

  for (const conceptId of conceptIds) {
    const [existingMastery, history] = await Promise.all([
      prisma.userConceptMastery.findUnique({ where: { userId_conceptId: { userId, conceptId } } }),
      prisma.exerciseAttempt.findMany({
        where: { userId, conceptIds: { has: conceptId } },
        orderBy: { createdAt: "asc" },
        select: { correct: true },
      }),
    ]);

    const { status, exerciseConfidence } = computeMasteryStatus(
      (existingMastery?.status as MasteryStatus | undefined) ?? null,
      history,
    );

    await prisma.userConceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: { status, exerciseConfidence, lastPracticedAt: new Date() },
      create: { userId, conceptId, status, exerciseConfidence, lastPracticedAt: new Date() },
    });
  }
}
