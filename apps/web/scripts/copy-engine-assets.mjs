/**
 * Stages the Stockfish single-threaded WASM build (from the `stockfish`
 * npm dependency) into public/engine/, where it's served as a static
 * asset and loaded by @movewise/engine via `new Worker(workerUrl)`.
 * Not committed to git (public/engine/ is gitignored) — this runs via
 * predev/prebuild so it's always freshly staged from node_modules.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = join(ROOT, "node_modules", "stockfish", "bin");
const DEST_DIR = join(ROOT, "public", "engine");
const FILES = ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"];

mkdirSync(DEST_DIR, { recursive: true });

for (const file of FILES) {
  const source = join(SOURCE_DIR, file);
  if (!existsSync(source)) {
    console.error(`Missing ${source} — is the "stockfish" dependency installed?`);
    process.exit(1);
  }
  copyFileSync(source, join(DEST_DIR, file));
}

console.log(`Staged ${FILES.length} Stockfish engine asset(s) into public/engine/`);
