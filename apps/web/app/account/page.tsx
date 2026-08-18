"use client";

import { useActionState } from "react";
import Link from "next/link";
import { deleteAccountAction, type FormState } from "../actions";

const initialState: FormState = {};

export default function AccountPage() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, initialState);

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
      <h1>Account</h1>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Export your data</h2>
        <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>
          Downloads a JSON file with your account details and lesson completions.
        </p>
        <a href="/account/export" style={{ alignSelf: "flex-start" }}>
          Download my data
        </a>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0, color: "#b3261e" }}>Delete your account</h2>
        <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>
          Permanently deletes your account and all lesson progress. This can&apos;t be undone.
        </p>
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!window.confirm("Delete your account and all progress? This can't be undone.")) {
              e.preventDefault();
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Confirm your password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          {state.error && (
            <p role="alert" style={{ color: "#b3261e" }}>
              {state.error}
            </p>
          )}
          <button type="submit" disabled={pending} style={{ alignSelf: "flex-start", color: "#b3261e" }}>
            {pending ? "Deleting…" : "Delete my account"}
          </button>
        </form>
      </section>

      <p>
        <Link href="/">Back to learning path</Link>
      </p>
    </main>
  );
}
