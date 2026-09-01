/**
 * Deploy the NEXUS suite to a 0G network using ethers (Foundry's broadcast
 * doesn't recognize 0G chain ids). Network comes from OG_NETWORK (galileo |
 * mainnet) or a --network arg. Reads compiled bytecode from contracts/out,
 * deploys in dependency order, wires reputation writers, writes
 * deployments/<network>.json, and regenerates the SDK's embedded copy.
 *
 *   OG_NETWORK=mainnet PRIVATE_KEY=0x... pnpm deploy:mainnet
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, parseEther, computeAddress, formatEther } from "ethers";
import { getProvider, getWallet, config, optionalEnv, networkName, NETWORKS } from "@nexus/sdk";
import { banner, ok, info, fail } from "./_common.js";
import { regenerateEmbedded } from "./_regen.js";

// allow `tsx scripts/deploy.ts --network mainnet`
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
  banner(`Deploy · ${preset.label} (chainId ${preset.chainId})`);
  const provider = getProvider();
  const wallet = getWallet();
  const chain = await provider.getNetwork();
  info("deployer", wallet.address);
  info("rpc", config.rpcUrl());
  info("chainId", chain.chainId.toString());
  // never trust a doc (or an env var) over the live RPC
  if (Number(chain.chainId) !== preset.chainId) {
    fail(`live RPC reports chainId ${chain.chainId}, expected ${preset.chainId} for ${net} — aborting`);
  }
  const bal = await provider.getBalance(wallet.address);
  info("balance", `${formatEther(bal)} 0G`);
  if (bal < parseEther("0.02")) fail("deployer balance too low for a 5-contract deploy (~0.02+ 0G needed)");

  const signerKey = config.signerKey();
  const trustedSigner = computeAddress(signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`);
  const royalty = parseEther(optionalEnv("CLONE_ROYALTY") ?? "0.001");
  info("trustedSigner", trustedSigner);
  info("cloneRoyalty", royalty.toString());

  async function deploy(name: string, args: any[]) {
    const { abi, bytecode } = artifact(name);
    const factory = new ContractFactory(abi, bytecode, wallet);
    const c = await factory.deploy(...args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    ok(`${name.padEnd(22)} ${addr}`);
    return c;
  }

  const rep = await deploy("ReputationRegistry", []);
  const agent = await deploy("NexusAgent", [trustedSigner, royalty]);
  const proof = await deploy("ProofMeshReceipts", [await agent.getAddress(), await rep.getAddress()]);
  const escrow = await deploy("NexusEscrow", [await agent.getAddress()]);
  const minter = await deploy("CompositeReceiptMinter", [
    await proof.getAddress(),
    await escrow.getAddress(),
    await rep.getAddress(),
  ]);

  // wire reputation writers
  await (await (rep as any).setWriter(await proof.getAddress(), true)).wait();
  await (await (rep as any).setWriter(await minter.getAddress(), true)).wait();
  ok("reputation writers wired (ProofMesh + CompositeMinter)");

  const deployments = {
    chainId: Number(chain.chainId),
    NexusAgent: await agent.getAddress(),
    ProofMeshReceipts: await proof.getAddress(),
    NexusEscrow: await escrow.getAddress(),
    ReputationRegistry: await rep.getAddress(),
    CompositeReceiptMinter: await minter.getAddress(),
    trustedSigner,
  };
  const dir = resolve(ROOT, "contracts/deployments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // merge: keep layer addresses (ERC-8004 etc.) deployed by their own scripts
  const file = resolve(dir, `${net}.json`);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileSync(file, JSON.stringify({ ...prev, ...deployments }, null, 2));
  ok(`wrote contracts/deployments/${net}.json`);

  regenerateEmbedded();
  console.log(`\n  explorer: ${config.explorerUrl()}/address/${deployments.NexusAgent}`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
