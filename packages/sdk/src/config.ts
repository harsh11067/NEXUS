/**
 * Environment + deployment configuration. Loads .env, the deployments file, and
 * builds the ethers provider/wallet. Everything that needs the chain goes
 * through here so there is exactly one source of truth.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet } from "ethers";
import { pubKeyOf, addressOf } from "./crypto.js";

// Resolve the repo root robustly: walk up from cwd looking for the workspace
// marker (works under tsx AND when this package is bundled by Next.js, where
// import.meta.url no longer points at the original file). Fall back to the
// source-relative path.
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) && existsSync(resolve(dir, "contracts"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  try {
    return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  } catch {
    return process.cwd();
  }
}

const REPO_ROOT = findRepoRoot();

// minimal .env loader (no dependency): only sets keys not already in process.env
function loadDotEnv() {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

export interface Deployments {
  chainId: number;
  NexusAgent: string;
  ProofMeshReceipts: string;
  NexusEscrow: string;
  ReputationRegistry: string;
  CompositeReceiptMinter: string;
  trustedSigner: string;
}

export function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var ${key} — set it in .env (see .env.example)`);
  }
  return v;
}

export function optionalEnv(key: string): string | undefined {
  const v = process.env[key];
  return v === undefined || v === "" ? undefined : v;
}

export const config = {
  rpcUrl: () => env("OG_RPC_URL", "https://evmrpc-testnet.0g.ai"),
  chainId: () => Number(env("OG_CHAIN_ID", "16602")),
  explorerUrl: () => env("OG_EXPLORER_URL", "https://chainscan-galileo.0g.ai"),
  storageIndexer: () => env("OG_STORAGE_INDEXER", "https://indexer-storage-testnet-turbo.0g.ai"),
  storageExplorer: () => env("OG_STORAGE_EXPLORER", "https://storagescan-galileo.0g.ai"),
  privateKey: () => normalizeKey(env("PRIVATE_KEY")),
  signerKey: () => normalizeKey(optionalEnv("TRUSTED_SIGNER_KEY") ?? env("PRIVATE_KEY")),
  buyerKey: () => {
    const k = optionalEnv("BUYER_PRIVATE_KEY");
    return k ? normalizeKey(k) : undefined;
  },
  compute: {
    mode: () => env("OG_COMPUTE_MODE", "router"),
    routerUrl: () => env("OG_COMPUTE_ROUTER_URL", "https://router-api.0g.ai/v1"),
    apiKey: () => optionalEnv("OG_COMPUTE_API_KEY"),
    model: () => env("OG_COMPUTE_MODEL", "zai-org/GLM-5-FP8"),
    // 0G Compute runs on the same Galileo testnet (chainId 16602) — default the
    // compute RPC to the main chain RPC so one funded wallet covers everything.
    rpcUrl: () => env("OG_COMPUTE_RPC_URL", env("OG_RPC_URL", "https://evmrpc-testnet.0g.ai")),
    provider: () => optionalEnv("OG_COMPUTE_PROVIDER"),
    deposit: () => Number(env("OG_COMPUTE_DEPOSIT", "0.05")),
  },
};

function normalizeKey(k: string): string {
  return k.startsWith("0x") ? k : `0x${k}`;
}

export function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(config.rpcUrl(), config.chainId());
}

export function getWallet(privateKey?: string): Wallet {
  return new Wallet(privateKey ?? config.privateKey(), getProvider());
}

export function ownerPubKey(privateKey?: string): string {
  return pubKeyOf(privateKey ?? config.privateKey());
}

export function oraclePubKey(): string {
  return pubKeyOf(config.signerKey());
}

export function explorerTx(hash: string): string {
  return `${config.explorerUrl()}/tx/${hash}`;
}

export function explorerAddress(addr: string): string {
  return `${config.explorerUrl()}/address/${addr}`;
}

export function storageFileUrl(rootHash: string): string {
  return `${config.storageExplorer()}/file/${rootHash}`;
}

// Build a Deployments object from env vars — the serverless fallback (Vercel),
// where contracts/deployments/galileo.json isn't on the function's disk.
function deploymentsFromEnv(): Deployments | null {
  const a = optionalEnv("NEXUS_AGENT_ADDRESS");
  const p = optionalEnv("PROOFMESH_ADDRESS");
  const e = optionalEnv("NEXUS_ESCROW_ADDRESS");
  const r = optionalEnv("REPUTATION_ADDRESS");
  const c = optionalEnv("COMPOSITE_MINTER_ADDRESS");
  if (!a || !p || !e || !r || !c) return null;
  let trustedSigner = optionalEnv("TRUSTED_SIGNER_ADDRESS") ?? "";
  if (!trustedSigner) {
    try { trustedSigner = addressOf(config.signerKey()); } catch { /* leave blank */ }
  }
  return {
    chainId: config.chainId(),
    NexusAgent: a, ProofMeshReceipts: p, NexusEscrow: e,
    ReputationRegistry: r, CompositeReceiptMinter: c, trustedSigner,
  };
}

let _deployments: Deployments | null = null;
export function loadDeployments(): Deployments {
  if (_deployments) return _deployments;
  const p = resolve(REPO_ROOT, "contracts/deployments/galileo.json");
  if (existsSync(p)) {
    _deployments = JSON.parse(readFileSync(p, "utf8")) as Deployments;
    return _deployments;
  }
  const fromEnv = deploymentsFromEnv();
  if (fromEnv) return (_deployments = fromEnv);
  throw new Error(
    "No deployments found. Deploy first: `pnpm deploy:testnet`, or set NEXUS_AGENT_ADDRESS / " +
      "PROOFMESH_ADDRESS / NEXUS_ESCROW_ADDRESS / REPUTATION_ADDRESS / COMPOSITE_MINTER_ADDRESS.",
  );
}

export function deploymentsExist(): boolean {
  if (existsSync(resolve(REPO_ROOT, "contracts/deployments/galileo.json"))) return true;
  return deploymentsFromEnv() !== null;
}
