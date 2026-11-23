// SOLMAR HEAT — the entry program for make.fun's "Make GTA 6" bounty (gta6-01).
//
// This is the program the grader runs (Node 22, standard library only). It takes the
// game in this repository — the static files under game/ and the screenshots under
// screenshots/ — and hands them in: it copies both folders into the output directory
// (/output inside the grader, or MAKEFUN_OUTPUT_DIR outside it) and writes
// /output/dossier.json, the summary the judge reads, using the vendored make.fun
// library (vendor/makefun-game.ts, the kit's copy, unchanged).
//
// The game itself is plain static files: game/index.html opens in desktop Chrome and
// plays with no network request. Three.js is vendored as game/vendor/three.min.js.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const root = fileURLToPath(new URL('.', import.meta.url));

// The grader writes to /output; outside the grader MAKEFUN_OUTPUT_DIR stands in for it.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the whole game folder (index.html, its modules and the vendored library).
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });

// Copy the screenshots the maker took of the game (the first by name is the cover).
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Write the dossier the judge reads. The caps below are the scorer's own: the text
// the dossier may carry, how many screenshots it may hold and how large each may be,
// and the limits on the game folder (files, bytes, path length). An entry that breaks
// one of these is refused by the gate, so the program hands in nothing over the line.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
