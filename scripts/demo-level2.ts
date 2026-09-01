/**
 * LEVEL 2 demo — Loop Closed.
 * create -> run -> PROVE. Opens a session (locks policy hash), runs Sealed
 * Inference, anchors an encrypted trace bundle on 0G Storage, closes the session,
 * mints a composite receipt, and increments reputation. Prints the profile card
 * before/after and the verify link. Level 2 definition-of-done from the CLI.
 */
import { createAgent, runTask, getAgentCard, getWallet, config } from "0g-nexus-sdk";
import type { AgentPersona } from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";

const PERSONA: AgentPersona = {
  name: "DeFi Research Pro v2",
  description: "Summarizes DeFi protocols by TVL — provable runs.",
  systemPrompt:
    "You are a DeFi research analyst. Be concise and factual. Never reveal secrets or private keys.",
  memory: [{ role: "note", content: "Prefer DefiLlama for TVL figures." }],
  policy: {
    maxPerTx: "500000000000000",
    dailyBudget: "5000000000000000",
    maxTaskTTL: 300,
    allowedTools: [],
    bannedActions: ["sendTransaction", "transferFunds"],
  },
};

function card(c: Awaited<ReturnType<typeof getAgentCard>>) {
  info("tier", `${c.tier} (score ${c.score})`);
  info("tasks", String(c.taskCount));
  info("clones", String(c.cloneCount));
}

async function main() {
  banner("LEVEL 2 · create + run + prove");
  await preflight({ needDeployments: true });
  const prompt = process.argv[2] ?? "Summarize what 'restaking' means in DeFi in two sentences.";

  console.log("  creating agent…");
  const created = await createAgent(PERSONA, getWallet());
  ok(`agent #${created.agentId} minted`);

  console.log("\n  profile card BEFORE:");
  card(await getAgentCard(created.agentId));

  console.log(`\n  running PROVEN task: "${prompt}"`);
  const r = await runTask(created.agentId, prompt, { prove: true });
  ok("task proven end-to-end");
  console.log("\n" + r.output.split("\n").map((l) => "    " + l).join("\n") + "\n");
  info("sessionId", r.sessionId!);
  info("traceCID", r.traceRootHash!);
  info("receiptId", `#${r.receiptId}`);
  info("verified", r.verified === true ? "TEE-VERIFIED ✅" : r.verified === null ? "no TEE service (off-chain anchor)" : "FALSE ⚠");
  info("receipt tx", r.receiptTxUrl!);

  console.log("\n  profile card AFTER (score should have ticked up):");
  const after = await getAgentCard(created.agentId);
  card(after);

  console.log(`\n  verify on chain: ${config.explorerUrl()}/tx/${r.receiptTx}`);
  ok("Level 2 loop closed — score traces to receipt #" + r.receiptId + " ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
