"use client";

import { useEffect, useRef, useState } from "react";
import { createEngine, type EngineHandle } from "@movewise/engine";

const WORKER_URL = "/engine/stockfish-18-lite-single.js";

/**
 * Creates one Stockfish Worker for the component's lifetime and disposes
 * it on unmount. Shared by PlayRunner and LessonRunner's mini-game steps
 * so there's exactly one Worker-management implementation.
 */
export function useStockfishEngine(enabled: boolean) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<EngineHandle | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const engine = createEngine({ workerUrl: WORKER_URL });
    engineRef.current = engine;
    engine.ready
      .then(() => setReady(true))
      .catch(() => setError("Couldn't load the Stockfish engine."));

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [enabled]);

  return { engineRef, ready, error };
}
