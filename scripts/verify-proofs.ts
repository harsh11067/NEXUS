/**
 * verify:proofs — re-checks every recorded evidence artifact against LIVE chain
 * + storage state (DIY.md §6, TEST.md A-05). For each
 * evidence/<network>/<ts>-<scenario>/result.json:
 *   - every recorded *Tx hash must resolve on chain with status 1
 *   - every recorded storage root must still retrieve from 0G Storage
 *   - every recorded assertion must have passed at run time
 * Exits non-zero if any row fails — PROOFS content is only what verifies NOW.
 *
 *   pnpm verify:proofs
 *   OG_NETWORK=mainnet pnpm verify:proofs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider, downloadBytes, networkName } from "0g-nexus-sdk";
import { banner, ok, info, fail } from "./_common.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TX_KEYS = /(Tx|transactionHash)$/;
const ROOT_KEYS = /^(personaRootHash|traceRootHash|oldCipherRoot|newCipherRoot|cardRootHash|requestRootHash|reportRootHash)$/;

/** Walk the whole artifact (new demos nest txs/roots inside sections). */
function collect(obj: unknown, path: string, out: { key: string; value: string }[]) {
  if (obj === null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === "string") out.push({ key: p, value: v });
    else collect(v, p, out);
  }
}

async function main() {
  const net = networkName();
  banner(`verify:proofs · ${net}`);
  const dir = resolve(ROOT, "evidence", net);
  if (!existsSync(dir)) fail(`no evidence recorded yet for ${net} — run the demo scripts first`);
  const runs = readdirSync(dir).sort();
  const provider = getProvider();

  let checkedTx = 0, checkedRoots = 0, failures = 0;
  const seenRoots = new Set<string>();

  for (const run of runs) {
    const p = resolve(dir, run, "result.json");
    if (!existsSync(p)) continue;
    const artifact = JSON.parse(readFileSync(p, "utf8"));
    console.log(`\n  ▸ ${run}`);

    for (const a of artifact.assertions ?? []) {
      if (!a.pass) {
        console.log(`    ✗ recorded assertion failed: ${a.claim}`);
        failures++;
      }
    }

    const entries: { key: string; value: string }[] = [];
    collect(artifact, "", entries);
    for (const { key, value: v } of entries) {
      const k = key.split(".").pop()!;
      if (TX_KEYS.test(k) && v.startsWith("0x") && v.length === 66) {
        const receipt = await provider.getTransactionReceipt(v);
        if (receipt?.status === 1) {
          checkedTx++;
          console.log(`    ✓ ${key} ${v.slice(0, 14)}… on chain (block ${receipt.blockNumber})`);
        } else {
          failures++;
          console.log(`    ✗ ${key} ${v} NOT found / failed on chain`);
        }
      }
      if (ROOT_KEYS.test(k) && v.startsWith("0x")) {
        if (seenRoots.has(v)) continue;
        seenRoots.add(v);
        try {
          const bytes = await downloadBytes(v);
          checkedRoots++;
          console.log(`    ✓ ${k} ${v.slice(0, 14)}… retrieves from 0G Storage (${bytes.length}B, Merkle-verified)`);
        } catch (e) {
          failures++;
          console.log(`    ✗ ${k} ${v} NOT retrievable: ${String(e).slice(0, 100)}`);
        }
      }
    }
  }

  console.log("");
  info("runs checked", String(runs.length));
  info("txs verified", String(checkedTx));
  info("roots verified", String(checkedRoots));
  if (failures > 0) fail(`${failures} proof row(s) failed live re-verification`);
  ok("every recorded proof re-verified against live chain + storage ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
