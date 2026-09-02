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
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet } from "ethers";
import { pubKeyOf, addressOf } from "./crypto.js";
import { EMBEDDED_DEPLOYMENTS } from "./deployments.generated.js";

// The monorepo root, when running inside it (nothing above node_modules for an
// installed copy — there the embedded deployments are the source of truth).
function findRepoRoot(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) && existsSync(resolve(dir, "contracts"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const REPO_ROOT = findRepoRoot();

// Locate the file the process should read env defaults from.
//
// Two consumers, one rule — walk up from cwd:
//   * inside this monorepo, the workspace marker pins the repo root, so any
//     script run from a nested package still sees the root `.env`;
//   * installed from npm, there is no marker, so the nearest `.env` above cwd
//     wins — the consuming project's own file, never one inside node_modules.
// `import.meta.url` is only a last resort: Next.js bundling rewrites it, and in
// an installed copy it points inside node_modules.
// Set NEXUS_NO_DOTENV=1 to skip file loading entirely (real env vars only).
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  let nearestEnv: string | undefined;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) && existsSync(resolve(dir, "contracts"))) {
      const rootEnv = resolve(dir, ".env");
      return existsSync(rootEnv) ? rootEnv : undefined;
    }
    if (!nearestEnv && existsSync(resolve(dir, ".env"))) nearestEnv = resolve(dir, ".env");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (nearestEnv) return nearestEnv;
  try {
    const fallback = resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env");
    return existsSync(fallback) ? fallback : undefined;
  } catch {
    return undefined;
  }
}

// minimal .env loader (no dependency): only sets keys not already in process.env
function loadDotEnv() {
  if ((process.env.NEXUS_NO_DOTENV ?? "").trim() === "1") return;
  const envPath = findEnvFile();
  if (!envPath) return;
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

/**
 * Per-request network override.
 *
 * The env answer below is the *process* default. A server that serves both
 * networks from one process (the NEXUS app: a testnet/mainnet switch in the UI)
 * wraps each request in `withNetwork()`, so every config lookup inside that
 * async context resolves to the caller's network — without mutating
 * process.env, which would leak across concurrent requests.
 */
const _networkOverride = new AsyncLocalStorage<NetworkName>();

/** Parse a user-supplied network name; undefined when absent/unrecognised. */
export function parseNetwork(v: string | null | undefined): NetworkName | undefined {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "mainnet") return "mainnet";
  if (s === "galileo" || s === "testnet") return "galileo";
  return undefined;
}

/** Run `fn` with `net` as the active network (no-op when `net` is undefined). */
export function withNetwork<T>(net: NetworkName | undefined, fn: () => T): T {
  return net === undefined ? fn() : _networkOverride.run(net, fn);
}

/**
 * The process default from env (see precedence in the header comment) —
 * deliberately blind to any per-request override.
 */
export function defaultNetworkName(): NetworkName {
  const explicit = (process.env.OG_NETWORK ?? "").trim().toLowerCase();
  if (explicit === "mainnet") return "mainnet";
  if (explicit === "galileo" || explicit === "testnet") return "galileo";
  if (explicit) throw new Error(`Unknown OG_NETWORK "${explicit}" — use galileo or mainnet`);
  if ((process.env.NEXT_PUBLIC_USE_MAINNET ?? "").trim().toLowerCase() === "true") return "mainnet";
  if ((process.env.OG_CHAIN_ID ?? "").trim() === "16661") return "mainnet";
  return "galileo";
}

/** The active network: the per-request override if one is set, else the env default. */
export function networkName(): NetworkName {
  return _networkOverride.getStore() ?? defaultNetworkName();
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

/** Everything a client needs to render a network without guessing. */
export interface NetworkInfo {
  network: NetworkName;
  label: string;
  chainId: number;
  chainHex: string;
  rpcUrl: string;
  explorerUrl: string;
  storageExplorer: string;
  /** an operator key for THIS network is configured -> server-signed writes work */
  canWrite: boolean;
  /** contract addresses are known for this network */
  deployed: boolean;
}

export function networkInfo(net?: NetworkName): NetworkInfo {
  return withNetwork(net, () => {
    const chainId = config.chainId();
    return {
      network: networkName(),
      label: config.networkLabel(),
      chainId,
      chainHex: "0x" + chainId.toString(16),
      rpcUrl: config.rpcUrl(),
      explorerUrl: config.explorerUrl(),
      storageExplorer: config.storageExplorer(),
      canWrite: config.hasOperatorKey(),
      deployed: deploymentsExist(),
    };
  });
}

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
  // 1. the deployments file written by scripts/deploy.ts (freshest, local dev;
  //    absent when the SDK is installed from npm — the embedded copy wins there)
  const p = REPO_ROOT ? resolve(REPO_ROOT, `contracts/deployments/${net}.json`) : undefined;
  if (p && existsSync(p)) {
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
