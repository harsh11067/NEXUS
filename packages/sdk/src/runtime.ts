/**
 * NEXUS runtime — the high-level flows that tie identity, storage, inference,
 * proof and reputation together.
 *
 *   createAgent  : persona -> encrypt -> 0G Storage -> mint (ERC-7857)   [L1]
 *   runTask      : fetch persona -> Sealed Inference -> (prove loop)      [L1/L2]
 *   transferAgent: re-encrypt for buyer -> finalizeTransfer               [L3]
 *   cloneAgent   : re-encrypt for cloner -> clone (royalty)               [L3]
 */
import {
  Wallet,
  keccak256,
  toUtf8Bytes,
  getBytes,
  hexlify,
  type TransactionReceipt,
  type Contract,
  type Log,
} from "ethers";
import {
  getWallet,
  config,
  ownerPubKey,
  oraclePubKey,
  explorerTx,
  explorerAddress,
  storageFileUrl,
  loadDeployments,
} from "./config.js";
import {
  encryptForRecipients,
  decryptBlob,
  encodeBlob,
  decodeBlob,
  reEncryptForNewOwner,
  pubKeyOf,
} from "./crypto.js";
import {
  type AgentPersona,
  serializePersona,
  deserializePersona,
  computePolicyHash,
  allowedMerchants,
} from "./persona.js";
import { uploadBytes, downloadBytes, rootHashToBytes, bytesToRootHash } from "./storage.js";
import { runInference, type ChatMessage } from "./inference.js";
import { nexusAgent, proofMesh, nexusEscrow, compositeMinter, reputationRegistry, tierName } from "./contracts.js";

// ----------------------------------------------------------------- helpers
function pubKeyBytes(pub: string): string {
  return pub.startsWith("0x") ? pub : `0x${pub}`;
}

function eventArg(
  receipt: TransactionReceipt,
  contract: Contract,
  eventName: string,
  arg: string,
): any {
  for (const log of receipt.logs as Log[]) {
    try {
      const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed && parsed.name === eventName) return parsed.args[arg];
    } catch { /* not ours */ }
  }
  throw new Error(`event ${eventName} not found in tx ${receipt.hash}`);
}

// ----------------------------------------------------------------- create
export interface CreateAgentResult {
  agentId: string;
  personaRootHash: string;
  policyHash: string;
  mintTx: string;
  mintTxUrl: string;
  personaUrl: string;
}

export async function createAgent(persona: AgentPersona, wallet?: Wallet): Promise<CreateAgentResult> {
  const w = wallet ?? getWallet();
  const policyHash = computePolicyHash(persona.policy);

  // encrypt persona to [owner, oracle] and upload to 0G Storage
  const ownerPub = ownerPubKey(w.privateKey);
  const oraclePub = oraclePubKey();
  const blob = encryptForRecipients(serializePersona(persona), [ownerPub, oraclePub]);
  const { rootHash } = await uploadBytes(encodeBlob(blob), w);

  // mint ERC-7857 token referencing the cipher blob
  const agent = nexusAgent(w);
  const tx = await agent.mint(hexlify(rootHashToBytes(rootHash)), policyHash, w.address, pubKeyBytes(ownerPub));
  const receipt = await tx.wait();
  const agentId = eventArg(receipt, agent, "AgentMinted", "agentId");

  return {
    agentId: agentId.toString(),
    personaRootHash: rootHash,
    policyHash,
    mintTx: receipt.hash,
    mintTxUrl: explorerTx(receipt.hash),
    personaUrl: storageFileUrl(rootHash),
  };
}

// ----------------------------------------------------------------- persona fetch
export async function fetchPersona(agentId: string, wallet?: Wallet): Promise<AgentPersona> {
  const w = wallet ?? getWallet();
  const agent = nexusAgent(w);
  const cipherRefHex: string = await agent.getPersonaRef(agentId);
  const rootHash = bytesToRootHash(cipherRefHex);
  const blobBytes = await downloadBytes(rootHash);
  const blob = decodeBlob(blobBytes);
  const personaBytes = decryptBlob(blob, w.privateKey);
  return deserializePersona(personaBytes);
}

// ----------------------------------------------------------------- run task
export interface SpendStep {
  merchant: string;     // merchant address (must be an allowed tool)
  merchantKey: string;  // merchant private key (to submit fulfillment) — demo merchant
  amountWei: string;
  evidence: string;     // fulfillment evidence payload
}

export interface RunTaskOptions {
  prove?: boolean;      // run the L2 prove-loop (default true if deployed)
  spend?: SpendStep;    // optional escrow spend (L3)
}

