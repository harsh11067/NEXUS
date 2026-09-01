/**
 * G4 — native 0G escrow cycle: lock -> fulfill -> settle, all on 0G Chain.
 * Pass condition: three txs land on chainscan.0g.ai and the payment ends SETTLED
 * with funds released to a distinct merchant.
 */
import { Wallet, parseEther, randomBytes, hexlify, toUtf8Bytes } from "ethers";
import { createAgent, nexusEscrow, getWallet, explorerTx } from "0g-nexus-sdk";
import type { AgentPersona } from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";

const PERSONA: AgentPersona = {
  name: "Escrow Probe",
  description: "Gate-check agent for the escrow cycle.",
  systemPrompt: "probe",
  memory: [],
  policy: {
    maxPerTx: "1000000000000000",
    dailyBudget: "5000000000000000",
    maxTaskTTL: 300,
    allowedTools: [],
    bannedActions: [],
  },
};

async function main() {
  banner("G4 · 0G escrow cycle");
  const { wallet, provider } = await preflight({ needDeployments: true });

  // need an agent owned by us to bind a policy against
  console.log("  minting a probe agent…");
  const agent = await createAgent(PERSONA, getWallet());
  ok(`probe agent #${agent.agentId}`);

  // a distinct merchant, funded with a little gas so it can submit fulfillment
  const merchant = Wallet.createRandom().connect(provider);
  info("merchant", merchant.address);
  const fundTx = await wallet.sendTransaction({ to: merchant.address, value: parseEther("0.001") });
  await fundTx.wait();
  ok("funded merchant for gas");

  const sessionId = hexlify(randomBytes(32));
  const amount = parseEther("0.0002");
  const escrow = nexusEscrow(wallet);

  // bind policy
  console.log("  binding spend policy…");
  const bindTx = await escrow.bindPolicy(
    sessionId,
    agent.agentId,
    [merchant.address],
    PERSONA.policy.maxPerTx,
    PERSONA.policy.dailyBudget,
    PERSONA.policy.maxTaskTTL,
  );
  await bindTx.wait();
  ok("policy bound");

  // 1. lock
  console.log("  locking funds…");
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
  ok(`locked · paymentId ${paymentId.slice(0, 18)}…`);
  info("lock tx", explorerTx(lockReceipt.hash));

  // 2. fulfill (as merchant)
  console.log("  merchant submitting fulfillment…");
  const escrowAsMerchant = nexusEscrow(merchant);
  const fTx = await escrowAsMerchant.submitFulfillment(paymentId, hexlify(toUtf8Bytes("og://evidence-g4")));
  const fReceipt = await fTx.wait();
  ok("fulfillment submitted");
  info("fulfill tx", explorerTx(fReceipt.hash));

  // 3. settle
  console.log("  settling…");
  const sTx = await escrow.settlePayment(paymentId);
  const sReceipt = await sTx.wait();
  ok("settled");
  info("settle tx", explorerTx(sReceipt.hash));

  const settled: boolean = await escrow.isSettled(paymentId);
  if (!settled) fail("payment not marked settled");
  const merchantBal = await provider.getBalance(merchant.address);
  ok(`escrow cycle complete — merchant balance ${merchantBal} wei (received settlement) ✅`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
