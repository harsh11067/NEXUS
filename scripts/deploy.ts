/**
 * Deploy the NEXUS suite to 0G Galileo using ethers (Foundry's broadcast doesn't
 * recognize chain 16602). Reads compiled bytecode from contracts/out, deploys in
 * dependency order, wires reputation writers, and writes deployments/galileo.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, parseEther, computeAddress } from "ethers";
import { getProvider, getWallet, config, optionalEnv } from "@nexus/sdk";
import { banner, ok, info, fail } from "./_common.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "contracts/out");

function artifact(name: string) {
  const p = resolve(OUT, `${name}.sol/${name}.json`);
  if (!existsSync(p)) fail(`missing artifact ${p} — run 'forge build' first`);
  const a = JSON.parse(readFileSync(p, "utf8"));
  return { abi: a.abi, bytecode: a.bytecode.object as string };
}

async function main() {
  banner("Deploy · 0G Galileo");
  const provider = getProvider();
  const wallet = getWallet();
  const net = await provider.getNetwork();
  info("deployer", wallet.address);
  info("chainId", net.chainId.toString());

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
    chainId: Number(net.chainId),
    NexusAgent: await agent.getAddress(),
    ProofMeshReceipts: await proof.getAddress(),
    NexusEscrow: await escrow.getAddress(),
    ReputationRegistry: await rep.getAddress(),
    CompositeReceiptMinter: await minter.getAddress(),
    trustedSigner,
  };
  const dir = resolve(ROOT, "contracts/deployments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "galileo.json"), JSON.stringify(deployments, null, 2));
  ok("wrote contracts/deployments/galileo.json");
  console.log(`\n  explorer: ${config.explorerUrl()}/address/${deployments.NexusAgent}`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
