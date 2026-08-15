"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { loginAction, type FormState } from "../actions";
import { readGuestProgress } from "../../lib/guestProgress";

const initialState: FormState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const guestProgressRef = useRef<HTMLInputElement>(null);

  // Populated on mount, read by the server action at submit time — see
  // migrateGuestProgress in app/actions.ts.
  useEffect(() => {
    if (guestProgressRef.current) {
      guestProgressRef.current.value = JSON.stringify(readGuestProgress());
    }
  }, []);

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>Sign in</h1>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="hidden" name="guestProgress" ref={guestProgressRef} />
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        {state.error && (
          <p role="alert" style={{ color: "#b3261e" }}>
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>
        Don't have an account? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
