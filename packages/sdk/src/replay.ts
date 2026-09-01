/**
 * Deterministic Proof Replay (N2) — "re-run the receipt".
 *
 * Pulls a receipt's sealed trace from 0G Storage, decrypts it (owner or
 * oracle key — traces are private by design), re-executes the EXACT recorded
 * messages on the SAME attested provider with the SAME deterministic decoding
 * params, then compares outputs and freshly re-verifies the new run against
 * the provider's enclave. This is the validation method NEXUS offers to
 * ERC-8004 (the TEE-oracle validation the spec invites).
 *
 * Honest claims (stated, not hidden):
 *  - outputs match under temp-0 decoding; enclave SIGNATURES differ per run
 *    (nonces) — we claim "reproducible + independently re-verified", never
 *    "identical signature";
 *  - traces recorded before schema 2 carry only hashes → replay degrades
 *    gracefully with `replayable: false` (N-R08), it never fabricates.
 */
import { keccak256, toUtf8Bytes, hexlify, type Wallet } from "ethers";
import { getProvider, config, loadDeployments, explorerTx } from "./config.js";
import { compositeMinter, proofMesh } from "./contracts.js";
import { downloadBytes, bytesToRootHash } from "./storage.js";
import { decodeBlob, decryptBlob } from "./crypto.js";
import { runInference, verifyTeeResponse, type ChatMessage } from "./inference.js";
import { getWallet } from "./config.js";

export interface ReplayResult {
  receiptId: string;
  replayable: boolean;
  reason?: string;
  /** original run, from the sealed trace */
  original?: {
    output: string;
    outputHash: string;
    model: string;
    provider: string;
    chatID: string;
    modelHash: string;
    /** fresh enclave re-check of the ORIGINAL run, done now */
    teeReVerified: boolean | null;
  };
  /** the fresh re-execution */
  replay?: {
    output: string;
    outputHash: string;
    model: string;
    provider: string;
    chatID: string;
    modelHash: string;
    /** enclave verification of the REPLAY run */
    teeVerified: boolean | null;
  };
  /** outputs byte-identical */
  match?: boolean;
  /** same provider:model pair re-served the task */
  modelHashMatches?: boolean;
}

interface TraceV2 {
  schema?: number;
  sessionId: string;
  agentId: string;
  model?: string;
  provider?: string;
  chatID?: string;
  params?: { temperature: number; seed: number };
  messages?: ChatMessage[];
  output?: string;
  modelHash: string;
  outputHash: string;
}

/** Load + decrypt the sealed trace for a receipt (owner/oracle capability). */
export async function loadTrace(receiptId: string, wallet?: Wallet): Promise<{ trace: TraceV2; traceRootHash: string }> {
  const provider = getProvider();
  const minter = compositeMinter(provider);
  const [r] = await minter.getReceipt(receiptId);
  if (Number(r.timestamp) === 0) throw new Error(`receipt #${receiptId} not found`);

  const proof = proofMesh(provider);
  const traceCID: string = await proof.getTraceCID(r.sessionId);
  const traceRootHash = bytesToRootHash(traceCID);
  const blobBytes = await downloadBytes(traceRootHash);

  const key = wallet?.privateKey ?? tryKeys();
  const plain = decryptBlob(decodeBlob(blobBytes), key);
  const trace = JSON.parse(new TextDecoder().decode(plain)) as TraceV2;
  return { trace, traceRootHash };
}

function tryKeys(): string {
  // trace is wrapped for owner AND oracle — use whichever key this env holds
  try {
    return getWallet().privateKey;
  } catch {
    return config.signerKey();
  }
}

export async function replayReceipt(receiptId: string, wallet?: Wallet): Promise<ReplayResult> {
  const { trace } = await loadTrace(receiptId, wallet);

  if (!trace.messages || !trace.output || !trace.provider || (trace.schema ?? 1) < 2) {
    return {
      receiptId,
      replayable: false,
      reason:
        "trace predates the replay schema (v2): it anchors hashes but not the raw messages — cannot re-execute. New runs are replayable.",
    };
  }

  // fresh enclave re-check of the ORIGINAL run (independent of any stored boolean)
  const originalReVerified = await verifyTeeResponse(trace.provider, trace.chatID ?? "");

  const original = {
    output: trace.output,
    outputHash: keccak256(toUtf8Bytes(trace.output)),
    model: trace.model ?? "",
    provider: trace.provider,
    chatID: trace.chatID ?? "",
    modelHash: trace.modelHash,
    teeReVerified: originalReVerified,
  };

  // re-execute: same provider, same messages, same deterministic params
  let inf;
  try {
    inf = await runInference(trace.messages, {
      provider: trace.provider,
      temperature: trace.params?.temperature ?? 0,
      seed: trace.params?.seed,
    });
  } catch (e: any) {
    return {
      receiptId,
      replayable: false,
      reason: `original provider ${trace.provider} could not re-serve the task (${e?.message ?? e}) — model may be deprecated; original evidence remains anchored`,
      original,
    };
  }

  const replay = {
    output: inf.content,
    outputHash: inf.outputHash,
    model: inf.model,
    provider: inf.provider,
    chatID: inf.chatID,
    modelHash: keccak256(toUtf8Bytes(`${inf.provider}:${inf.model}`)),
    teeVerified: inf.verified,
  };

  return {
    receiptId,
    replayable: true,
    original,
    replay,
    match: replay.output === original.output,
    modelHashMatches: replay.modelHash === original.modelHash,
  };
}

/** Pure comparator (unit-testable N-U03/N-U04): decide match from two traces. */
export function compareReplay(originalOutput: string, replayOutput: string): { match: boolean; originalHash: string; replayHash: string } {
  const originalHash = keccak256(toUtf8Bytes(originalOutput));
  const replayHash = keccak256(toUtf8Bytes(replayOutput));
  return { match: originalHash === replayHash, originalHash, replayHash };
}
