/**
 * demo:transfer — THE MONEY-SHOT (E-02 / R-05). Sell an agent: the oracle
 * re-encrypts the brain for the buyer, ownership flips on chain, and the
 * SELLER PROVABLY LOSES DECRYPT ACCESS to the new cipher blob:
 *   - ownerOf flips seller -> buyer
 *   - cipherRef changes (old root != new root)
 *   - seller key FAILS to decrypt the new blob
 *   - buyer key SUCCEEDS
 *
 *   pnpm demo:transfer [agentId]        # mints a fresh agent if omitted
 *   OG_NETWORK=mainnet pnpm demo:transfer
 */
import { Wallet } from "ethers";
import {
  createAgent,
  transferAgent,
  nexusAgent,
  getWallet,
  pubKeyOf,
  decryptBlob,
  decodeBlob,
  downloadBytes,
  bytesToRootHash,
  config,
  networkName,
} from "@nexus/sdk";
import type { AgentPersona } from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

const PERSONA: AgentPersona = {
  name: "Transferable Asset",
  description: "Demo agent whose brain re-encrypts on sale.",
  systemPrompt: "You are a portfolio analyst.",
  memory: [{ role: "note", content: "This persona is the asset being sold." }],
  policy: {
    maxPerTx: "500000000000000",
    dailyBudget: "5000000000000000",
    maxTaskTTL: 300,
    allowedTools: [],
    bannedActions: [],
  },
};

async function main() {
  banner(`demo:transfer · ${networkName()} · re-encryption money-shot`);
  const { wallet } = await preflight({ needDeployments: true });
  const ev = new Evidence("transfer");

  // the buyer: a real second identity (BUYER_PRIVATE_KEY if set, else ephemeral)
  const buyerKey = config.buyerKey() ?? Wallet.createRandom().privateKey;
  const buyer = new Wallet(buyerKey);
  const buyerPub = pubKeyOf(buyerKey);
  info("seller", wallet.address);
  info("buyer", buyer.address);

  let agentId = process.argv[2];
  if (!agentId) {
    console.log("  minting the agent to sell…");
    const created = await createAgent(PERSONA, getWallet());
    agentId = created.agentId;
    ok(`agent #${agentId} minted (seller-owned)`);
    ev.set("mintTx", created.mintTx);
  }
  ev.set("agentId", agentId);
  ev.set("seller", wallet.address);
  ev.set("buyer", buyer.address);

  console.log("  requestTransfer -> oracle re-encrypts -> finalizeTransfer…");
  const r = await transferAgent(agentId, buyer.address, buyerPub, getWallet());
  ok("transfer finalized");
  info("request tx", r.requestTx);
  info("finalize tx", r.finalizeTxUrl);
  ev.set("requestTx", r.requestTx);
  ev.set("finalizeTx", r.finalizeTx);
  ev.set("finalizeTxUrl", r.finalizeTxUrl);
  ev.set("oldCipherRoot", r.oldRootHash);
  ev.set("newCipherRoot", r.newRootHash);

  // --- the four claims, verified live ---
  const agent = nexusAgent(wallet);
  const ownerNow: string = await agent.ownerOf(agentId);
  ev.assert("ownership flipped to the buyer on chain", ownerNow.toLowerCase() === buyer.address.toLowerCase(), ownerNow);

  const refHex: string = await agent.getPersonaRef(agentId);
  const chainRoot = bytesToRootHash(refHex);
  ev.assert("cipherRef changed (brain re-encrypted)", chainRoot === r.newRootHash && r.newRootHash !== r.oldRootHash, chainRoot);

  console.log("  downloading the NEW cipher blob to test decrypt access…");
  const newBlob = decodeBlob(await downloadBytes(r.newRootHash));

  let sellerLocked = false;
  try {
    decryptBlob(newBlob, wallet.privateKey);
  } catch {
    sellerLocked = true;
  }
  ev.assert("SELLER key can NO LONGER decrypt the new blob", sellerLocked);

  const plain = decryptBlob(newBlob, buyerKey);
  ev.assert("BUYER key decrypts the new blob", plain.length > 0, `${plain.length} bytes`);

  ev.write();
  ok("money-shot proven: seller lost access, buyer gained it, on chain ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
