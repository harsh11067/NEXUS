/**
 * demo:validate — the ERC-8004 validation loop, end-to-end on the live chain
 * (N-R04 / N-E02): the agent's owner files a validationRequest naming the
 * NEXUS TEE validator → NEXUS re-executes the task in 0G Sealed Inference
 * (full receipt loop) → the trusted signer signs the result → the response
 * lands on-chain → we independently re-verify it (report hash + enclave).
 *
 *   pnpm demo:validate [erc8004AgentId] [nexusAgentId]
 *   (defaults: the identity registered by demo:erc8004-register for agent 1)
 */
import {
  requestValidation,
  answerValidation,
  verifyValidation,
  findIdentity,
  networkName,
  explorerTx,
} from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

async function main() {
  banner(`demo:validate · ${networkName()} · ERC-8004 TEE validation`);
  const { wallet } = await preflight({ needDeployments: true });
  const ev = new Evidence("erc8004-validate");

  const nexusAgentId = process.argv[3] ?? "1";
  let erc8004AgentId = process.argv[2];
  if (!erc8004AgentId) {
    const found = await findIdentity(nexusAgentId);
    if (!found) fail(`NEXUS agent #${nexusAgentId} has no ERC-8004 identity — run pnpm demo:erc8004-register first`);
    erc8004AgentId = found.erc8004AgentId;
  }
  ev.set("erc8004AgentId", erc8004AgentId);
  ev.set("nexusAgentId", nexusAgentId);

  const task = "State the exact keccak-256 output length in bits, as a single number.";
  console.log("  filing validationRequest on-chain (request payload → 0G Storage)…");
  const req = await requestValidation(erc8004AgentId, { task, nexusAgentId }, wallet);
  ev.set("request", req);
  info("requestHash", req.requestHash);
  info("requestTx", req.requestTx);
  ok(`validationRequest → ${explorerTx(req.requestTx)}`);

  console.log("  NEXUS validator answering: sealed run + report anchor + signed response…");
  const ans = await answerValidation(req.requestHash, wallet);
  ev.set("answer", {
    responseTx: ans.responseTx,
    response: ans.response,
    responseURI: ans.responseURI,
    responseHash: ans.responseHash,
    provider: ans.report.provider,
    chatID: ans.report.chatID,
    model: ans.report.model,
    teeVerified: ans.report.teeVerified,
    nexusReceiptId: ans.report.nexusReceiptId,
  });
  info("responseTx", ans.responseTx);
  info("score", String(ans.response));
  info("TEE verified", String(ans.report.teeVerified));
  ok(`Validation Response posted → ${explorerTx(ans.responseTx)}`);
  ev.assert("validation ran hardware-verified (processResponse === true)", ans.report.teeVerified === true);
  ev.assert("response score reflects the enclave result (100)", ans.response === 100);

  console.log("  independent re-verification (report hash + fresh enclave check)…");
  const v = await verifyValidation(req.requestHash);
  ev.set("reVerification", {
    valid: v.valid,
    reportHashMatches: v.reportHashMatches,
    teeReVerified: v.teeReVerified,
    onChainResponse: v.status.response,
  });
  ev.assert("response recorded on-chain", v.status.hasResponse);
  ev.assert("anchored report keccak == on-chain responseHash", v.reportHashMatches === true);
  ev.assert("underlying run's enclave signature re-verifies now", v.teeReVerified === true);

  ev.set("judgeNote", `re-run yourself: processResponse("${ans.report.provider}", "${ans.report.chatID}") → true`);
  ev.write();
  ok("ERC-8004 validation loop proven live: request → sealed run → on-chain TEE-backed response → independent re-verify ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
