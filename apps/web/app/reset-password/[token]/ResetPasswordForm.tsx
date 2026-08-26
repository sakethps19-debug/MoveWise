"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type FormState } from "../../actions";
import { Button } from "../../../components/ui/Button";
import { PasswordField } from "../../../components/ui/PasswordField";

const initialState: FormState = {};
const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <div className="mw-auth-card">
      <div className="mw-auth-brand">
        <span className="mw-nav-mark" aria-hidden="true">M</span>
        <span className="mw-nav-wordmark">MoveWise</span>
      </div>
      <h1 className="mw-auth-title">Choose a new password</h1>
      <form action={formAction} className="mw-auth-form">
        <input type="hidden" name="token" value={token} />
        <PasswordField
          id="password"
          name="password"
          label="New password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          helpText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        {state.error && (
          <p role="alert" className="mw-feedback mw-feedback--error">
            {state.error}
            {state.error.startsWith("This reset link") && (
              <>
                {" "}
                <Link href="/forgot-password">Request a new link</Link>.
              </>
            )}
          </p>
        )}
        <Button type="submit" disabled={pending} fullWidth>
          {pending ? "Saving…" : "Reset password"}
        </Button>
      </form>
      <p className="mw-auth-footer">
        <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
