/**
 * verify:bundle — the standalone bundle verifier a stranger runs:
 *
 *   pnpm verify:bundle evidence/bundles/receipt-mainnet-2.json            # offline
 *   pnpm verify:bundle evidence/bundles/receipt-mainnet-2.json --online   # + enclave/chain
 *
 * Offline mode does pure computation (keccak + 0G Merkle root) — no RPC, no
 * NEXUS server, nothing to trust but math and the chain coordinates printed
 * for you to spot-check on any explorer.
 */
import { readFileSync } from "node:fs";
import { verifyProofBundleOffline, verifyProofBundleOnline, type ProofBundleFile } from "0g-nexus-sdk";
import { banner, ok, info, fail } from "./_common.js";

async function main() {
  const path = process.argv[2];
  if (!path) fail("usage: pnpm verify:bundle <bundle.json> [--online]");
  const online = process.argv.includes("--online");
  const bundle = JSON.parse(readFileSync(path, "utf8")) as ProofBundleFile;
  if (bundle.standard !== "nexus-proof-bundle") fail("not a nexus-proof-bundle file");

  banner(`verify:bundle · receipt #${bundle.receipt.receiptId} · chain ${bundle.network.chainId} · ${online ? "online" : "OFFLINE"}`);
  info("exported", new Date(bundle.exportedAt * 1000).toISOString());
  info("receiptHash", bundle.receipt.receiptHash);
  info("explorer", `${bundle.network.explorerUrl}/address/${bundle.contracts.CompositeReceiptMinter}`);

  const res = online ? await verifyProofBundleOnline(bundle) : await verifyProofBundleOffline(bundle);
  for (const c of res.checks) {
    const mark = c.status === true ? "\x1b[32m✓\x1b[0m" : c.status === false ? "\x1b[31m✗\x1b[0m" : "\x1b[33m◌\x1b[0m";
    console.log(`  ${mark} [${c.id}] ${c.claim}`);
  }
  if (res.valid) ok(`BUNDLE VALID — every check re-derived ${online ? "(incl. live enclave/chain)" : "offline"}`);
  else fail("BUNDLE INVALID — at least one check failed");
}

main().catch((e) => fail(e?.stack ?? String(e)));
