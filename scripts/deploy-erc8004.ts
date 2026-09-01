/**
 * Deploy the ERC-8004 layer on the active network:
 *   1. ERC8004ValidationRegistry — interface-faithful reference deployment,
 *      pointed at the CANONICAL ERC-8004 Identity Registry on this chain
 *      (existence probed live via eth_getCode before spending gas);
 *   2. NexusTEEValidator — NEXUS's validator, bound to (1) + the trusted signer.
 *
 * Merges the addresses into contracts/deployments/<network>.json and
 * regenerates the SDK's embedded copy.
 *
 *   pnpm deploy:erc8004 -- --network mainnet
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, computeAddress, formatEther, parseEther } from "ethers";
import { getProvider, getWallet, config, networkName, NETWORKS } from "@nexus/sdk";
import { banner, ok, info, fail } from "./_common.js";
import { regenerateEmbedded } from "./_regen.js";

const netArgIdx = process.argv.indexOf("--network");
if (netArgIdx !== -1 && process.argv[netArgIdx + 1]) {
  process.env.OG_NETWORK = process.argv[netArgIdx + 1];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "contracts/out");

function artifact(name: string) {
  const p = resolve(OUT, `${name}.sol/${name}.json`);
  if (!existsSync(p)) fail(`missing artifact ${p} — run 'forge build' first`);
  const a = JSON.parse(readFileSync(p, "utf8"));
  return { abi: a.abi, bytecode: a.bytecode.object as string };
}

async function main() {
  const net = networkName();
  const preset = NETWORKS[net];
  banner(`Deploy ERC-8004 layer · ${preset.label} (chainId ${preset.chainId})`);

  const provider = getProvider();
  const wallet = getWallet();
  const chain = await provider.getNetwork();
  info("deployer", wallet.address);
  if (Number(chain.chainId) !== preset.chainId) {
    fail(`live RPC reports chainId ${chain.chainId}, expected ${preset.chainId} for ${net} — aborting`);
  }
  const bal = await provider.getBalance(wallet.address);
  info("balance", `${formatEther(bal)} 0G`);
  if (bal < parseEther("0.01")) fail("deployer balance too low (~0.01+ 0G needed)");

  // never trust a doc: the canonical Identity Registry must have code HERE
  const identity = preset.erc8004.identity;
  const code = await provider.getCode(identity);
  if (code === "0x") fail(`canonical ERC-8004 Identity Registry has no code at ${identity} on ${net}`);
  ok(`canonical Identity Registry live at ${identity} (${(code.length - 2) / 2} bytes)`);

  const signerKey = config.signerKey();
  const trustedSigner = computeAddress(signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`);
  info("trustedSigner", trustedSigner);

  async function deploy(name: string, args: any[]) {
    const { abi, bytecode } = artifact(name);
    const factory = new ContractFactory(abi, bytecode, wallet);
    const c = await factory.deploy(...args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    ok(`${name.padEnd(26)} ${addr}`);
    return c;
  }

  const registry = await deploy("ERC8004ValidationRegistry", [identity]);
  const validator = await deploy("NexusTEEValidator", [await registry.getAddress(), trustedSigner]);

  const file = resolve(ROOT, `contracts/deployments/${net}.json`);
  if (!existsSync(file)) fail(`no base deployment for ${net} — run pnpm deploy first`);
  const d = JSON.parse(readFileSync(file, "utf8"));
  d.ERC8004ValidationRegistry = await registry.getAddress();
  d.NexusTEEValidator = await validator.getAddress();
  writeFileSync(file, JSON.stringify(d, null, 2));
  ok(`merged into contracts/deployments/${net}.json`);

  regenerateEmbedded();
  console.log(`\n  explorer: ${config.explorerUrl()}/address/${d.NexusTEEValidator}`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
