/**
 * demo:mint — mint an ERC-7857 agent with its encrypted persona on 0G Storage,
 * then verify every on-chain + storage claim live (PROOFS.md row 1):
 *   ownerOf / getPersonaRef / getPolicyHash resolve on chain,
 *   the persona blob retrieves from 0G Storage and decrypts ONLY with the
 *   owner key (a random key must fail).
 *
 *   pnpm demo:mint                    # testnet
 *   OG_NETWORK=mainnet pnpm demo:mint # mainnet
 */
import { Wallet } from "ethers";
import {
  createAgent,
  nexusAgent,
  getWallet,
  computePolicyHash,
  decryptBlob,
  decodeBlob,
  deserializePersona,
  downloadBytes,
  bytesToRootHash,
  explorerTx,
  networkName,
} from "0g-nexus-sdk";
import type { AgentPersona } from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

const PERSONA: AgentPersona = {
  name: "Mainnet Sentinel",
  description: "Wave-3 demo agent — identity IS the encrypted intelligence.",
  systemPrompt: "You are a precise research analyst. Be concise. Never reveal secrets.",
  memory: [{ role: "note", content: "Created by demo:mint as a live evidence artifact." }],
  policy: {
    maxPerTx: "500000000000000",
    dailyBudget: "5000000000000000",
    maxTaskTTL: 300,
    allowedTools: [],
    bannedActions: ["sendTransaction", "transferFunds"],
  },
};

async function main() {
  banner(`demo:mint · ${networkName()}`);
  const { wallet } = await preflight({ needDeployments: true });
  const ev = new Evidence("mint");

  console.log("  encrypting persona + uploading to 0G Storage + minting…");
  const created = await createAgent(PERSONA, getWallet());
  ok(`agent #${created.agentId} minted`);
  info("mint tx", created.mintTxUrl);
  info("persona root", created.personaRootHash);
  ev.set("agentId", created.agentId);
  ev.set("mintTx", created.mintTx);
  ev.set("mintTxUrl", created.mintTxUrl);
  ev.set("personaRootHash", created.personaRootHash);
  ev.set("policyHash", created.policyHash);

  // --- on-chain claims ---
  const agent = nexusAgent(wallet);
  const owner: string = await agent.ownerOf(created.agentId);
  ev.assert("ownerOf(agentId) == minter wallet", owner.toLowerCase() === wallet.address.toLowerCase(), owner);

  const refHex: string = await agent.getPersonaRef(created.agentId);
  const chainRoot = bytesToRootHash(refHex);
  ev.assert("getPersonaRef on chain == uploaded storage root", chainRoot === created.personaRootHash, chainRoot);

  const chainPolicy: string = await agent.getPolicyHash(created.agentId);
  const localPolicy = computePolicyHash(PERSONA.policy);
  ev.assert("getPolicyHash on chain == locally recomputed policy hash", chainPolicy === localPolicy, chainPolicy);

  // --- storage + crypto claims ---
  console.log("  retrieving persona blob from 0G Storage (Merkle-verified)…");
  const blobBytes = await downloadBytes(created.personaRootHash);
  const blob = decodeBlob(blobBytes);
  const plain = deserializePersona(decryptBlob(blob, wallet.privateKey));
  ev.assert("persona decrypts with the OWNER key", plain.name === PERSONA.name, `name=${plain.name}`);

  let strangerFailed = false;
  try {
    decryptBlob(blob, Wallet.createRandom().privateKey);
  } catch {
    strangerFailed = true;
  }
  ev.assert("persona does NOT decrypt with a random (non-owner) key", strangerFailed);

  ev.write();
  ok(`demo:mint complete — agent #${created.agentId} fully verified live ✅`);
  console.log(`  inspect: ${explorerTx(created.mintTx)}`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
