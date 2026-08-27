"use client";

import { useEffect, useRef, useState } from "react";
import { createEngine, type EngineHandle } from "@movewise/engine";

const WORKER_URL = "/engine/stockfish-18-lite-single.js";

/**
 * How long a still-loading engine is kept alive after its last consumer
 * unmounts before actually disposing it. Real navigation patterns
 * bounce between Stockfish-using views in quick succession (a mini-game
 * step, then the next lesson's own mini-game step; Play mode's
 * game-over screen, then straight into another game) — without this,
 * every one of those pays the full ~6s worker-boot cost again even
 * though only one view is ever actually using the engine at a time (see
 * createEngine's own "only one analysis job runs at a time" doc comment
 * — a shared instance is only safe because of that non-concurrent
 * usage pattern).
 */
const DISPOSE_GRACE_MS = 30_000;
/** No worker should legitimately take this long to boot; past this, show a timeout instead of spinning forever. */
const TIMEOUT_MS = 20_000;

let sharedEngine: EngineHandle | null = null;
let disposeTimer: ReturnType<typeof setTimeout> | null = null;

function acquireEngine(): EngineHandle {
  if (disposeTimer) {
    clearTimeout(disposeTimer);
    disposeTimer = null;
  }
  if (!sharedEngine) {
    sharedEngine = createEngine({ workerUrl: WORKER_URL });
  }
  return sharedEngine;
}

function releaseEngine(): void {
  if (disposeTimer) clearTimeout(disposeTimer);
  disposeTimer = setTimeout(() => {
    sharedEngine?.dispose();
    sharedEngine = null;
    disposeTimer = null;
  }, DISPOSE_GRACE_MS);
}

/** Discards a broken/stuck shared instance so the next acquire builds a genuinely fresh one. */
function discardEngine(): void {
  if (disposeTimer) {
    clearTimeout(disposeTimer);
    disposeTimer = null;
  }
  sharedEngine?.dispose();
  sharedEngine = null;
}

/**
 * Creates (or reuses a still-warm shared) Stockfish Worker for the
 * component's lifetime, disposing it — after a grace period, see
 * DISPOSE_GRACE_MS — on unmount. Shared by PlayRunner and LessonRunner's
 * mini-game steps so there's exactly one Worker-management
 * implementation.
 *
 * Reports a human-readable `stage` while loading (never a raw
 * centipawn-style number the worker doesn't even expose) and gives up
 * with a retryable error after TIMEOUT_MS instead of spinning forever on
 * a stalled load.
 */
export function useStockfishEngine(enabled: boolean) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | undefined>(undefined);
  const [retryToken, setRetryToken] = useState(0);
  const engineRef = useRef<EngineHandle | null>(null);

  useEffect(() => {
    if (!enabled) return;

    setError(null);
    setReady(false);
    setStage("Starting engine…");

    const engine = acquireEngine();
    engineRef.current = engine;
    // Guards against engine.ready settling *after* a timeout has already
    // discarded this engine and shown an error — without this, a very
    // late resolution would flip the UI back to "ready" over a Worker
    // that's already been disposed.
    let cancelled = false;

    const stageTimer = setTimeout(() => setStage("Preparing your opponent…"), 1_500);
    const slowTimer = setTimeout(
      () => setStage("Still working — this can take a few seconds on a slow connection…"),
      6_000,
    );
    const timeoutTimer = setTimeout(() => {
      cancelled = true;
      discardEngine();
      engineRef.current = null;
      setError("This is taking longer than expected.");
    }, TIMEOUT_MS);

    function settled() {
      clearTimeout(stageTimer);
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    }

    // Already-resolved for a warm, reused engine — these fire on (or
    // very shortly after) the current tick, so `ready` flips true
    // immediately instead of showing any loading state at all.
    engine.ready
      .then(() => {
        if (cancelled) return;
        settled();
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        settled();
        discardEngine(); // don't keep serving a broken instance to the next consumer
        engineRef.current = null;
        setError("Couldn't load the Stockfish engine.");
      });

    return () => {
      cancelled = true;
      settled();
      engineRef.current = null;
      releaseEngine();
    };
  }, [enabled, retryToken]);

  function retry() {
    setRetryToken((t) => t + 1);
  }

  return { engineRef, ready, error, stage: ready || error ? undefined : stage, retry };
}
