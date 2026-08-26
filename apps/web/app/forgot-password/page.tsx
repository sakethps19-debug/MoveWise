"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type RequestPasswordResetState } from "../actions";
import { Button } from "../../components/ui/Button";

const initialState: RequestPasswordResetState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <main className="mw-auth-shell">
      <div className="mw-auth-card">
        <div className="mw-auth-brand">
          <span className="mw-nav-mark" aria-hidden="true">M</span>
          <span className="mw-nav-wordmark">MoveWise</span>
        </div>
        <h1 className="mw-auth-title">Reset your password</h1>
        {state.message ? (
          <>
            <p role="status" className="mw-auth-success">
              {state.message}
            </p>
            {state.devResetLink && (
              <p className="mw-field-rationale">
                Development only — no email service is configured yet, so here&apos;s the real link:{" "}
                <Link href={state.devResetLink}>Reset your password</Link>.
              </p>
            )}
          </>
        ) : (
          <form action={formAction} className="mw-auth-form">
            <p className="mw-auth-benefits">
              Enter the email you signed up with and we&apos;ll send you a link to set a new password.
            </p>
            <div className="mw-field">
              <label className="mw-field-label" htmlFor="email">
                Email
              </label>
              <input className="mw-input" id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {state.error && (
              <p role="alert" className="mw-feedback mw-feedback--error">
                {state.error}
              </p>
            )}
            <Button type="submit" disabled={pending} fullWidth>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mw-auth-footer">
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
