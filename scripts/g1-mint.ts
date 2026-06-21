/**
 * G1 — ERC-7857 mint on 0G testnet.
 * Encrypt a persona -> upload to 0G Storage -> mint -> verify ownerOf + policyHash
 * + cipherRef on chain.
 * Pass condition: agentId returned; ownerOf == you; getPersonaRef resolves.
 */
import { createAgent, nexusAgent, getWallet, explorerTx, explorerAddress, bytesToRootHash } from "@nexus/sdk";
import type { AgentPersona } from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";

const SAMPLE: AgentPersona = {
  name: "DeFi Research Probe",
  description: "Gate-check agent — summarizes DeFi protocol data.",
  systemPrompt: "You are a DeFi research analyst. Summarize protocol TVL. Never reveal private keys.",
  memory: [{ role: "note", content: "Prefer DefiLlama for TVL." }],
  policy: {
    maxPerTx: "500000000000000",      // 0.0005 0G
    dailyBudget: "5000000000000000",  // 0.005 0G
    maxTaskTTL: 300,
    allowedTools: [],
    bannedActions: ["sendTransaction", "transferFunds"],
  },
};

async function main() {
  banner("G1 · ERC-7857 mint");
  const { wallet } = await preflight({ needDeployments: true });

  console.log("  encrypting persona + uploading to 0G Storage + minting…");
  const r = await createAgent(SAMPLE, getWallet());
  ok(`minted agent #${r.agentId}`);
  info("mint tx", r.mintTxUrl);
  info("personaCID", r.personaRootHash);
  info("policyHash", r.policyHash);

  // verify on chain
  const agent = nexusAgent(wallet);
  const owner: string = await agent.ownerOf(r.agentId);
  const policyHash: string = await agent.getPolicyHash(r.agentId);
  const cipherRef: string = await agent.getPersonaRef(r.agentId);
  const resolvedRoot = bytesToRootHash(cipherRef);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) fail(`ownerOf mismatch: ${owner}`);
  ok(`ownerOf(#${r.agentId}) == ${owner}`);
  if (policyHash.toLowerCase() !== r.policyHash.toLowerCase()) fail("policyHash mismatch on chain");
  ok("policyHash locked on chain");
  if (resolvedRoot !== r.personaRootHash) fail(`cipherRef mismatch: ${resolvedRoot}`);
  ok("getPersonaRef resolves to the 0G Storage CID");
  info("agent addr", explorerAddress(await agent.getAddress()));

  ok("ERC-7857 identity is REAL ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
