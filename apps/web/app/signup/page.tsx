"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type FormState } from "../actions";

const initialState: FormState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>Create an account</h1>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Birth year
          <input name="birthYear" type="number" required min={1900} max={new Date().getFullYear()} />
        </label>
        {state.error && (
          <p role="alert" style={{ color: "#b3261e" }}>
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
