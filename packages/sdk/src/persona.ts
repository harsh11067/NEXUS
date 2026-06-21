/**
 * Agent persona + policy types. "Training" an agent in NEXUS is defining this
 * object — system prompt, memory, and an enforceable policy — NOT model
 * fine-tuning (out of scope per ARCHITECTURE.md).
 */
import { keccak256, toUtf8Bytes, AbiCoder, getAddress } from "ethers";

export interface PolicyRule {
  /** human label for a tool, e.g. "api.coingecko.com" */
  name: string;
  /** the on-chain merchant/escrow address that represents this tool */
  merchant: string;
}

export interface AgentPolicy {
  /** per-task spend cap, in wei of native 0G */
  maxPerTx: string;
  /** daily/lifetime budget for a session, in wei of native 0G */
  dailyBudget: string;
  /** max task duration in seconds */
  maxTaskTTL: number;
  /** allowed tools (name + merchant address) */
  allowedTools: PolicyRule[];
  /** banned action labels (informational + enforced app-side) */
  bannedActions: string[];
}

export interface MemoryEntry {
  role: "system" | "user" | "assistant" | "note";
  content: string;
}

export interface AgentPersona {
  name: string;
  description: string;
  systemPrompt: string;
  memory: MemoryEntry[];
  policy: AgentPolicy;
}

/**
 * Canonical policy hash, locked on chain at mint. Must be deterministic and
 * reproducible by anyone verifying the agent. We hash the structured fields
 * (not the freeform JSON) so formatting can't change the hash.
 */
export function computePolicyHash(policy: AgentPolicy): string {
  const coder = AbiCoder.defaultAbiCoder();
  const toolMerchants = policy.allowedTools.map((t) => getAddress(t.merchant));
  const bannedHashes = policy.bannedActions.map((b) => keccak256(toUtf8Bytes(b)));
  const encoded = coder.encode(
    ["uint256", "uint256", "uint256", "address[]", "bytes32[]"],
    [policy.maxPerTx, policy.dailyBudget, BigInt(policy.maxTaskTTL), toolMerchants, bannedHashes],
  );
  return keccak256(encoded);
}

export function serializePersona(persona: AgentPersona): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(persona));
}

export function deserializePersona(bytes: Uint8Array): AgentPersona {
  return JSON.parse(new TextDecoder().decode(bytes)) as AgentPersona;
}

/** Allowed merchant addresses for the escrow policy binding. */
export function allowedMerchants(policy: AgentPolicy): string[] {
  return policy.allowedTools.map((t) => getAddress(t.merchant));
}
