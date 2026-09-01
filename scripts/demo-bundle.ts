/**
 * demo:bundle — ProofPass Offline Bundles (FUTURE §7): export a receipt's
 * primary evidence as one self-contained JSON, verify it OFFLINE (pure
 * computation: receipt-hash re-derivation, chain↔storage link, 0G Merkle root
 * of the embedded blob), tamper one byte and watch it FAIL, then run the
 * online extension (fresh enclave + live chain cross-check).
 *
 *   pnpm demo:bundle [receiptId]
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  exportProofBundle,
  verifyProofBundleOffline,
  verifyProofBundleOnline,
  networkName,
} from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

async function main() {
  banner(`demo:bundle · ${networkName()} · offline proof bundle`);
  await preflight({ needDeployments: true });
  const ev = new Evidence("proof-bundle");
  const receiptId = process.argv[2] ?? "1";
  ev.set("receiptId", receiptId);

  console.log(`  exporting bundle for receipt #${receiptId}…`);
  const bundle = await exportProofBundle(receiptId);
  const dir = resolve(process.cwd(), "evidence", "bundles");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `receipt-${networkName()}-${receiptId}.json`);
  writeFileSync(path, JSON.stringify(bundle, null, 2));
  ev.set("bundlePath", path.replace(process.cwd() + "/", ""));
  ev.set("bundleBytes", JSON.stringify(bundle).length);
  ok(`bundle written: ${path}`);

  console.log("  verifying OFFLINE (pure computation, zero network)…");
  const off = await verifyProofBundleOffline(bundle);
  for (const c of off.checks) info(c.id, `${c.status === true ? "✓" : "✗"} ${c.claim}`);
  ev.set("offlineChecks", off.checks);
  ev.assert("offline verification passes (B1 receipt-hash, B2 CID link, B3 Merkle root)", off.valid);

  console.log("  tampering ONE byte of the embedded trace → must FAIL…");
  const tampered = JSON.parse(JSON.stringify(bundle));
  const buf = Buffer.from(tampered.trace.blobBase64, "base64");
  buf[buf.length - 1] ^= 0x01;
  tampered.trace.blobBase64 = buf.toString("base64");
  const tam = await verifyProofBundleOffline(tampered);
  ev.set("tamperedChecks", tam.checks);
  ev.assert("one flipped byte fails the offline Merkle check (tamper-evident)", !tam.valid);
  ok("tamper detected ✅");

  console.log("  online extension: fresh enclave re-check + live chain cross-check…");
  const on = await verifyProofBundleOnline(bundle);
  for (const c of on.checks.slice(3)) info(c.id, `${c.status === true ? "✓" : c.status === false ? "✗" : "◌"} ${c.claim}`);
  ev.set("onlineChecks", on.checks);
  ev.assert("online verification passes (nothing fails; unverifiable steps stated)", on.valid);

  ev.set("judgeNote", `verify yourself, air-gapped: pnpm verify:bundle ${ev.scenario ? path.replace(process.cwd() + "/", "") : ""}`);
  ev.write();
  ok("offline proof bundle proven: self-contained, tamper-evident, re-verifiable years later ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
