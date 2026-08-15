"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { signupAction, type FormState } from "../actions";
import { readGuestProgress } from "../../lib/guestProgress";
import { Button } from "../../components/ui/Button";

const initialState: FormState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
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
        <h1 className="mw-auth-title">Create an account</h1>
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
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="mw-field">
            <label className="mw-field-label" htmlFor="birthYear">Birth year</label>
            <input
              className="mw-input"
              id="birthYear"
              name="birthYear"
              type="number"
              required
              min={1900}
              max={new Date().getFullYear()}
            />
          </div>
          {state.error && (
            <p role="alert" className="mw-feedback mw-feedback--error">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} fullWidth>
            {pending ? "Creating account…" : "Sign up"}
          </Button>
        </form>
        <p className="mw-auth-footer">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
