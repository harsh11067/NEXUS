/**
 * demo:validate-external — the infrastructure proof (N-R05 / N-A04): NEXUS
 * validates an agent that was NEVER minted in NEXUS. A second wallet registers
 * a plain ERC-8004 identity directly on the canonical registry (no NEXUS
 * contract involved), requests validation from the NEXUS TEE validator, and
 * NEXUS answers with a direct sealed run. Proves NEXUS is a validator for the
 * whole agent economy, not a walled garden.
 *
 *   pnpm demo:validate-external
 *   (needs BUYER_PRIVATE_KEY funded — it plays the external platform)
 */
import { Wallet, keccak256 } from "ethers";
import {
  erc8004Identity,
  requestValidation,
  answerValidation,
  verifyValidation,
  cardStorageUrl,
  uploadBytes,
  config,
  getProvider,
  network,
  networkName,
  explorerTx,
  optionalEnv,
} from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

async function main() {
  banner(`demo:validate-external · ${networkName()} · validating a NON-NEXUS agent`);
  const { wallet } = await preflight({ needDeployments: true });
  const ev = new Evidence("erc8004-validate-external");

  const buyerKey = optionalEnv("BUYER_PRIVATE_KEY");
  if (!buyerKey) fail("BUYER_PRIVATE_KEY not set — the external platform needs its own wallet");
  const external = new Wallet(buyerKey.startsWith("0x") ? buyerKey : `0x${buyerKey}`, getProvider());
  ev.set("externalWallet", external.address);
  info("external wallet", external.address);

  // 1. an external platform registers its own agent on the CANONICAL registry —
  //    no NEXUS contract involved anywhere in this registration
  console.log("  external platform registering its own ERC-8004 agent (not a NEXUS agent)…");
  const card = {
    type: "https://eips.ethereum.org/EIPS/eip-8004",
    name: "External Research Agent (non-NEXUS)",
    description: "An ERC-8004 agent from another platform, requesting NEXUS TEE validation.",
    services: [],
    registrations: [{ agentRegistry: `eip155:${network().chainId}:${network().erc8004.identity}` }],
  };
  const cardBytes = new TextEncoder().encode(JSON.stringify(card, null, 2));
  const { rootHash } = await uploadBytes(cardBytes, external);
  const identity = erc8004Identity(external);
  const regTx = await identity["register(string)"](cardStorageUrl(rootHash));
  const regReceipt = await regTx.wait();
  let externalAgentId = "";
  for (const log of regReceipt.logs) {
    try {
      const parsed = identity.interface.parseLog(log);
      if (parsed?.name === "Registered") externalAgentId = parsed.args.agentId.toString();
    } catch { /* skip */ }
  }
  if (!externalAgentId) fail("Registered event not found");
  ev.set("externalRegistration", { erc8004AgentId: externalAgentId, registerTx: regReceipt.hash, cardRootHash: rootHash });
  ev.assert("external agent registered on the canonical registry by a non-NEXUS wallet", true, regReceipt.hash);
  ok(`external ERC-8004 agent #${externalAgentId} → ${explorerTx(regReceipt.hash)}`);

  // 2. the external owner requests NEXUS validation (no nexusAgentId — the
  //    validator runs the task as a direct sealed run)
  const task = "Answer with exactly one word: what consensus family does Ethereum use after The Merge?";
  console.log("  external owner filing validationRequest naming the NEXUS validator…");
  const req = await requestValidation(externalAgentId, { task }, external);
  ev.set("request", req);
  ok(`validationRequest → ${explorerTx(req.requestTx)}`);

  // 3. NEXUS answers (operator wallet — the validator side)
  console.log("  NEXUS answering with a direct 0G Sealed Inference run…");
  const ans = await answerValidation(req.requestHash, wallet);
  ev.set("answer", {
    responseTx: ans.responseTx,
    response: ans.response,
    responseURI: ans.responseURI,
    responseHash: ans.responseHash,
    provider: ans.report.provider,
    chatID: ans.report.chatID,
    teeVerified: ans.report.teeVerified,
  });
  ev.assert("NEXUS posted a TEE-backed validation for a NON-NEXUS agent", ans.report.teeVerified === true, ans.responseTx);
  ok(`Validation Response → ${explorerTx(ans.responseTx)}`);

  // 4. independent re-verify
  const v = await verifyValidation(req.requestHash);
  ev.assert("anchored report hash matches on-chain", v.reportHashMatches === true);
  ev.assert("enclave re-verifies independently", v.teeReVerified === true);
  ev.set("reVerification", { valid: v.valid, reportHashMatches: v.reportHashMatches, teeReVerified: v.teeReVerified });

  ev.set("judgeNote", "an agent NEVER minted in NEXUS now carries an on-chain, hardware-backed NEXUS validation — infrastructure, not a walled garden");
  ev.write();
  ok("external-agent validation proven live ✅ — NEXUS validates the whole agent economy");
}

main().catch((e) => fail(e?.stack ?? String(e)));