export interface RunTaskResult {
  output: string;
  model: string;
  provider: string;
  verified: boolean | null;
  inputHash: string;
  outputHash: string;
  // prove-loop artifacts (present when prove=true)
  sessionId?: string;
  traceRootHash?: string;
  traceUrl?: string;
  receiptId?: string;
  paymentId?: string;
  closeTx?: string;
  receiptTx?: string;
  receiptTxUrl?: string;
  score?: number;
  tier?: string;
  taskCount?: number;
}

export async function runTask(
  agentId: string,
  prompt: string,
  opts: RunTaskOptions = {},
  wallet?: Wallet,
): Promise<RunTaskResult> {
  const w = wallet ?? getWallet();
  const prove = opts.prove !== false;

  // L1 — identity check + persona load
  const agent = nexusAgent(w);
  const owner: string = await agent.ownerOf(agentId);
  if (owner.toLowerCase() !== w.address.toLowerCase()) {
    const authorized: boolean = await agent.isAuthorizedExecutor(agentId, w.address);
    if (!authorized) throw new Error(`wallet ${w.address} is not owner nor authorized executor of agent ${agentId}`);
  }
  const persona = await fetchPersona(agentId, w);
  const policyHash = computePolicyHash(persona.policy);

  // build the chat context from persona
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(persona) },
    ...persona.memory
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: prompt },
  ];

  // TEE — Sealed Inference
  const inf = await runInference(messages);

  const base: RunTaskResult = {
    output: inf.content,
    model: inf.model,
    provider: inf.provider,
    verified: inf.verified,
    inputHash: inf.inputHash,
    outputHash: inf.outputHash,
  };
  if (!prove) return base;

  // L2 — open session (locks policy hash on chain)
  const proof = proofMesh(w);
  const taskHash = keccak256(toUtf8Bytes(prompt));
  const openTx = await proof.openSession(agentId, policyHash, taskHash);
  const openReceipt = await openTx.wait();
  const sessionId: string = eventArg(openReceipt, proof, "SessionOpened", "sessionId");

  // L3 — optional spend through the escrow
  let paymentId = "0x" + "0".repeat(64);
  let fulfillmentBytes = "0x";
  if (opts.spend) {
    paymentId = await doSpend(w, agentId, sessionId, persona, opts.spend);
    fulfillmentBytes = hexlify(toUtf8Bytes(opts.spend.evidence));
  }

  // assemble + encrypt the trace bundle, upload to 0G Storage
  const trace = {
    sessionId,
    agentId,
    policyHashAtRun: policyHash,
    modelHash: keccak256(toUtf8Bytes(`${inf.provider}:${inf.model}`)),
    inputHash: inf.inputHash,
    outputHash: inf.outputHash,
    attestation: inf.attestation,
    verified: inf.verified,
    toolCalls: opts.spend ? [{ merchant: opts.spend.merchant, amountWei: opts.spend.amountWei }] : [],
    anomalyFlags: 0,
    timestamp: Math.floor(Date.now() / 1000),
  };
  const traceBlob = encryptForRecipients(
    new TextEncoder().encode(JSON.stringify(trace)),
    [ownerPubKey(w.privateKey), oraclePubKey()],
  );
  const { rootHash: traceRootHash } = await uploadBytes(encodeBlob(traceBlob), w);

  // L2 — close session with trace ref + TEE attestation
  const traceBytes = hexlify(rootHashToBytes(traceRootHash));
  const attBytes = hexlify(getBytes("0x" + inf.attestation));
  const closeTx = await proof.closeSession(sessionId, traceBytes, attBytes);
  const closeReceipt = await closeTx.wait();

  // DA — mint composite receipt (also increments reputation, traced to receiptHash)
  const minter = compositeMinter(w);
  const mintTx = await minter.mint(agentId, sessionId, paymentId, traceBytes, fulfillmentBytes);
  const mintReceipt = await mintTx.wait();
  const receiptId: bigint = eventArg(mintReceipt, minter, "CompositeReceiptMinted", "receiptId");

  // read back the reputation
  const rep = reputationRegistry(w);
  const [score, tier, taskCount] = await rep.getScore(agentId);

  return {
    ...base,
    sessionId,
    traceRootHash,
    traceUrl: storageFileUrl(traceRootHash),
    receiptId: receiptId.toString(),
    paymentId,
    closeTx: closeReceipt.hash,
    receiptTx: mintReceipt.hash,
    receiptTxUrl: explorerTx(mintReceipt.hash),
    score: Number(score),
    tier: tierName(Number(tier)),
    taskCount: Number(taskCount),
  };
}

