"use client";

import { useActionState } from "react";
import { deleteAccountAction, type FormState } from "../app/actions";
import { Button } from "./ui/Button";

const initialState: FormState = {};

/**
 * The interactive half of /account — split out so the page itself can be
 * a server component that gates guests server-side (getSession/redirect,
 * the same pattern every other account-only route already uses) instead
 * of rendering this delete-account form, unstyled and un-gated, to
 * anyone who navigates here directly. deleteAccountAction itself already
 * rejects a guest ("You must be signed in."), so this was never a real
 * security gap — just a confusing, inconsistent one: no Nav, no design-
 * system styling, and no redirect for a learner who wasn't signed in.
 */
export function AccountDangerZone() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, initialState);

  return (
    <section className="mw-card" style={{ padding: "var(--mw-space-5)", display: "flex", flexDirection: "column", gap: "var(--mw-space-3)" }}>
      <h2 style={{ margin: 0, color: "var(--mw-error)" }}>Delete your account</h2>
      <p className="mw-page-subtitle" style={{ margin: 0 }}>
        Permanently deletes your account and all lesson progress. This can&apos;t be undone.
      </p>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!window.confirm("Delete your account and all progress? This can't be undone.")) {
            e.preventDefault();
          }
        }}
        style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-3)" }}
      >
        <div className="mw-field">
          <label className="mw-field-label" htmlFor="delete-password">
            Confirm your password
          </label>
          <input className="mw-input" id="delete-password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {state.error && (
          <p role="alert" className="mw-feedback mw-feedback--error">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="danger" disabled={pending} style={{ alignSelf: "flex-start" }}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </section>
  );
}
