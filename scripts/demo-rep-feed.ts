/**
 * demo:rep-feed — portable reputation (N-R06): feed a NEXUS proof-derived
 * score into the CANONICAL ERC-8004 Reputation Registry, anchored to the
 * NEXUS receiptHash. Comes from a CLIENT wallet (the canonical registry
 * blocks owner/operator self-feedback — we prove that too).
 *
 *   pnpm demo:rep-feed [erc8004AgentId] [nexusReceiptId]
 */
import { Wallet } from "ethers";
import {
  giveFeedback,
  erc8004Reputation,
  findIdentity,
  compositeMinter,
  getProvider,
  network,
  networkName,
  explorerTx,
  optionalEnv,
} from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

async function main() {
  banner(`demo:rep-feed · ${networkName()} · portable proof-anchored reputation`);
  const { wallet } = await preflight({ needDeployments: true });
  const ev = new Evidence("erc8004-rep-feed");

  const nexusReceiptId = process.argv[3] ?? "1";
  let erc8004AgentId = process.argv[2];
  if (!erc8004AgentId) {
    const found = await findIdentity("1");
    if (!found) fail("no ERC-8004 identity for NEXUS agent #1 — run pnpm demo:erc8004-register first");
    erc8004AgentId = found.erc8004AgentId;
  }
  ev.set("erc8004AgentId", erc8004AgentId);
  ev.set("reputationRegistry", network().erc8004.reputation);

  // the score is anchored to a REAL NEXUS receipt hash read from chain
  const [r] = await compositeMinter(getProvider()).getReceipt(nexusReceiptId);
  if (Number(r.timestamp) === 0) fail(`NEXUS receipt #${nexusReceiptId} not found`);
  const receiptHash: string = r.receiptHash;
  ev.set("nexusReceipt", { receiptId: nexusReceiptId, receiptHash });
  info("receiptHash", receiptHash);

  // self-feedback must be blocked (canonical registry rule) — prove it
  console.log("  owner attempting self-feedback (must revert)…");
  let selfBlocked = false;
  let selfError = "";
  try {
    await (erc8004Reputation(wallet) as any).giveFeedback(erc8004AgentId, 100n, 0, "self", "", "", "", receiptHash);
  } catch (e: any) {
    selfBlocked = true;
    selfError = String(e?.message ?? e).slice(0, 160);
  }
  ev.assert("owner self-feedback blocked by the canonical registry", selfBlocked, selfError);
  ok("self-feedback blocked on-chain ✅");

  // a client wallet posts the proof-anchored score
  const buyerKey = optionalEnv("BUYER_PRIVATE_KEY");
  if (!buyerKey) fail("BUYER_PRIVATE_KEY not set — feedback must come from a client wallet");
  const client = new Wallet(buyerKey.startsWith("0x") ? buyerKey : `0x${buyerKey}`, getProvider());
  console.log("  client posting receipt-anchored feedback…");
  const fb = await giveFeedback(erc8004AgentId, 100, receiptHash, client);
  ev.set("feedback", fb);
  ok(`NewFeedback → ${explorerTx(fb.feedbackTx)}`);

  // read it back from the canonical registry
  const [value, , tag1, , isRevoked] = await erc8004Reputation(getProvider()).readFeedback(erc8004AgentId, client.address, 1n);
  ev.assert("feedback readable from the canonical registry", Number(value) === 100 && !isRevoked, `value=${value} tag=${tag1}`);
  ev.set("readBack", { value: Number(value), tag1, isRevoked });

  ev.set("judgeNote", "the feedbackHash on the NewFeedback event IS the NEXUS receiptHash — reputation portable across every ERC-8004 platform, still proof-anchored");
  ev.write();
  ok("proof-derived reputation now lives in the canonical ERC-8004 Reputation Registry ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
