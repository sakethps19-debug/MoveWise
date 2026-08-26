/**
 * @movewise/engine
 *
 * Wraps a client-side Stockfish build (loaded in a Web Worker) behind a
 * small typed interface: `evaluate(fen)` and `bestMove(fen, options)`.
 * No other package or app code should send raw UCI strings — this is
 * the only module that speaks the engine's wire protocol.
 *
 * The one-job-at-a-time queue and UCI line parsing here are ported
 * from the MoveWise prototype (app/page.tsx), where this exact
 * pattern was already working correctly for a freeform coached game.
 * It's generalized here to also serve Play-mode post-game analysis
 * and any future "does this move blunder?" checks in Practice mode.
 *
 * The parsing logic (parseUciLine, normalizeScore) is intentionally
 * pure and Worker-independent so it can be unit tested without a
 * browser environment — see index.test.ts.
 */

export interface EngineAnalysis {
  /** Centipawn score from White's perspective; large magnitude = mate. */
  score: number;
  bestMove: string;
  pv: string[];
  depth: number;
}

export interface AnalyzeOptions {
  /** UCI "Skill Level", 0-20. Lower plays weaker/more human-like. */
  skill?: number;
  depth?: number;
}

interface PendingJob {
  fen: string;
  resolve: (analysis: EngineAnalysis) => void;
  reject: (error: Error) => void;
  score?: number;
  pv: string[];
  depth: number;
}

