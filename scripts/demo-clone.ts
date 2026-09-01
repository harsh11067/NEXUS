/**
 * demo:clone — clone a proven agent (E-03). The creator earns the flat royalty,
 * cloneCount increments on chain, and the clone is owned by the cloner with a
 * persona re-encrypted to the cloner's key.
 *
 *   pnpm demo:clone [agentId]
 *   OG_NETWORK=mainnet pnpm demo:clone
 */
import { Wallet } from "ethers";
import {
  createAgent,
  cloneAgent,
  nexusAgent,
  getWallet,
  getProvider,
  pubKeyOf,
  decryptBlob,
  decodeBlob,
  downloadBytes,
  networkName,
  config,
} from "0g-nexus-sdk";
import type { AgentPersona } from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

const PERSONA: AgentPersona = {
  name: "Cloneable Original",
  description: "Demo agent that pays its creator a royalty on clone.",
  systemPrompt: "You are a research analyst.",
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
  banner(`demo:clone · ${networkName()} · royalty clone`);
  const { wallet, provider } = await preflight({ needDeployments: true });
  const ev = new Evidence("clone");

  let agentId = process.argv[2];
  if (!agentId) {
    console.log("  minting the original…");
    const created = await createAgent(PERSONA, getWallet());
    agentId = created.agentId;
    ok(`original agent #${agentId} minted`);
    ev.set("mintTx", created.mintTx);
  }
  ev.set("agentId", agentId);

  const agent = nexusAgent(wallet);
  const creator: string = await agent.creatorOf(agentId);
  const royalty: bigint = await agent.cloneRoyalty();
  const clonesBefore: bigint = await agent.cloneCount(agentId);
  const creatorBalBefore: bigint = await provider.getBalance(creator);
  info("creator", creator);
  info("royalty", `${royalty} wei`);

  // the cloner identity — clone re-encrypted to this key
  const clonerKey = config.buyerKey() ?? Wallet.createRandom().privateKey;
  const cloner = new Wallet(clonerKey, getProvider());
  info("cloner", cloner.address);

  console.log("  cloning (royalty paid to creator)…");
  const r = await cloneAgent(agentId, cloner.address, pubKeyOf(clonerKey), getWallet());
  ok(`clone #${r.newAgentId} minted`);
  info("clone tx", r.cloneTxUrl);
  ev.set("newAgentId", r.newAgentId);
  ev.set("cloneTx", r.cloneTx);
  ev.set("cloneTxUrl", r.cloneTxUrl);
  ev.set("royaltyWei", royalty.toString());

  const clonesAfter: bigint = await agent.cloneCount(agentId);
  ev.assert("cloneCount incremented on chain", clonesAfter === clonesBefore + 1n, `${clonesBefore} -> ${clonesAfter}`);

  const cloneOwner: string = await agent.ownerOf(r.newAgentId);
  ev.assert("clone is owned by the cloner", cloneOwner.toLowerCase() === cloner.address.toLowerCase(), cloneOwner);

  // royalty check: creator paid (skip when creator == payer — royalty nets out)
  if (creator.toLowerCase() !== wallet.address.toLowerCase()) {
    const creatorBalAfter: bigint = await provider.getBalance(creator);
    ev.assert("creator received the royalty", creatorBalAfter >= creatorBalBefore + royalty,
      `${creatorBalBefore} -> ${creatorBalAfter}`);
  } else {
    ev.set("royaltyNote", "creator == payer in this run; royalty nets out (tx event still shows the transfer)");
  }

  // clone persona decrypts with the CLONER key
  const blob = decodeBlob(await downloadBytes(r.newRootHash));
  const plain = decryptBlob(blob, clonerKey);
  ev.assert("clone persona decrypts with the cloner key", plain.length > 0, `${plain.length} bytes`);

  ev.write();
  ok("clone-with-royalty proven live ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
