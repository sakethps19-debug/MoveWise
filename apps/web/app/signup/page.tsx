"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signupAction, type FormState } from "../actions";
import { readGuestProgress } from "../../lib/guestProgress";
import { Button } from "../../components/ui/Button";
import { PasswordField } from "../../components/ui/PasswordField";

const initialState: FormState = {};
const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const guestProgressRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");

  // Populated on mount, read by the server action at submit time — see
  // migrateGuestProgress in app/actions.ts.
  useEffect(() => {
    if (guestProgressRef.current) {
      guestProgressRef.current.value = JSON.stringify(readGuestProgress());
    }
  }, []);

  // Same shape as the server's own check (actions.ts's EMAIL_RE) — this
  // is purely an immediate visual cue while typing, not a substitute for
  // that real server-side validation.
  const emailLooksValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email]);
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <main className="mw-auth-shell">
      <div className="mw-auth-card">
        <div className="mw-auth-brand">
          <span className="mw-nav-mark" aria-hidden="true">M</span>
          <span className="mw-nav-wordmark">MoveWise</span>
        </div>
        <h1 className="mw-auth-title">Create an account</h1>
        <p className="mw-auth-benefits">
          Save your lesson progress and hearts across devices, track your improvement over time, and get practice and
          lesson recommendations built from your own games and mistakes.
        </p>
        <form action={formAction} className="mw-auth-form">
          <input type="hidden" name="guestProgress" ref={guestProgressRef} />
          <div className="mw-field">
            <label className="mw-field-label" htmlFor="email">
              Email
            </label>
            <input
              className="mw-input"
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-describedby="email-help"
            />
            {emailTouched && email.length > 0 && !emailLooksValid && (
              <p id="email-help" role="alert" className="mw-field-help mw-field-help--error">
                Enter a valid email address, like you@example.com.
              </p>
            )}
          </div>
          <PasswordField
            id="password"
            name="password"
            label="Password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            onValueChange={setPassword}
          />
          <ul className="mw-password-requirements" aria-label="Password requirements">
            <li className={`mw-password-requirement${passwordLongEnough ? " mw-password-requirement--met" : ""}`}>
              <span aria-hidden="true">{passwordLongEnough ? "✓" : "•"}</span>
              At least {MIN_PASSWORD_LENGTH} characters
            </li>
          </ul>
          <div className="mw-field">
            <label className="mw-field-label" htmlFor="birthYear">
              Birth year
            </label>
            <input
              className="mw-input"
              id="birthYear"
              name="birthYear"
              type="number"
              required
              min={1900}
              max={new Date().getFullYear()}
              aria-describedby="birthYear-rationale"
            />
            <p id="birthYear-rationale" className="mw-field-rationale">
              We only use this to confirm you&apos;re 13 or older, which current child-privacy rules (COPPA) require —
              it isn&apos;t stored on your account.
            </p>
          </div>
          {state.error && (
            <p role="alert" className="mw-feedback mw-feedback--error">
              {state.error}
              {state.error === "An account with that email already exists." && (
                <>
                  {" "}
                  <Link href="/login">Sign in instead</Link>.
                </>
              )}
            </p>
          )}
          <Button type="submit" disabled={pending} fullWidth>
            {pending ? "Creating account…" : "Sign up"}
          </Button>
        </form>
        <p className="mw-auth-footer">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
        <p className="mw-auth-policy-links">
          By signing up, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
