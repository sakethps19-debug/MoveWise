"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { loginAction, type FormState } from "../actions";
import { readGuestProgress } from "../../lib/guestProgress";
import { Button } from "../../components/ui/Button";

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
    <main className="mw-auth-shell">
      <div className="mw-auth-card">
        <div className="mw-auth-brand">
          <span className="mw-nav-mark" aria-hidden="true">M</span>
          <span className="mw-nav-wordmark">MoveWise</span>
        </div>
        <h1 className="mw-auth-title">Sign in</h1>
        <form action={formAction} className="mw-auth-form">
          <input type="hidden" name="guestProgress" ref={guestProgressRef} />
          <div className="mw-field">
            <label className="mw-field-label" htmlFor="email">Email</label>
            <input className="mw-input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="mw-field">
            <label className="mw-field-label" htmlFor="password">Password</label>
            <input
              className="mw-input"
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          {state.error && (
            <p role="alert" className="mw-feedback mw-feedback--error">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} fullWidth>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mw-auth-footer">
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
