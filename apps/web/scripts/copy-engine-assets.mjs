/**
 * Stages the Stockfish single-threaded WASM build (from the `stockfish`
 * npm dependency) into public/engine/, where it's served as a static
 * asset and loaded by @movewise/engine via `new Worker(workerUrl)`.
 * Not committed to git (public/engine/ is gitignored) — this runs via
 * predev/prebuild so it's always freshly staged from node_modules.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
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

// GPLv3 source-availability notice, staged alongside the binaries every
// time they are (public/engine/ is gitignored and regenerated, so a
// static committed notice file wouldn't actually ship) — see
// docs/stockfish-methodology.md's "GPLv3 compliance" section for the
// full reasoning this closes the gap on.
const stockfishVersion = JSON.parse(readFileSync(join(ROOT, "node_modules", "stockfish", "package.json"), "utf-8")).version;
writeFileSync(
  join(DEST_DIR, "LICENSE-NOTICE.md"),
  `# Stockfish chess engine — GPLv3 notice

This directory ships an unmodified build of Stockfish ${stockfishVersion}
(the single-threaded WASM "lite" build, from the \`stockfish\` npm
package), used by MoveWise for move analysis and computer opponents.

Stockfish is free software, licensed under the GNU General Public
License version 3 (GPLv3). Its complete source code is publicly
available at https://github.com/official-stockfish/Stockfish and
https://github.com/nmrugg/stockfish.js (the WASM build used here).
No modifications have been made to the engine binary shipped in this
directory.

See docs/stockfish-methodology.md in the MoveWise repository for how
this engine is invoked and what obligations this notice satisfies.
`,
);

console.log(`Staged ${FILES.length} Stockfish engine asset(s) + LICENSE-NOTICE.md into public/engine/`);
