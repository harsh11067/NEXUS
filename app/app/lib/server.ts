import "server-only";
import {
  config,
  getProvider,
  getWallet,
  loadDeployments,
  deploymentsExist,
  nexusAgent,
  compositeMinter,
  reputationRegistry,
  getAgentCard,
  tierName,
  optionalEnv,
} from "0g-nexus-sdk";
import { formatEther } from "ethers";

export async function systemStatus() {
  const out: any = {
    configured: false,
    deployed: deploymentsExist(),
    network: config.network(),
    networkLabel: config.networkLabel(),
    chainId: config.chainId(),
    rpcUrl: config.rpcUrl(),
    explorerUrl: config.explorerUrl(),
    computeMode: process.env.OG_COMPUTE_MODE ?? "router",
    computeReady:
      (process.env.OG_COMPUTE_MODE ?? "router") === "router"
        ? Boolean(optionalEnv("OG_COMPUTE_API_KEY"))
        : true,
  };
  try {
    const wallet = getWallet();
    out.wallet = wallet.address;
    out.configured = true;
    const bal = await getProvider().getBalance(wallet.address);
    out.balance = formatEther(bal);
  } catch (e: any) {
    out.readOnly = true;
    out.error = e?.message ?? "Operator key not configured — read-only mode";
  }
  if (out.deployed) out.addresses = loadDeployments();
  return out;
}

export async function listAgents(limit = 30) {
  if (!deploymentsExist()) return [];
  const agent = nexusAgent(getProvider());
  const total = Number(await agent.totalMinted());
  const ids: number[] = [];
  for (let i = total; i >= 1 && ids.length < limit; i--) ids.push(i);
  const cards = await Promise.all(
    ids.map((id) => getAgentCard(String(id)).catch(() => null)),
  );
  return cards.filter(Boolean);
}

export async function listReceipts(limit = 24) {
  if (!deploymentsExist()) return [];
  const provider = getProvider();
  const minter = compositeMinter(provider);
  const total = Number(await minter.totalReceipts());
  const ids: number[] = [];
  for (let i = total; i >= 1 && ids.length < limit; i--) ids.push(i);
  const out = await Promise.all(
    ids.map(async (rid) => {
      try {
        const [r] = await minter.getReceipt(rid);
        return {
          receiptId: String(rid),
          agentId: r.agentId.toString(),
          sessionId: r.sessionId as string,
          paymentId: r.paymentId as string,
          traceCIDHash: r.traceCIDHash as string,
          receiptHash: r.receiptHash as string,
          timestamp: Number(r.timestamp),
          hasPayment:
            (r.paymentId as string).toLowerCase() !==
            "0x0000000000000000000000000000000000000000000000000000000000000000",
        };
      } catch {
        return null;
      }
    }),
  );
  return out.filter(Boolean);
}

export async function networkStats() {
  const status = await systemStatus();
  const stats: any = {
    chainId: status.chainId,
    deployed: status.deployed,
    addresses: status.addresses ?? null,
    totalAgents: 0,
    totalReceipts: 0,
    block: 0,
  };
  if (status.deployed) {
    const provider = getProvider();
    try {
      const agent = nexusAgent(provider);
      const minter = compositeMinter(provider);
      const [minted, receipts, block] = await Promise.all([
        agent.totalMinted(),
        minter.totalReceipts(),
        provider.getBlockNumber(),
      ]);
      stats.totalAgents = Number(minted);
      stats.totalReceipts = Number(receipts);
      stats.block = Number(block);
    } catch {}
  }
  return stats;
}

export { config };
