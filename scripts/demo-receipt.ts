/**
 * demo:receipt — one composite receipt per verifiable task (C-21…C-23):
 * runs the full prove loop (session -> Sealed Inference -> trace on 0G Storage
 * -> closeSession -> composite receipt -> reputation tick), then proves the
 * replay guard: minting a second receipt for the SAME session reverts
 * AlreadyMinted.
 *
 * Fail-closed: if no TEE service is reachable the run is anchored `unverified`
 * (never fake-verified) and the receipt still proves the anchoring loop.
 *
 *   pnpm demo:receipt
 *   OG_NETWORK=mainnet pnpm demo:receipt
 */
import { createAgent, runTask, compositeMinter, reputationRegistry, getWallet, networkName, explorerTx } from "0g-nexus-sdk";
import type { AgentPersona } from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

const PERSONA: AgentPersona = {
  name: "Receipt Auditor",
  description: "Demo agent proving the receipt spine.",
  systemPrompt: "You are a concise analyst. Answer in two sentences.",
  memory: [],
  policy: {
    maxPerTx: "500000000000000",
    dailyBudget: "5000000000000000",
    maxTaskTTL: 300,
    allowedTools: [],
    bannedActions: [],
  },
};

async function main() {
  banner(`demo:receipt · ${networkName()} · composite receipt + replay guard`);
  const { wallet } = await preflight({ needDeployments: true });
  const ev = new Evidence("receipt");

  console.log("  minting agent…");
  const created = await createAgent(PERSONA, getWallet());
  ok(`agent #${created.agentId}`);
  ev.set("agentId", created.agentId);
  ev.set("mintTx", created.mintTx);

  const rep = reputationRegistry(wallet);
  const [scoreBefore] = await rep.getScore(created.agentId);

  console.log("  running the FULL prove loop (session -> TEE -> trace -> receipt)…");
  const r = await runTask(created.agentId, "In one sentence: why do verifiable receipts matter for AI agents?", { prove: true });
  ok(`receipt #${r.receiptId} minted`);
  info("sessionId", r.sessionId!);
  info("verified", r.verified === true ? "TEE-VERIFIED ✅" : r.verified === null ? "no TEE service — anchored UNVERIFIED (fail closed)" : "verification FALSE — anchored UNVERIFIED");
  info("trace root", r.traceRootHash!);
  info("receipt tx", r.receiptTxUrl!);
  ev.set("sessionId", r.sessionId);
  ev.set("receiptId", r.receiptId);
  ev.set("provider", r.provider);
  ev.set("chatID", r.chatID); // A-03: a judge re-runs processResponse(provider, chatID) themselves
  ev.set("model", r.model);
  ev.set("teeVerified", r.verified);
  ev.set("traceRootHash", r.traceRootHash);
  ev.set("closeTx", r.closeTx);
  ev.set("receiptTx", r.receiptTx);
  ev.set("receiptTxUrl", r.receiptTxUrl);

  const [scoreAfter] = await rep.getScore(created.agentId);
  ev.assert("reputation ticked up, anchored to the receipt", Number(scoreAfter) > Number(scoreBefore),
    `${scoreBefore} -> ${scoreAfter}`);

  // replay guard — same session must never mint twice
  console.log("  replaying the mint for the SAME session (must revert)…");
  const minter = compositeMinter(wallet);
  await ev.expectRevert(
    "second mint for the same session reverts AlreadyMinted",
    () => minter.mint(created.agentId, r.sessionId!, r.paymentId!, "0x00", "0x"),
    "AlreadyMinted",
  );
  ok("replay blocked ✅");

  ev.write();
  ok(`one receipt per verifiable task, proven live — verify: ${explorerTx(r.receiptTx!)}`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
