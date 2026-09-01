/**
 * ProofPass Offline Bundles (FUTURE.md §7) — verification without ANY server.
 *
 * exportProofBundle() packages a receipt's PRIMARY evidence into one JSON:
 * the on-chain rows (receipt, session), the raw encrypted trace blob from
 * 0G Storage (base64), the TEE reference {provider, chatID}, and the chain
 * coordinates. verifyProofBundle() then re-derives, with NO network:
 *
 *   B1  receiptHash  == keccak(abi.encode(agentId, sessionId, paymentId,
 *                        traceCIDHash, chainId))          (the receipt's own binding)
 *   B2  traceCIDHash == keccak(anchored trace CID bytes)  (chain ↔ storage link)
 *   B3  0G Merkle root of the embedded trace blob == the anchored CID
 *                        (one flipped byte in the blob fails this)
 *
 * plus, when online, the fresh enclave re-check (B4: processResponse) and a
 * live chain cross-check (B5: the receipt row still matches). Honest scope:
 * offline mode proves internal consistency against the hashes the chain
 * anchored; trusting those anchors without a live RPC means trusting the
 * bundle's chain coordinates — B5 closes that when a connection exists.
 */
import { keccak256, AbiCoder, hexlify, type Wallet } from "ethers";
import { getProvider, config, network, loadDeployments, explorerAddress } from "./config.js";
import { compositeMinter, proofMesh } from "./contracts.js";
import { downloadBytes, bytesToRootHash, computeRootHash } from "./storage.js";

export interface ProofBundleFile {
  standard: "nexus-proof-bundle";
  version: 1;
  exportedAt: number;
  network: { name: string; chainId: number; rpcUrl: string; explorerUrl: string };
  contracts: { CompositeReceiptMinter: string; ProofMeshReceipts: string; NexusAgent: string };
  receipt: {
    receiptId: string;
    agentId: string;
    sessionId: string;
    paymentId: string;
    traceCIDHash: string;
    receiptHash: string;
    timestamp: number;
  };
  session: { policyHash: string; taskHash: string; opener: string; valid: boolean };
  tee: { provider: string; chatID: string; model: string; teeSignatureHex: string };
  trace: { anchoredCID: string; blobBase64: string };
}

export async function exportProofBundle(receiptId: string): Promise<ProofBundleFile> {
  const provider = getProvider();
  const d = loadDeployments();
  const minter = compositeMinter(provider);
  const proof = proofMesh(provider);

  const [r] = await minter.getReceipt(receiptId);
  if (Number(r.timestamp) === 0) throw new Error(`receipt #${receiptId} not found`);

  const s = await proof.sessions(r.sessionId);
  const [valid] = await proof.verifySession(r.sessionId);
  const traceCID: string = await proof.getTraceCID(r.sessionId);
  const teeSig: string = await proof.getTeeSignature(r.sessionId);
  const traceRootHash = bytesToRootHash(traceCID);
  const blob = await downloadBytes(traceRootHash);

  // the anchored attestation carries {provider, chatID, model}
  let tee = { provider: "", chatID: "", model: "" };
  try {
    tee = JSON.parse(Buffer.from(teeSig.slice(2), "hex").toString("utf8"));
  } catch { /* leave blank — stated, not faked */ }

  return {
    standard: "nexus-proof-bundle",
    version: 1,
    exportedAt: Math.floor(Date.now() / 1000),
    network: {
      name: config.network(),
      chainId: network().chainId,
      rpcUrl: config.rpcUrl(),
      explorerUrl: config.explorerUrl(),
    },
    contracts: {
      CompositeReceiptMinter: d.CompositeReceiptMinter,
      ProofMeshReceipts: d.ProofMeshReceipts,
      NexusAgent: d.NexusAgent,
    },
    receipt: {
      receiptId,
      agentId: r.agentId.toString(),
      sessionId: r.sessionId,
      paymentId: r.paymentId,
      traceCIDHash: r.traceCIDHash,
      receiptHash: r.receiptHash,
      timestamp: Number(r.timestamp),
    },
    session: { policyHash: s.policyHash, taskHash: s.taskHash, opener: s.opener, valid },
    tee: { provider: (tee as any).provider ?? "", chatID: (tee as any).chatID ?? "", model: (tee as any).model ?? "", teeSignatureHex: teeSig },
    trace: { anchoredCID: traceCID, blobBase64: Buffer.from(blob).toString("base64") },
  };
}

export interface BundleCheck {
  id: string;
  claim: string;
  status: boolean | null;
  detail: string;
}

/** Offline verification (B1–B3). Pure computation — zero network. */
export async function verifyProofBundleOffline(bundle: ProofBundleFile): Promise<{ valid: boolean; checks: BundleCheck[] }> {
  const checks: BundleCheck[] = [];

  const expectHash = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "bytes32", "bytes32", "uint256"],
      [bundle.receipt.agentId, bundle.receipt.sessionId, bundle.receipt.paymentId, bundle.receipt.traceCIDHash, bundle.network.chainId],
    ),
  );
  checks.push({
    id: "B1",
    claim: "receiptHash re-derives from (agentId, sessionId, paymentId, traceCIDHash, chainId)",
    status: expectHash === bundle.receipt.receiptHash,
    detail: expectHash,
  });

  const cidHash = keccak256(bundle.trace.anchoredCID);
  checks.push({
    id: "B2",
    claim: "on-chain traceCIDHash == keccak256(anchored trace CID bytes)",
    status: cidHash === bundle.receipt.traceCIDHash,
    detail: cidHash,
  });

  const blob = new Uint8Array(Buffer.from(bundle.trace.blobBase64, "base64"));
  const root = await computeRootHash(blob);
  const anchoredRoot = bytesToRootHash(bundle.trace.anchoredCID);
  checks.push({
    id: "B3",
    claim: "0G Merkle root of the embedded trace blob == anchored CID (tamper-evident)",
    status: root === anchoredRoot,
    detail: `computed ${root}`,
  });

  return { valid: checks.every((c) => c.status === true), checks };
}

/** Online extension: fresh enclave re-check + live chain cross-check (B4–B5). */
export async function verifyProofBundleOnline(bundle: ProofBundleFile): Promise<{ valid: boolean; checks: BundleCheck[] }> {
  const { checks } = await verifyProofBundleOffline(bundle);

  const { verifyTeeResponse } = await import("./inference.js");
  const tee = await verifyTeeResponse(bundle.tee.provider, bundle.tee.chatID);
  checks.push({
    id: "B4",
    claim: "enclave signature re-verifies now (processResponse)",
    status: tee,
    detail: tee === null ? "provider no longer serves this chatID (stated, not hidden)" : String(tee),
  });

  try {
    const minter = compositeMinter(getProvider());
    const [r] = await minter.getReceipt(bundle.receipt.receiptId);
    checks.push({
      id: "B5",
      claim: "live chain still holds this exact receipt row",
      status:
        r.receiptHash === bundle.receipt.receiptHash &&
        r.sessionId === bundle.receipt.sessionId &&
        r.traceCIDHash === bundle.receipt.traceCIDHash,
      detail: explorerAddress(loadDeployments().CompositeReceiptMinter),
    });
  } catch (e: any) {
    checks.push({ id: "B5", claim: "live chain cross-check", status: null, detail: `no RPC: ${e?.message ?? e}` });
  }

  return { valid: checks.every((c) => c.status !== false), checks };
}
