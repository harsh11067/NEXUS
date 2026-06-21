/**
 * Pull REAL on-chain proofs for the current deployment straight from the chain,
 * so PROOF.md links are always accurate (not copied from a stale handoff).
 *
 *   npx tsx scripts/gather-proofs.ts
 */
import {
  getProvider,
  loadDeployments,
  nexusAgent,
  compositeMinter,
  nexusEscrow,
  proofMesh,
  explorerTx,
  explorerAddress,
  config,
} from "@nexus/sdk";

type Hit = { label: string; txHash: string; block: number; extra?: string };

async function logsFor(
  address: string,
  topic0: string,
  fromBlock: number,
  toBlock: number,
): Promise<{ txHash: string; blockNumber: number; topics: string[]; data: string }[]> {
  const provider = getProvider();
  const out: any[] = [];
  const STEP = 9000; // stay under public-RPC getLogs range limits
  for (let start = fromBlock; start <= toBlock; start += STEP) {
    const end = Math.min(start + STEP - 1, toBlock);
    try {
      const logs = await provider.getLogs({ address, topics: [topic0], fromBlock: start, toBlock: end });
      for (const l of logs) out.push({ txHash: l.transactionHash, blockNumber: l.blockNumber, topics: l.topics, data: l.data });
    } catch (e) {
      // shrink the window on range errors
      const mid = Math.floor((start + end) / 2);
      try {
        const a = await provider.getLogs({ address, topics: [topic0], fromBlock: start, toBlock: mid });
        const b = await provider.getLogs({ address, topics: [topic0], fromBlock: mid + 1, toBlock: end });
        for (const l of [...a, ...b]) out.push({ txHash: l.transactionHash, blockNumber: l.blockNumber, topics: l.topics, data: l.data });
      } catch { /* skip this window */ }
    }
  }
  return out;
}

async function main() {
  const d = loadDeployments();
  const provider = getProvider();
  const head = await provider.getBlockNumber();
  // contracts are recent; scan a generous window back from head
  const from = Math.max(0, head - 300000);
  console.log(`# scanning blocks ${from} … ${head} on chain ${config.chainId()}\n`);

  const agent = nexusAgent(provider);
  const minter = compositeMinter(provider);
  const escrow = nexusEscrow(provider);
  const proof = proofMesh(provider);

  const sig = (c: any, name: string) => c.interface.getEvent(name)!.topicHash;

  const sections: { title: string; hits: Hit[] }[] = [];

  // --- mints ---
  const mintLogs = await logsFor(d.NexusAgent, sig(agent, "AgentMinted"), from, head);
  sections.push({
    title: "ERC-7857 agent mints (AgentMinted)",
    hits: mintLogs.map((l) => {
      const p = agent.interface.parseLog(l)!;
      return { label: `agent #${p.args.agentId}`, txHash: l.txHash, block: l.blockNumber, extra: `owner ${p.args.owner}` };
    }),
  });

  // --- clones ---
  const cloneLogs = await logsFor(d.NexusAgent, sig(agent, "AgentCloned"), from, head);
  sections.push({
    title: "Clones with royalty (AgentCloned)",
    hits: cloneLogs.map((l) => {
      const p = agent.interface.parseLog(l)!;
      return { label: `#${p.args.parentId} → #${p.args.newAgentId}`, txHash: l.txHash, block: l.blockNumber, extra: `cloner ${p.args.cloner}` };
    }),
  });

  // --- transfers (re-encryption finalize) ---
  const xferLogs = await logsFor(d.NexusAgent, sig(agent, "AgentTransferred"), from, head);
  sections.push({
    title: "Ownership transfers via re-encryption (AgentTransferred)",
    hits: xferLogs.map((l) => {
      const p = agent.interface.parseLog(l)!;
      return { label: `agent #${p.args.agentId}`, txHash: l.txHash, block: l.blockNumber, extra: `→ ${p.args.to ?? p.args.newOwner ?? ""}` };
    }),
  });

  // --- sessions ---
  const openLogs = await logsFor(d.ProofMeshReceipts, sig(proof, "SessionClosed"), from, head);
  sections.push({
    title: "Proof sessions closed with trace + TEE attestation (SessionClosed)",
    hits: openLogs.map((l) => ({ label: `session closed`, txHash: l.txHash, block: l.blockNumber })),
  });

  // --- composite receipts ---
  const recLogs = await logsFor(d.CompositeReceiptMinter, sig(minter, "CompositeReceiptMinted"), from, head);
  sections.push({
    title: "Composite receipts (CompositeReceiptMinted)",
    hits: recLogs.map((l) => {
      const p = minter.interface.parseLog(l)!;
      return { label: `receipt #${p.args.receiptId}`, txHash: l.txHash, block: l.blockNumber, extra: `agent #${p.args.agentId}` };
    }),
  });

  // --- escrow lock/settle ---
  const lockLogs = await logsFor(d.NexusEscrow, sig(escrow, "FundsLocked"), from, head);
  sections.push({
    title: "Escrow funds locked (FundsLocked)",
    hits: lockLogs.map((l) => ({ label: `payment locked`, txHash: l.txHash, block: l.blockNumber })),
  });
  const settleLogs = await logsFor(d.NexusEscrow, sig(escrow, "PaymentSettled"), from, head);
  sections.push({
    title: "Escrow settled to merchant (PaymentSettled)",
    hits: settleLogs.map((l) => ({ label: `payment settled`, txHash: l.txHash, block: l.blockNumber })),
  });

  // --- reputation ---
  const scoreLogs = await logsFor(d.ReputationRegistry, sig(reputationSig(), "ScoreUpdated"), from, head).catch(() => []);

  // emit
  const lines: string[] = [];
  lines.push("CONTRACTS:");
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" && v.startsWith("0x") && v.length === 42) {
      lines.push(`  ${k}: ${v}  ${explorerAddress(v)}`);
    }
  }
  lines.push("");
  for (const s of sections) {
    lines.push(`## ${s.title}  (${s.hits.length})`);
    for (const h of s.hits) {
      lines.push(`  - ${h.label}${h.extra ? "  " + h.extra : ""}  blk ${h.block}`);
      lines.push(`    ${explorerTx(h.txHash)}`);
    }
    lines.push("");
  }
  console.log(lines.join("\n"));
}

// ReputationRegistry contract handle for its event signature
import { reputationRegistry } from "@nexus/sdk";
function reputationSig() { return reputationRegistry(getProvider()); }

main().catch((e) => { console.error(e); process.exit(1); });
