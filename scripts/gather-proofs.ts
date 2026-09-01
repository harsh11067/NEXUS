/**
 * gather:proofs — pull REAL on-chain proofs for a deployment straight from the
 * chain and regenerate the evidence tables (PROOFS.md rule: never hand-type a
 * hash). Writes docs/PROOFS.<network>.md and prints the same content.
 *
 *   pnpm gather:proofs                       # active network (default galileo)
 *   pnpm gather:proofs -- --network mainnet  # 0G mainnet
 */
// parse --network BEFORE the SDK resolves it
const netArgIdx = process.argv.indexOf("--network");
if (netArgIdx !== -1 && process.argv[netArgIdx + 1]) {
  process.env.OG_NETWORK = process.argv[netArgIdx + 1];
}

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getProvider,
  loadDeployments,
  nexusAgent,
  compositeMinter,
  nexusEscrow,
  proofMesh,
  reputationRegistry,
  explorerTx,
  explorerAddress,
  config,
  networkName,
} from "@nexus/sdk";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
    } catch {
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

/** Deployment block of `address`, from the explorer's contract-creation API
 *  (the public RPC prunes historic state, so getCode binary-search is out).
 *  Falls back to a recent window if the explorer can't answer. */
async function deployBlockOf(address: string, head: number): Promise<number> {
  try {
    const url = `${config.explorerUrl()}/open/api?module=contract&action=getcontractcreation&contractaddresses=${address}`;
    const res = await fetch(url);
    const data: any = await res.json();
    const txHash = data?.result?.[0]?.txHash ?? data?.result?.[0]?.transactionHash;
    if (txHash) {
      const receipt = await getProvider().getTransactionReceipt(txHash);
      if (receipt) return receipt.blockNumber;
    }
  } catch { /* fall through */ }
  return Math.max(0, head - 300000);
}

async function main() {
  const net = networkName();
  const d = loadDeployments();
  const provider = getProvider();
  const head = await provider.getBlockNumber();
  // scan from the suite's deployment block — nothing NEXUS emitted can predate it
  const from = await deployBlockOf(d.NexusAgent, head);
  console.log(`# scanning blocks ${from} … ${head} on ${net} (chain ${config.chainId()})\n`);

  const agent = nexusAgent(provider);
  const minter = compositeMinter(provider);
  const escrow = nexusEscrow(provider);
  const proof = proofMesh(provider);
  const rep = reputationRegistry(provider);

  const sig = (c: any, name: string) => c.interface.getEvent(name)!.topicHash;
  const sections: { title: string; hits: Hit[] }[] = [];

  const mintLogs = await logsFor(d.NexusAgent, sig(agent, "AgentMinted"), from, head);
  sections.push({
    title: "ERC-7857 agent mints (AgentMinted)",
    hits: mintLogs.map((l) => {
      const p = agent.interface.parseLog(l)!;
      return { label: `agent #${p.args.agentId}`, txHash: l.txHash, block: l.blockNumber, extra: `owner ${p.args.owner}` };
    }),
  });

  const cloneLogs = await logsFor(d.NexusAgent, sig(agent, "AgentCloned"), from, head);
  sections.push({
    title: "Clones with royalty (AgentCloned)",
    hits: cloneLogs.map((l) => {
      const p = agent.interface.parseLog(l)!;
      return { label: `#${p.args.parentId} → #${p.args.newAgentId}`, txHash: l.txHash, block: l.blockNumber, extra: `cloner ${p.args.cloner}` };
    }),
  });

  const xferLogs = await logsFor(d.NexusAgent, sig(agent, "AgentTransferred"), from, head);
  sections.push({
    title: "Ownership transfers via re-encryption (AgentTransferred)",
    hits: xferLogs.map((l) => {
      const p = agent.interface.parseLog(l)!;
      return { label: `agent #${p.args.agentId}`, txHash: l.txHash, block: l.blockNumber, extra: `→ ${p.args.to ?? p.args.newOwner ?? ""}` };
    }),
  });

  const closeLogs = await logsFor(d.ProofMeshReceipts, sig(proof, "SessionClosed"), from, head);
  sections.push({
    title: "Proof sessions closed with trace + TEE attestation (SessionClosed)",
    hits: closeLogs.map((l) => ({ label: `session closed`, txHash: l.txHash, block: l.blockNumber })),
  });

  const recLogs = await logsFor(d.CompositeReceiptMinter, sig(minter, "CompositeReceiptMinted"), from, head);
  sections.push({
    title: "Composite receipts (CompositeReceiptMinted)",
    hits: recLogs.map((l) => {
      const p = minter.interface.parseLog(l)!;
      return { label: `receipt #${p.args.receiptId}`, txHash: l.txHash, block: l.blockNumber, extra: `agent #${p.args.agentId}` };
    }),
  });

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

  const refundLogs = await logsFor(d.NexusEscrow, sig(escrow, "PaymentRefunded"), from, head);
  sections.push({
    title: "Escrow TTL refunds — funds never lock (PaymentRefunded)",
    hits: refundLogs.map((l) => ({ label: `payment refunded`, txHash: l.txHash, block: l.blockNumber })),
  });

  const scoreLogs = await logsFor(d.ReputationRegistry, sig(rep, "ScoreUpdated"), from, head);
  sections.push({
    title: "Proof-anchored reputation writes (ScoreUpdated, each carries a receiptHash)",
    hits: scoreLogs.map((l) => {
      const p = rep.interface.parseLog(l)!;
      return { label: `agent #${p.args.agentId} → score ${p.args.newScore}`, txHash: l.txHash, block: l.blockNumber, extra: `receipt ${String(p.args.receiptHash).slice(0, 18)}…` };
    }),
  });

  // ---- ERC-8004 layer (when deployed on this network) ----
  if (d.ERC8004ValidationRegistry && d.NexusTEEValidator) {
    const { erc8004Validation, nexusTeeValidator } = await import("@nexus/sdk");
    const vreg = erc8004Validation(provider);
    const vali = nexusTeeValidator(provider);

    const reqLogs = await logsFor(d.ERC8004ValidationRegistry, sig(vreg, "ValidationRequest"), from, head);
    sections.push({
      title: "ERC-8004 validation requests (ValidationRequest)",
      hits: reqLogs.map((l) => {
        const p = vreg.interface.parseLog(l)!;
        return { label: `agent #${p.args.agentId}`, txHash: l.txHash, block: l.blockNumber, extra: `request ${String(p.args.requestHash).slice(0, 14)}…` };
      }),
    });

    const respLogs = await logsFor(d.ERC8004ValidationRegistry, sig(vreg, "ValidationResponse"), from, head);
    sections.push({
      title: "TEE-backed validation responses posted by NEXUS (ValidationResponse)",
      hits: respLogs.map((l) => {
        const p = vreg.interface.parseLog(l)!;
        return { label: `agent #${p.args.agentId} → ${p.args.response}/100`, txHash: l.txHash, block: l.blockNumber, extra: `tag ${p.args.tag}` };
      }),
    });

    const postLogs = await logsFor(d.NexusTEEValidator, sig(vali, "ValidationPosted"), from, head);
    sections.push({
      title: "NexusTEEValidator signed responses (ValidationPosted)",
      hits: postLogs.map((l) => {
        const p = vali.interface.parseLog(l)!;
        return { label: `agent #${p.args.agentId} → ${p.args.response}/100`, txHash: l.txHash, block: l.blockNumber, extra: `report ${String(p.args.responseHash).slice(0, 14)}…` };
      }),
    });
  }

  // ---- emit markdown (generated, never hand-typed) ----
  const lines: string[] = [];
  lines.push(`# NEXUS live proofs — ${net} (chainId ${config.chainId()})`);
  lines.push("");
  lines.push(`> AUTO-GENERATED by \`pnpm gather:proofs -- --network ${net}\` at ${new Date().toISOString()}.`);
  lines.push(`> Every hash below was read from the live chain (blocks ${from}…${head}). Do not edit by hand.`);
  lines.push("");
  lines.push("## Deployed contracts");
  lines.push("");
  lines.push("| Contract | Address | Explorer |");
  lines.push("| --- | --- | --- |");
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" && v.startsWith("0x") && v.length === 42) {
      lines.push(`| ${k} | \`${v}\` | [chainscan](${explorerAddress(v)}) |`);
    }
  }
  lines.push("");
  for (const s of sections) {
    lines.push(`## ${s.title}  — ${s.hits.length}`);
    lines.push("");
    if (s.hits.length === 0) {
      lines.push("_none in scan window_");
    } else {
      lines.push("| What | Block | Tx |");
      lines.push("| --- | --- | --- |");
      for (const h of s.hits) {
        lines.push(`| ${h.label}${h.extra ? ` (${h.extra})` : ""} | ${h.block} | [${h.txHash.slice(0, 14)}…](${explorerTx(h.txHash)}) |`);
      }
    }
    lines.push("");
  }
  const md = lines.join("\n");
  const outPath = resolve(ROOT, `docs/PROOFS.${net}.md`);
  writeFileSync(outPath, md);
  console.log(md);
  console.log(`\n# written to docs/PROOFS.${net}.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