function buildSystemPrompt(persona: AgentPersona): string {
  const mem = persona.memory.filter((m) => m.role === "system" || m.role === "note");
  const memText = mem.length ? `\n\nContext:\n${mem.map((m) => `- ${m.content}`).join("\n")}` : "";
  return `${persona.systemPrompt}${memText}`;
}

async function doSpend(
  w: Wallet,
  agentId: string,
  sessionId: string,
  persona: AgentPersona,
  spend: SpendStep,
): Promise<string> {
  const escrow = nexusEscrow(w);
  // bind the spend policy for this session (allowed merchants from the persona)
  const merchants = allowedMerchants(persona.policy);
  if (!merchants.map((m) => m.toLowerCase()).includes(spend.merchant.toLowerCase())) {
    throw new Error(`merchant ${spend.merchant} is not in the agent's allowed tools`);
  }
  const bindTx = await escrow.bindPolicy(
    sessionId,
    agentId,
    merchants,
    persona.policy.maxPerTx,
    persona.policy.dailyBudget,
    persona.policy.maxTaskTTL,
  );
  await bindTx.wait();

  // lock funds (policy enforced on chain)
  const lockTx = await escrow.lockFunds(agentId, sessionId, spend.merchant, spend.amountWei, {
    value: spend.amountWei,
  });
  const lockReceipt = await lockTx.wait();
  const paymentId: string = eventArg(lockReceipt, escrow, "FundsLocked", "paymentId");

  // merchant submits fulfillment evidence
  const merchantWallet = new Wallet(spend.merchantKey, w.provider!);
  const escrowAsMerchant = nexusEscrow(merchantWallet);
  const fulfillTx = await escrowAsMerchant.submitFulfillment(paymentId, hexlify(toUtf8Bytes(spend.evidence)));
  await fulfillTx.wait();

  // settle (structural check passes -> release to merchant)
  const settleTx = await escrow.settlePayment(paymentId);
  await settleTx.wait();
  return paymentId;
}

// ----------------------------------------------------------------- transfer
export interface TransferResult {
  agentId: string;
  from: string;
  to: string;
  oldRootHash: string;
  newRootHash: string;
  requestTx: string;
  finalizeTx: string;
  finalizeTxUrl: string;
}

export async function transferAgent(
  agentId: string,
  buyerAddress: string,
  buyerPubKey: string,
  wallet?: Wallet,
): Promise<TransferResult> {
  const w = wallet ?? getWallet();
  const agent = nexusAgent(w);
  const from: string = await agent.ownerOf(agentId);

  // read current cipher ref + nonce
  const oldRefHex: string = await agent.getPersonaRef(agentId);
  const oldRootHash = bytesToRootHash(oldRefHex);
  const nonce: bigint = await agent.transferNonce(agentId);

  // step 1: request transfer (emits ReEncryptionRequest)
  const reqTx = await agent.requestTransfer(agentId, buyerAddress, pubKeyBytes(buyerPubKey));
  const reqReceipt = await reqTx.wait();

  // oracle: fetch old blob, re-encrypt for buyer, upload new blob
  const oldBlob = decodeBlob(await downloadBytes(oldRootHash));
  const newBlob = reEncryptForNewOwner(oldBlob, config.signerKey(), buyerPubKey);
  const { rootHash: newRootHash } = await uploadBytes(encodeBlob(newBlob), w);
  const newRefBytes = hexlify(rootHashToBytes(newRootHash));

  // oracle signs the transfer digest (trusted-signer v1)
  const buyerPubKeyHash = keccak256(pubKeyBytes(buyerPubKey));
  const digest: string = await agent.transferDigest(agentId, newRefBytes, buyerPubKeyHash, nonce);
  const signer = new Wallet(config.signerKey());
  const signature = await signer.signMessage(getBytes(digest));

  // step 2: finalize (flips ownership + updates cipher ref)
  const finTx = await agent.finalizeTransfer(agentId, newRefBytes, signature);
  const finReceipt = await finTx.wait();

  return {
    agentId,
    from,
    to: buyerAddress,
    oldRootHash,
    newRootHash,
    requestTx: reqReceipt.hash,
    finalizeTx: finReceipt.hash,
    finalizeTxUrl: explorerTx(finReceipt.hash),
  };
}

// ----------------------------------------------------------------- clone
export interface CloneResult {
  parentId: string;
  newAgentId: string;
  cloner: string;
  newRootHash: string;
  cloneTx: string;
  cloneTxUrl: string;
}

