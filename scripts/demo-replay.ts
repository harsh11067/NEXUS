/**
 * demo:replay — deterministic proof replay (N-R07): pull a receipt's sealed
 * trace from 0G Storage, re-execute the EXACT messages on the SAME attested
 * provider (temp 0, fixed seed), compare outputs, and freshly re-verify BOTH
 * runs against the provider's enclave. Also proves the graceful-degrade path
 * (N-R08) on a pre-replay-schema receipt when one is given.
 *
 *   pnpm demo:replay [receiptId]
 */
import { replayReceipt, networkName } from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

async function main() {
  banner(`demo:replay · ${networkName()} · re-run the receipt`);
  await preflight({ needDeployments: true });
  const ev = new Evidence("replay");
  const receiptId = process.argv[2] ?? "1";
  ev.set("receiptId", receiptId);

  console.log(`  loading sealed trace for receipt #${receiptId} + re-executing…`);
  const r = await replayReceipt(receiptId);
  ev.set("replayable", r.replayable);

  if (!r.replayable) {
    // graceful degrade is a FEATURE (N-R08) — but it only counts as the demo
    // result for legacy receipts; a replayable receipt failing is a failure.
    ev.set("reason", r.reason);
    info("not replayable", r.reason ?? "");
    ev.assert("pre-replay-schema receipt degrades gracefully with a clear reason", !!r.reason);
    ev.write();
    ok("graceful degrade proven (record a new receipt with pnpm demo:receipt for a replayable one)");
    return;
  }

  ev.set("original", r.original);
  ev.set("replay", r.replay);
  ev.set("match", r.match);
  ev.set("modelHashMatches", r.modelHashMatches);

  info("original output", `${r.original!.output.slice(0, 60)}…`);
  info("replay output", `${r.replay!.output.slice(0, 60)}…`);
  info("outputs match", String(r.match));
  info("same provider:model", String(r.modelHashMatches));
  info("original TEE re-verified", String(r.original!.teeReVerified));
  info("replay TEE verified", String(r.replay!.teeVerified));

  ev.assert("replay re-ran on the SAME attested provider:model", r.modelHashMatches === true);
  ev.assert("replay run is freshly enclave-verified (processResponse === true)", r.replay!.teeVerified === true);
  ev.assert("replayed output matches the sealed original byte-for-byte", r.match === true);
  ev.set(
    "honestNote",
    "outputs match under temp-0 decoding; enclave signatures are per-run (nonces) — the claim is reproducible + re-verified, not identical-signature",
  );

  ev.write();
  ok("deterministic replay proven live: same input → same output → fresh hardware proof ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
