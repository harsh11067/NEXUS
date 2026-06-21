/**
 * Typed ethers contract instances built from the deployed addresses and the
 * Foundry-compiled ABIs.
 */
import { Contract, type Signer, type Provider } from "ethers";
import {
  NexusAgentABI,
  ProofMeshReceiptsABI,
  NexusEscrowABI,
  ReputationRegistryABI,
  CompositeReceiptMinterABI,
} from "./abis.js";
import { loadDeployments } from "./config.js";

export function nexusAgent(runner: Signer | Provider): Contract {
  return new Contract(loadDeployments().NexusAgent, NexusAgentABI as any, runner);
}

export function proofMesh(runner: Signer | Provider): Contract {
  return new Contract(loadDeployments().ProofMeshReceipts, ProofMeshReceiptsABI as any, runner);
}

export function nexusEscrow(runner: Signer | Provider): Contract {
  return new Contract(loadDeployments().NexusEscrow, NexusEscrowABI as any, runner);
}

export function reputationRegistry(runner: Signer | Provider): Contract {
  return new Contract(loadDeployments().ReputationRegistry, ReputationRegistryABI as any, runner);
}

export function compositeMinter(runner: Signer | Provider): Contract {
  return new Contract(loadDeployments().CompositeReceiptMinter, CompositeReceiptMinterABI as any, runner);
}

export const TIER_NAMES = [
  "Unverified",
  "Emerging",
  "Trusted",
  "Verified",
  "Elite",
  "Flagged",
  "Banned",
] as const;

export function tierName(tier: number): string {
  return TIER_NAMES[tier] ?? "Unknown";
}
