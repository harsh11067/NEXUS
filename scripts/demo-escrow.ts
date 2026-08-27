/**
 * demo:escrow — policy-bound escrow, enforced ON CHAIN (E-04 / R-06):
 *   1. an over-per-tx lock attempt REVERTS OverPerTx
 *   2. a disallowed-merchant lock attempt REVERTS MerchantNotAllowed
 *   3. a valid lock -> merchant fulfillment -> settlement pays the merchant
 *
 *   pnpm demo:escrow
 *   OG_NETWORK=mainnet pnpm demo:escrow
 */
import { Wallet, parseEther, randomBytes, hexlify, toUtf8Bytes } from "ethers";
import { createAgent, nexusEscrow, getWallet, explorerTx, networkName } from "@nexus/sdk";
import type { AgentPersona } from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

const MAX_PER_TX = parseEther("0.0005");
const PERSONA: AgentPersona = {
  name: "Escrow Guarded",
  description: "Demo agent with an on-chain spend policy.",
  systemPrompt: "probe",
  memory: [],
  policy: {
    maxPerTx: MAX_PER_TX.toString(),
    dailyBudget: parseEther("0.002").toString(),
    maxTaskTTL: 3600,
    allowedTools: [],
    bannedActions: [],
  },
};

async function main() {
  banner(`demo:escrow · ${networkName()} · policy enforced on chain`);
  const { wallet, provider } = await preflight({ needDeployments: true });
  const ev = new Evidence("escrow");

  console.log("  minting a policy-guarded agent…");
  const agent = await createAgent(PERSONA, getWallet());
  ok(`agent #${agent.agentId}`);
  ev.set("agentId", agent.agentId);
  ev.set("mintTx", agent.mintTx);

  // real second identity as the merchant, funded for the fulfillment tx
  const merchant = Wallet.createRandom().connect(provider);
  info("merchant", merchant.address);
  const fundTx = await wallet.sendTransaction({ to: merchant.address, value: parseEther("0.002") });
  await fundTx.wait();
  ev.set("merchant", merchant.address);

  const sessionId = hexlify(randomBytes(32));
  const escrow = nexusEscrow(wallet);

  console.log("  binding spend policy (maxPerTx / budget / allowed merchant)…");
  const bindTx = await escrow.bindPolicy(
    sessionId,
    agent.agentId,
    [merchant.address],
    PERSONA.policy.maxPerTx,
    PERSONA.policy.dailyBudget,
    PERSONA.policy.maxTaskTTL,
  );
  const bindReceipt = await bindTx.wait();
  ok("policy bound");
  ev.set("bindTx", bindReceipt.hash);
  ev.set("policy", {
    maxPerTx: PERSONA.policy.maxPerTx,
    dailyBudget: PERSONA.policy.dailyBudget,
    allowedMerchants: [merchant.address],
  });

  // 1 — over-limit attempt MUST revert
  const over = MAX_PER_TX + 1n;
  console.log("  attempting an OVER-LIMIT lock (must be blocked on chain)…");
  await ev.expectRevert(
    "over-per-tx lock attempt reverts OverPerTx",
    () => escrow.lockFunds(agent.agentId, sessionId, merchant.address, over, { value: over }),
    "OverPerTx",
  );
  ok("over-limit blocked ✅");

  // 2 — disallowed merchant MUST revert
  const stranger = Wallet.createRandom().address;
  console.log("  attempting a DISALLOWED-merchant lock (must be blocked)…");
  await ev.expectRevert(
    "disallowed-merchant lock attempt reverts MerchantNotAllowed",
    () => escrow.lockFunds(agent.agentId, sessionId, stranger, MAX_PER_TX, { value: MAX_PER_TX }),
    "MerchantNotAllowed",
  );
  ok("disallowed merchant blocked ✅");

  // 3 — the valid path: lock -> fulfill -> settle
  const amount = parseEther("0.0002");
  console.log("  valid lock…");
  const lockTx = await escrow.lockFunds(agent.agentId, sessionId, merchant.address, amount, { value: amount });
  const lockReceipt = await lockTx.wait();
  let paymentId = "";
  for (const log of lockReceipt.logs) {
    try {
      const p = escrow.interface.parseLog(log);
      if (p?.name === "FundsLocked") paymentId = p.args.paymentId;
    } catch { /* skip */ }
  }
  if (!paymentId) fail("could not read paymentId from FundsLocked");
  info("lock tx", explorerTx(lockReceipt.hash));
  ev.set("lockTx", lockReceipt.hash);
  ev.set("paymentId", paymentId);

  console.log("  merchant submits fulfillment evidence…");
  const fTx = await nexusEscrow(merchant).submitFulfillment(paymentId, hexlify(toUtf8Bytes("og://evidence-demo-escrow")));
  const fReceipt = await fTx.wait();
  ev.set("fulfillTx", fReceipt.hash);

  const merchantBalBefore = await provider.getBalance(merchant.address);
  console.log("  settling…");
  const sTx = await escrow.settlePayment(paymentId);
  const sReceipt = await sTx.wait();
  info("settle tx", explorerTx(sReceipt.hash));
  ev.set("settleTx", sReceipt.hash);
  ev.set("settleTxUrl", explorerTx(sReceipt.hash));

  const settled: boolean = await escrow.isSettled(paymentId);
  ev.assert("payment marked SETTLED on chain", settled);
  const merchantBalAfter = await provider.getBalance(merchant.address);
  ev.assert("merchant received the escrowed funds", merchantBalAfter === merchantBalBefore + amount,
    `${merchantBalBefore} -> ${merchantBalAfter}`);

  ev.write();
  ok("escrow policy enforcement proven live ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
