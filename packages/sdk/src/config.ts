/**
 * Environment + deployment configuration. Loads .env, resolves the target 0G
 * network (galileo testnet | mainnet), loads the right deployments file, and
 * builds the ethers provider/wallet. Everything that needs the chain goes
 * through here so there is exactly one source of truth.
 *
 * Network selection precedence:
 *   1. OG_NETWORK=galileo|mainnet  (explicit)
 *   2. NEXT_PUBLIC_USE_MAINNET=true  (the app-side switch from EXECUTE.md A4)
 *   3. OG_CHAIN_ID=16661 -> mainnet
 *   4. default: galileo
 *
 * Generic env overrides (OG_RPC_URL etc.) still apply, EXCEPT when the value
 * is exactly the OTHER network's well-known default — that's a stale .env
 * leftover, not an intentional override, and the preset wins. This makes
 * `OG_NETWORK=mainnet pnpm <script>` correct even with a testnet-filled .env.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet } from "ethers";
import { pubKeyOf, addressOf } from "./crypto.js";
import { EMBEDDED_DEPLOYMENTS } from "./deployments.generated.js";

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

// ----------------------------------------------------------------- networks
export type NetworkName = "galileo" | "mainnet";

export interface NetworkPreset {
  name: NetworkName;
  label: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  storageIndexer: string;
  storageExplorer: string;
  /**
   * Canonical ERC-8004 (Trustless Agents) registries on this chain, from the
   * erc-8004 team's cross-chain vanity deployment (verified live via
   * eth_getCode + EIP-1967 proxy slots on 2026-09-01 — real code on both
   * networks). The Validation Registry has NO canonical deployment on any
   * chain yet (spec section under revision), so NEXUS deploys the reference
   * interface itself — that address lives in deployments/<network>.json.
   */
  erc8004: { identity: string; reputation: string };
}

export const NETWORKS: Record<NetworkName, NetworkPreset> = {
  galileo: {
    name: "galileo",
    label: "0G Galileo Testnet",
    chainId: 16602,
    rpcUrl: "https://evmrpc-testnet.0g.ai",
    explorerUrl: "https://chainscan-galileo.0g.ai",
    storageIndexer: "https://indexer-storage-testnet-turbo.0g.ai",
    storageExplorer: "https://storagescan-galileo.0g.ai",
    erc8004: {
      identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
      reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    },
  },
  mainnet: {
    name: "mainnet",
    label: "0G Mainnet",
    chainId: 16661,
    rpcUrl: "https://evmrpc.0g.ai",
    explorerUrl: "https://chainscan.0g.ai",
    storageIndexer: "https://indexer-storage-turbo.0g.ai",
    storageExplorer: "https://storagescan.0g.ai",
    erc8004: {
      identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    },
  },
};

/** The network selected by env (see precedence in the header comment). */
export function networkName(): NetworkName {
  const explicit = (process.env.OG_NETWORK ?? "").trim().toLowerCase();
  if (explicit === "mainnet") return "mainnet";
  if (explicit === "galileo" || explicit === "testnet") return "galileo";
  if (explicit) throw new Error(`Unknown OG_NETWORK "${explicit}" — use galileo or mainnet`);
  if ((process.env.NEXT_PUBLIC_USE_MAINNET ?? "").trim().toLowerCase() === "true") return "mainnet";
  if ((process.env.OG_CHAIN_ID ?? "").trim() === "16661") return "mainnet";
  return "galileo";
}

export function network(): NetworkPreset {
  return NETWORKS[networkName()];
}

/**
 * Env override that ignores stale leftovers: if the env value equals the OTHER
 * network's default, treat it as unset and use the active network's preset.
 */
function netEnv(key: string, pick: (p: NetworkPreset) => string): string {
  const active = network();
  const other = NETWORKS[active.name === "mainnet" ? "galileo" : "mainnet"];
  const v = (process.env[key] ?? "").trim();
  if (!v || v === pick(other)) return pick(active);
  return v;
}

