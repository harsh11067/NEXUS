/**
 * Stage the NEXUS_UI districts into app/public/d so they're served as static
 * files on Vercel (serverless functions can't read sibling dirs at runtime).
 * Runs at build time from the repo root, where NEXUS_UI is present. Locally,
 * `pnpm dev`'s /d/[...slug] route still serves straight from NEXUS_UI.
 *
 *   node scripts/stage-ui.mjs
 */
import { mkdirSync, readdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(ROOT, "NEXUS_UI");
const DEST = resolve(ROOT, "app", "public", "d");

if (!existsSync(SRC)) {
  console.error(`[stage-ui] NEXUS_UI not found at ${SRC} — nothing to stage.`);
  process.exit(0);
}
mkdirSync(DEST, { recursive: true });

const KEEP = new Set([".html", ".js", ".css", ".mjs"]);
let n = 0;
for (const name of readdirSync(SRC)) {
  const full = resolve(SRC, name);
  if (!statSync(full).isFile()) continue;       // skip screenshots/ uploads/
  if (!KEEP.has(extname(name).toLowerCase())) continue;
  copyFileSync(full, resolve(DEST, name));
  n++;
}
console.log(`[stage-ui] staged ${n} files → app/public/d`);
