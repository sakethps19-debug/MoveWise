"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@movewise/db";
import { createSession, destroySession, getSession, hashPassword, verifyPassword } from "../lib/auth";
import { checkRateLimit, formatRetryAfter } from "../lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_SIGNUP_AGE = 13;

// Deliberately generous: this is meant to stop automated abuse, not slow
// down a real user retyping a mistyped password a few times. See
// lib/rate-limit.ts for why this is an in-memory stopgap, not the final
// answer.
const SIGNUP_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 }; // 5/hour per IP
const LOGIN_IP_LIMIT = { limit: 15, windowMs: 15 * 60 * 1000 }; // 15/15min per IP
const LOGIN_EMAIL_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000 }; // 8/15min per email, catches distributed attempts against one account

async function clientIp(): Promise<string> {
  const h = await headers();
  // First hop only — good enough for the abuse this stops (spoofing the
  // rest of the chain doesn't help an attacker bypass a limit keyed on
  // the value their own proxy/client sent first).
  const forwardedFor = h.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export interface FormState {
  error?: string;
}

export async function signupAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  const signupLimit = checkRateLimit(`signup:${ip}`, SIGNUP_LIMIT.limit, SIGNUP_LIMIT.windowMs);
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
  redirect("/");
}

export async function loginAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const ip = await clientIp();
  const ipLimit = checkRateLimit(`login-ip:${ip}`, LOGIN_IP_LIMIT.limit, LOGIN_IP_LIMIT.windowMs);
  const emailLimit = email
    ? checkRateLimit(`login-email:${email}`, LOGIN_EMAIL_LIMIT.limit, LOGIN_EMAIL_LIMIT.windowMs)
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
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function completeLessonAction(lessonId: string, xpEarned: number, mistakes: number): Promise<void> {
  const user = await getSession();
  if (!user) return; // guest: XP is session-local only, nothing to persist

  const existing = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });
  // Keep the best (lowest-mistake) run's star rating — redoing a mastered
  // lesson sloppily shouldn't downgrade it.
  const bestMistakes = existing ? Math.min(existing.mistakes, mistakes) : mistakes;

  await prisma.lessonCompletion.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    update: { xpEarned, mistakes: bestMistakes },
    create: { userId: user.id, lessonId, xpEarned, mistakes },
  });
  revalidatePath("/");
}