export async function cloneAgent(
  agentId: string,
  toAddress: string,
  toPubKey: string,
  wallet?: Wallet,
): Promise<CloneResult> {
  const w = wallet ?? getWallet();
  const agent = nexusAgent(w);

  const oldRefHex: string = await agent.getPersonaRef(agentId);
  const oldRootHash = bytesToRootHash(oldRefHex);
  const nonce: bigint = await agent.transferNonce(agentId);
  const royalty: bigint = await agent.cloneRoyalty();

  // re-encrypt persona for the cloner, upload
  const oldBlob = decodeBlob(await downloadBytes(oldRootHash));
  const newBlob = reEncryptForNewOwner(oldBlob, config.signerKey(), toPubKey);
  const { rootHash: newRootHash } = await uploadBytes(encodeBlob(newBlob), w);
  const sealedBytes = hexlify(rootHashToBytes(newRootHash));

  // oracle signs the clone digest
  const sealedHash = keccak256(sealedBytes);
  const digest: string = await agent.cloneDigest(agentId, toAddress, sealedHash, nonce);
  const signer = new Wallet(config.signerKey());
  const signature = await signer.signMessage(getBytes(digest));

  const tx = await agent.clone(agentId, toAddress, sealedBytes, signature, { value: royalty });
  const receipt = await tx.wait();
  const newAgentId = eventArg(receipt, agent, "AgentCloned", "newAgentId");

  return {
    parentId: agentId,
    newAgentId: newAgentId.toString(),
    cloner: toAddress,
    newRootHash,
    cloneTx: receipt.hash,
    cloneTxUrl: explorerTx(receipt.hash),
  };
}

// ============================================================================
// Wallet-signed flows: the SERVER does encryption / 0G Storage / oracle work and
// returns calldata; the USER's wallet signs the ownership-defining transaction.
// ============================================================================
const ZERO32 = "0x" + "0".repeat(64);

/** Encrypt + upload a persona; return the calldata the user's wallet mints with. */
export async function prepareMint(
  persona: AgentPersona,
  ownerAddress: string,
  ownerPub: string,
  wallet?: Wallet,
): Promise<{ cipherRef: string; policyHash: string; ownerAddress: string; ownerPubKeyBytes: string; personaRootHash: string }> {
  const w = wallet ?? getWallet();
  const policyHash = computePolicyHash(persona.policy);
  const blob = encryptForRecipients(serializePersona(persona), [ownerPub, oraclePubKey()]);
  const { rootHash } = await uploadBytes(encodeBlob(blob), w);
  return {
    cipherRef: hexlify(rootHashToBytes(rootHash)),
    policyHash,
    ownerAddress,
    ownerPubKeyBytes: pubKeyBytes(ownerPub),
    personaRootHash: rootHash,
  };
}

/** Re-encrypt a persona for a cloner + sign the clone digest (oracle). */
export async function prepareClone(
  agentId: string,
  toAddress: string,
  toPubKey: string,
  wallet?: Wallet,
): Promise<{ sealedRef: string; signature: string; royaltyWei: string; newRootHash: string }> {
  const w = wallet ?? getWallet();
  const agent = nexusAgent(w);
  const oldRefHex: string = await agent.getPersonaRef(agentId);
  const oldRootHash = bytesToRootHash(oldRefHex);
  const nonce: bigint = await agent.transferNonce(agentId);
  const royalty: bigint = await agent.cloneRoyalty();
  const oldBlob = decodeBlob(await downloadBytes(oldRootHash));
  const newBlob = reEncryptForNewOwner(oldBlob, config.signerKey(), toPubKey);
  const { rootHash: newRootHash } = await uploadBytes(encodeBlob(newBlob), w);
  const sealedRef = hexlify(rootHashToBytes(newRootHash));
  const digest: string = await agent.cloneDigest(agentId, toAddress, keccak256(sealedRef), nonce);
  const signature = await new Wallet(config.signerKey()).signMessage(getBytes(digest));
  return { sealedRef, signature, royaltyWei: royalty.toString(), newRootHash };
}

