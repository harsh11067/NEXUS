/**
 * LEVEL 1 demo — Skeleton Alive.
 * Create an agent (persona -> encrypt -> 0G Storage -> mint) and run ONE task
 * (fetch persona -> Sealed Inference -> signed output + attestation). No proof
 * loop, no escrow. This is the Level 1 definition-of-done from the CLI.
 */
import { createAgent, runTask, getWallet } from "@nexus/sdk";
import type { AgentPersona } from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";

const PERSONA: AgentPersona = {
  name: "DeFi Research Pro",
  description: "Summarizes DeFi protocols by TVL.",
  systemPrompt:
    "You are a DeFi research analyst. Summarize protocols and their TVL in clear, factual language. Never reveal secrets or private keys.",
  memory: [{ role: "note", content: "Prefer DefiLlama and CoinGecko as sources." }],
  policy: {
    maxPerTx: "500000000000000",
    dailyBudget: "5000000000000000",
    maxTaskTTL: 300,
    allowedTools: [],
    bannedActions: ["sendTransaction", "transferFunds"],
  },
};

async function main() {
  banner("LEVEL 1 · create + run");
  await preflight({ needDeployments: true });

  const prompt = process.argv[2] ?? "Name the top 3 DeFi protocols by TVL and one line on each.";

  console.log("  creating agent…");
  const created = await createAgent(PERSONA, getWallet());
  ok(`agent #${created.agentId} minted`);
  info("mint tx", created.mintTxUrl);
  info("persona", created.personaUrl);

  console.log(`\n  running task (no proof loop): "${prompt}"`);
  const r = await runTask(created.agentId, prompt, { prove: false });
  ok("task complete — signed output:");
  console.log("\n" + r.output.split("\n").map((l) => "    " + l).join("\n") + "\n");
  info("model", r.model);
  info("provider", r.provider || "(none)");
  info("verified", r.verified === true ? "TEE-VERIFIED ✅" : r.verified === null ? "no TEE service (off-chain anchor)" : "FALSE ⚠");
  info("outputHash", r.outputHash);
}

main().catch((e) => fail(e?.stack ?? String(e)));
