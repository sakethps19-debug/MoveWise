"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { devResetProgressAction } from "../app/actions";
import { clearGuestProgress } from "../lib/guestProgress";
import { clearAllStartedLessons } from "../lib/lessonProgressUI";
import { Button } from "./ui/Button";

/**
 * Phase 4: "a clearly isolated development-only progress reset mechanism
 * ... do not expose developer controls in production." Guarded twice:
 * this component only renders where the caller checks
 * `process.env.NODE_ENV === "development"` (app/page.tsx) — dead code in
 * a production build, since Next statically replaces that check and tree-
 * shakes the branch — and the server action it calls re-checks the same
 * thing independently (see devResetProgressAction in app/actions.ts),
 * since a Server Action is a real callable endpoint regardless of what
 * the client renders.
 */
export function DevResetControl({ isGuest }: { isGuest: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function handleReset() {
    startTransition(async () => {
      clearAllStartedLessons();
      if (isGuest) {
        clearGuestProgress();
        setMessage("Guest progress cleared.");
        router.refresh();
        return;
      }
      const result = await devResetProgressAction();
      setMessage(result.error ?? "Progress reset.");
      router.refresh();
    });
  }

  return (
    <div className="mw-dev-reset" role="group" aria-label="Development-only tools">
      <span className="mw-badge mw-badge--warning">DEV ONLY</span>
      <span className="mw-dev-reset-label">Reset {isGuest ? "guest" : "account"} progress for testing</span>
      <Button variant="ghost" onClick={handleReset} disabled={pending}>
        {pending ? "Resetting…" : "Reset progress"}
      </Button>
      {message && (
        <span role="status" className="mw-dev-reset-message">
          {message}
        </span>
      )}
    </div>
  );
}