/** Side to move, read from a FEN's second field ("w" or "b"). */
export function sideToMove(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Normalizes a raw engine score (always from the side-to-move's
 * perspective) into a White-relative score, matching the prototype's
 * `normaliseScore` helper. */
export function normalizeScore(raw: number, fen: string): number {
  return sideToMove(fen) === "w" ? raw : -raw;
}

/**
 * The deepest mate distance `normalizeScore`'s mate branch encodes
 * (`Math.min(Math.abs(amount), 99)`) — the exact inverse of that
 * formula's own clamp, not an arbitrary guess.
 */
const MAX_ENCODED_MATE_DISTANCE = 99;

/**
 * Inverts `normalizeScore`'s mate-sentinel encoding
 * (`sign * (100000 - min(|mateIn|, 99) * 1000)`) back into a real "mate
 * in N" distance — the only correct way to tell a mate score apart from
 * an ordinary centipawn one, since both live in the same `number` field
 * (`EngineAnalysis.score`). A naive magnitude threshold alone can't do
 * this reliably (a genuinely won position can have a large centipawn
 * score too); requiring the value to be an *exact* multiple of 1000
 * below 100000 is what actually pins it down, since real Stockfish `cp`
 * scores are essentially never round thousands.
 *
 * Returns a White-relative distance: positive means White has a forced
 * mate in that many moves, negative means Black does, `null` means this
 * is an ordinary centipawn score. `score` must itself already be
 * White-relative (i.e. already passed through `normalizeScore`).
 */
export function decodeMateDistance(score: number): number | null {
  const magnitude = Math.abs(score);
  if (magnitude < 100000 - MAX_ENCODED_MATE_DISTANCE * 1000 || magnitude > 100000) return null;
  const distance = (100000 - magnitude) / 1000;
  if (!Number.isInteger(distance) || distance < 1) return null;
  return Math.sign(score) * distance;
}

export type ParsedUciEvent =
  | { kind: "uciok" }
  | { kind: "readyok" }
  | { kind: "info"; score?: number; depth?: number; pv?: string[] }
  | { kind: "bestmove"; move: string }
  | { kind: "other" };

/** Parses a single line of UCI protocol output. Pure — no I/O. */
export function parseUciLine(line: string): ParsedUciEvent {
  if (line === "uciok") return { kind: "uciok" };
  if (line === "readyok") return { kind: "readyok" };

  if (line.startsWith("info ")) {
    const event: ParsedUciEvent = { kind: "info" };
    const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
    if (scoreMatch) {
      const amount = Number(scoreMatch[2]);
      event.score =
        scoreMatch[1] === "mate"
          ? Math.sign(amount || 1) * (100000 - Math.min(Math.abs(amount), 99) * 1000)
          : amount;
    }
    const depthMatch = line.match(/\bdepth (\d+)/);
    if (depthMatch) event.depth = Number(depthMatch[1]);
    const pvMatch = line.match(/\bpv (.+)$/);
    if (pvMatch) event.pv = pvMatch[1].trim().split(/\s+/);
    return event;
  }

  if (line.startsWith("bestmove ")) {
    return { kind: "bestmove", move: line.split(/\s+/)[1] || "(none)" };
  }

  return { kind: "other" };
}

export interface EngineHandle {
  ready: Promise<void>;
  evaluate(fen: string, options?: AnalyzeOptions): Promise<EngineAnalysis>;
  bestMove(fen: string, options?: AnalyzeOptions): Promise<EngineAnalysis>;
  dispose(): void;
}

export interface CreateEngineOptions {
  /** URL to the Stockfish worker script, e.g. "/engine/stockfish-18-lite-single.js". */
  workerUrl: string;
  /** Hash table size in MB. Defaults to 16, matching the prototype. */
  hashMb?: number;
}

/**
 * Creates a Stockfish engine handle backed by a Web Worker. Only one
 * analysis job runs at a time — a second call while one is pending
 * rejects immediately rather than queuing, matching the prototype's
 * behavior (callers should await the previous call before issuing a
 * new one).
 */
export function createEngine(options: CreateEngineOptions): EngineHandle {
  const worker = new Worker(options.workerUrl);
  let ready = false;
  let currentJob: PendingJob | null = null;

  const readyPromise = new Promise<void>((resolveReady, rejectReady) => {
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;

      for (const line of event.data.split(/\r?\n/)) {
        const parsed = parseUciLine(line);

        if (parsed.kind === "uciok") {
          worker.postMessage(`setoption name Hash value ${options.hashMb ?? 16}`);
          worker.postMessage("setoption name Skill Level value 20");
          worker.postMessage("isready");
          continue;
        }

        if (parsed.kind === "readyok") {
          ready = true;
          resolveReady();
          continue;
        }

        if (!currentJob) continue;

        if (parsed.kind === "info") {
          if (parsed.score !== undefined) {
            currentJob.score = normalizeScore(parsed.score, currentJob.fen);
          }
          if (parsed.depth !== undefined) currentJob.depth = parsed.depth;
          if (parsed.pv !== undefined) currentJob.pv = parsed.pv;
          continue;
        }

        if (parsed.kind === "bestmove") {
          const job = currentJob;
          currentJob = null;
          job.resolve({
            score: job.score ?? 0,
            bestMove: parsed.move,
            pv: job.pv,
            depth: job.depth,
          });
        }
      }
    });

    worker.addEventListener("error", () => {
      ready = false;
      rejectReady(new Error("Stockfish worker failed to load"));
      currentJob?.reject(new Error("Stockfish worker failed"));
      currentJob = null;
    });

    worker.postMessage("uci");
  });

  function runJob(fen: string, options: AnalyzeOptions = {}): Promise<EngineAnalysis> {
    return new Promise((resolve, reject) => {
      if (!ready) {
        reject(new Error("Engine is not ready"));
        return;
      }
      if (currentJob) {
        reject(new Error("Engine is already analysing — await the previous call first"));
        return;
      }

      currentJob = { fen, resolve, reject, pv: [], depth: 0 };
      worker.postMessage(`setoption name Skill Level value ${options.skill ?? 20}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${options.depth ?? 10}`);
    });
  }

  return {
    ready: readyPromise,
    evaluate: (fen, options) => runJob(fen, options),
    bestMove: (fen, options) => runJob(fen, options),
    dispose() {
      currentJob?.reject(new Error("Engine disposed"));
      currentJob = null;
      worker.terminate();
    },
  };
}
