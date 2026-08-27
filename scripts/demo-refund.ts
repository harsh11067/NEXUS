/**
 * demo:refund — funds can never lock (R-07 / C-17). Locks a payment under a
 * short-TTL policy, proves refund is BLOCKED before the TTL (TtlNotElapsed),
 * waits out the TTL, refunds, and verifies the payer got the funds back.
 *
 *   pnpm demo:refund
 *   OG_NETWORK=mainnet pnpm demo:refund
 */
import { Wallet, parseEther, randomBytes, hexlify } from "ethers";
import { createAgent, nexusEscrow, getWallet, explorerTx, networkName } from "@nexus/sdk";
import type { AgentPersona } from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

const TTL_SECONDS = 20;
const PERSONA: AgentPersona = {
  name: "Refund Probe",
  description: "Demo agent proving TTL refunds.",
  systemPrompt: "probe",
  memory: [],
  policy: {
    maxPerTx: parseEther("0.0005").toString(),
    dailyBudget: parseEther("0.002").toString(),
    maxTaskTTL: TTL_SECONDS,
    allowedTools: [],
    bannedActions: [],
  },
};

async function main() {
  banner(`demo:refund · ${networkName()} · funds never lock`);
  const { wallet, provider } = await preflight({ needDeployments: true });
  const ev = new Evidence("refund");

  console.log("  minting a probe agent…");
  const agent = await createAgent(PERSONA, getWallet());
  ok(`agent #${agent.agentId}`);
  ev.set("agentId", agent.agentId);

  const merchant = Wallet.createRandom().address; // never fulfills
  const sessionId = hexlify(randomBytes(32));
  const escrow = nexusEscrow(wallet);

  console.log(`  binding policy with a ${TTL_SECONDS}s TTL…`);
  await (await escrow.bindPolicy(
    sessionId,
    agent.agentId,
    [merchant],
    PERSONA.policy.maxPerTx,
    PERSONA.policy.dailyBudget,
    TTL_SECONDS,
  )).wait();

  const amount = parseEther("0.0002");
  console.log("  locking funds to a merchant that never fulfills…");
  const lockTx = await escrow.lockFunds(agent.agentId, sessionId, merchant, amount, { value: amount });
  const lockReceipt = await lockTx.wait();
  let paymentId = "";
  for (const log of lockReceipt.logs) {
    try {
      const p = escrow.interface.parseLog(log);
      if (p?.name === "FundsLocked") paymentId = p.args.paymentId;
    } catch { /* skip */ }
  }
  if (!paymentId) fail("could not read paymentId");
  ev.set("lockTx", lockReceipt.hash);
  ev.set("paymentId", paymentId);
  info("lock tx", explorerTx(lockReceipt.hash));

  console.log("  attempting refund BEFORE the TTL (must be blocked)…");
  await ev.expectRevert(
    "refund before TTL reverts TtlNotElapsed",
    () => escrow.refund(paymentId),
    "TtlNotElapsed",
  );
  ok("early refund blocked ✅");

  console.log(`  waiting out the TTL (${TTL_SECONDS + 5}s)…`);
  await new Promise((r) => setTimeout(r, (TTL_SECONDS + 5) * 1000));

  const balBefore = await provider.getBalance(wallet.address);
  const rTx = await escrow.refund(paymentId);
  const rReceipt = await rTx.wait();
  ok("refunded");
  info("refund tx", explorerTx(rReceipt.hash));
  ev.set("refundTx", rReceipt.hash);
  ev.set("refundTxUrl", explorerTx(rReceipt.hash));

  const balAfter = await provider.getBalance(wallet.address);
  const gas = rReceipt.gasUsed * (rReceipt.gasPrice ?? 0n);
  ev.assert("payer balance restored (amount back minus gas)", balAfter + gas >= balBefore + amount - 10n ** 12n,
    `${balBefore} -> ${balAfter}`);

  const status: bigint = await escrow.statusOf(paymentId);
  ev.assert("payment status == REFUNDED on chain", Number(status) === 4, `status=${status}`);

  ev.write();
  ok("TTL refund proven live — no path locks funds ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