/** After the user signs requestTransfer, the oracle re-encrypts for the buyer and finalizes. */
export async function finalizeTransferFor(
  agentId: string,
  buyerPubKey: string,
  wallet?: Wallet,
): Promise<TransferResult> {
  const w = wallet ?? getWallet();
  const agent = nexusAgent(w);
  const pending = await agent.pendingTransfer(agentId);
  if (!pending.active) throw new Error("no pending transfer for this agent");
  if (keccak256(pubKeyBytes(buyerPubKey)) !== pending.buyerPubKeyHash) {
    throw new Error("buyerPubKey does not match the pending request");
  }
  const from: string = await agent.ownerOf(agentId);
  const oldRefHex: string = await agent.getPersonaRef(agentId);
  const oldRootHash = bytesToRootHash(oldRefHex);
  const oldBlob = decodeBlob(await downloadBytes(oldRootHash));
  const newBlob = reEncryptForNewOwner(oldBlob, config.signerKey(), buyerPubKey);
  const { rootHash: newRootHash } = await uploadBytes(encodeBlob(newBlob), w);
  const newRefBytes = hexlify(rootHashToBytes(newRootHash));
  const digest: string = await agent.transferDigest(agentId, newRefBytes, pending.buyerPubKeyHash, pending.nonce);
  const signature = await new Wallet(config.signerKey()).signMessage(getBytes(digest));
  const tx = await agent.finalizeTransfer(agentId, newRefBytes, signature);
  const receipt = await tx.wait();
  return {
    agentId,
    from,
    to: pending.buyer,
    oldRootHash,
    newRootHash,
    requestTx: "",
    finalizeTx: receipt.hash,
    finalizeTxUrl: explorerTx(receipt.hash),
  };
}

/** The 30-second proof bundle: five independently-verifiable facts for a receipt. */
export async function getReceiptProof(receiptId: string, wallet?: Wallet) {
  const w = wallet ?? getWallet();
  const d = loadDeployments();
  const minter = compositeMinter(w);
  const [r] = await minter.getReceipt(receiptId);
  if (Number(r.timestamp) === 0) throw new Error(`receipt #${receiptId} not found`);
  const agentId = r.agentId.toString();
  const agent = nexusAgent(w);
  const proof = proofMesh(w);
  const rep = reputationRegistry(w);
  const [owner, creator, cipherRef, teeSig, scoreT] = await Promise.all([
    agent.ownerOf(agentId),
    agent.creatorOf(agentId),
    agent.getPersonaRef(agentId),
    proof.getTeeSignature(r.sessionId),
    rep.getScore(agentId),
  ]);
  const hasPayment = r.paymentId !== ZERO32;
  let settled = false;
  if (hasPayment) settled = await nexusEscrow(w).isSettled(r.paymentId);
  let tee: any = {};
  try {
    tee = JSON.parse(Buffer.from((teeSig as string).slice(2), "hex").toString("utf8"));
  } catch { /* attestation not decodable */ }
  return {
    receiptId: String(receiptId),
    receiptHash: r.receiptHash,
    timestamp: Number(r.timestamp),
    agent: {
      id: agentId,
      owner,
      creator,
      personaRootHash: bytesToRootHash(cipherRef),
      url: explorerAddress(d.NexusAgent),
      personaUrl: storageFileUrl(bytesToRootHash(cipherRef)),
    },
    session: { id: r.sessionId, traceCIDHash: r.traceCIDHash, url: explorerAddress(d.ProofMeshReceipts) },
    tee: {
      provider: tee.provider ?? "",
      model: tee.model ?? "",
      verified: tee.verified ?? null,
      outputHash: tee.outputHash ?? "",
    },
    payment: { id: r.paymentId, hasPayment, settled, url: explorerAddress(d.NexusEscrow) },
    reputation: {
      score: Number(scoreT[0]),
      tier: tierName(Number(scoreT[1])),
      taskCount: Number(scoreT[2]),
      url: explorerAddress(d.ReputationRegistry),
    },
  };
}

// ----------------------------------------------------------------- profile card
export interface AgentCard {
  agentId: string;
  owner: string;
  creator: string;
  policyHash: string;
  cloneCount: number;
  parentOf: string;
  score: number;
  tier: string;
  taskCount: number;
  personaRootHash: string;
}

export async function getAgentCard(agentId: string, wallet?: Wallet): Promise<AgentCard> {
  const w = wallet ?? getWallet();
  const agent = nexusAgent(w.provider ? w : getWallet());
  const rep = reputationRegistry(w);
  const [owner, creator, policyHash, cloneCount, parentOf, cipherRef] = await Promise.all([
    agent.ownerOf(agentId),
    agent.creatorOf(agentId),
    agent.getPolicyHash(agentId),
    agent.cloneCount(agentId),
    agent.parentOf(agentId),
    agent.getPersonaRef(agentId),
  ]);
  const [score, tier, taskCount] = await rep.getScore(agentId);
  return {
    agentId,
    owner,
    creator,
    policyHash,
    cloneCount: Number(cloneCount),
    parentOf: parentOf.toString(),
    score: Number(score),
    tier: tierName(Number(tier)),
    taskCount: Number(taskCount),
    personaRootHash: bytesToRootHash(cipherRef),
  };
}
