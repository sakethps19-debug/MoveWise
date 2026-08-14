"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@movewise/db";
import { createSession, destroySession, getSession, hashPassword, verifyPassword } from "../lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_SIGNUP_AGE = 13;

export interface FormState {
  error?: string;
}

export async function signupAction(_prevState: FormState, formData: FormData): Promise<FormState> {
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

export async function completeLessonAction(lessonId: string, xpEarned: number): Promise<void> {
  const user = await getSession();
  if (!user) return; // guest: XP is session-local only, nothing to persist

  await prisma.lessonCompletion.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    update: { xpEarned },
    create: { userId: user.id, lessonId, xpEarned },
  });
  revalidatePath("/");
}