export interface Deployments {
  chainId: number;
  NexusAgent: string;
  ProofMeshReceipts: string;
  NexusEscrow: string;
  ReputationRegistry: string;
  CompositeReceiptMinter: string;
  trustedSigner: string;
  /** ERC-8004 layer (NEXUS-deployed; canonical Identity/Reputation live in NETWORKS presets) */
  ERC8004ValidationRegistry?: string;
  NexusTEEValidator?: string;
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
  network: (): NetworkName => networkName(),
  networkLabel: () => network().label,
  rpcUrl: () => netEnv("OG_RPC_URL", (p) => p.rpcUrl),
  chainId: () => Number(netEnv("OG_CHAIN_ID", (p) => String(p.chainId))),
  explorerUrl: () => netEnv("OG_EXPLORER_URL", (p) => p.explorerUrl),
  storageIndexer: () => netEnv("OG_STORAGE_INDEXER", (p) => p.storageIndexer),
  storageExplorer: () => netEnv("OG_STORAGE_EXPLORER", (p) => p.storageExplorer),
  // On mainnet the operator key MUST be OG_MAINNET_KEY — never fall back to the
  // testnet PRIVATE_KEY against real funds. Absent key => read-only mode.
  privateKey: () => {
    if (networkName() === "mainnet") {
      const k = optionalEnv("OG_MAINNET_KEY");
      if (!k) {
        throw new Error(
          "Mainnet operator key not configured (OG_MAINNET_KEY). This deployment is read-only for mainnet writes.",
        );
      }
      return normalizeKey(k);
    }
    return normalizeKey(env("PRIVATE_KEY"));
  },
  hasOperatorKey: (): boolean =>
    networkName() === "mainnet" ? !!optionalEnv("OG_MAINNET_KEY") : !!optionalEnv("PRIVATE_KEY"),
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
    // 0G Compute broker runs on the same chain as the active network — mirror
    // the chain RPC unless deliberately overridden.
    rpcUrl: () => netEnv("OG_COMPUTE_RPC_URL", (p) => p.rpcUrl),
    provider: () => optionalEnv("OG_COMPUTE_PROVIDER"),
    deposit: () => Number(env("OG_COMPUTE_DEPOSIT", "0.05")),
  },
};

function normalizeKey(k: string): string {
  return k.startsWith("0x") ? k : `0x${k}`;
}

/**
 * 0G public RPCs can transiently answer eth_getTransactionReceipt for a fresh
 * tx with -32000 "no matching receipts found: this may indicate potential data
 * corruption". ethers treats that as fatal and aborts tx.wait(). Treat it as
 * "still pending" (null) so polling continues instead.
 */
class ResilientJsonRpcProvider extends JsonRpcProvider {
  override async getTransactionReceipt(hash: string) {
    try {
      return await super.getTransactionReceipt(hash);
    } catch (e) {
      if (/no matching receipts|data corruption/i.test(String(e))) return null;
      throw e;
    }
  }
}

export function getProvider(): JsonRpcProvider {
  return new ResilientJsonRpcProvider(config.rpcUrl(), config.chainId());
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

// Build a Deployments object from env vars — the last-resort serverless
// fallback. Mainnet uses _MAINNET-suffixed vars so a stale testnet address can
// never masquerade as a mainnet one (the "stale-address gotcha").
function deploymentsFromEnv(net: NetworkName): Deployments | null {
  const sfx = net === "mainnet" ? "_MAINNET" : "";
  const a = optionalEnv(`NEXUS_AGENT_ADDRESS${sfx}`);
  const p = optionalEnv(`PROOFMESH_ADDRESS${sfx}`);
  const e = optionalEnv(`NEXUS_ESCROW_ADDRESS${sfx}`);
  const r = optionalEnv(`REPUTATION_ADDRESS${sfx}`);
  const c = optionalEnv(`COMPOSITE_MINTER_ADDRESS${sfx}`);
  if (!a || !p || !e || !r || !c) return null;
  let trustedSigner = optionalEnv(`TRUSTED_SIGNER_ADDRESS${sfx}`) ?? optionalEnv("TRUSTED_SIGNER_ADDRESS") ?? "";
  if (!trustedSigner) {
    try { trustedSigner = addressOf(config.signerKey()); } catch { /* leave blank */ }
  }
  return {
    chainId: NETWORKS[net].chainId,
    NexusAgent: a, ProofMeshReceipts: p, NexusEscrow: e,
    ReputationRegistry: r, CompositeReceiptMinter: c, trustedSigner,
  };
}

const _deployments: Partial<Record<NetworkName, Deployments>> = {};

function readDeployments(net: NetworkName): Deployments | null {
  // 1. the deployments file written by scripts/deploy.ts (freshest, local dev)
  const p = resolve(REPO_ROOT, `contracts/deployments/${net}.json`);
  if (existsSync(p)) {
    try {
      const d = JSON.parse(readFileSync(p, "utf8")) as Deployments;
      if (d.chainId === NETWORKS[net].chainId) return d;
      // wrong-chain file — ignore rather than serve stale addresses
    } catch { /* fall through */ }
  }
  // 2. the embedded copy (survives serverless bundling)
  const embedded = EMBEDDED_DEPLOYMENTS[net];
  if (embedded && embedded.chainId === NETWORKS[net].chainId) return embedded;
  // 3. env vars
  return deploymentsFromEnv(net);
}

export function loadDeployments(net?: NetworkName): Deployments {
  const n = net ?? networkName();
  const cached = _deployments[n];
  if (cached) return cached;
  const d = readDeployments(n);
  if (d) return (_deployments[n] = d);
  throw new Error(
    `No ${n} deployments found. Deploy first: \`pnpm deploy:${n === "mainnet" ? "mainnet" : "testnet"}\`, ` +
      `or set the address env vars (see .env.example section 5).`,
  );
}

export function deploymentsExist(net?: NetworkName): boolean {
  return readDeployments(net ?? networkName()) !== null;
}
