import { NextResponse } from "next/server";
import {
  config,
  getWallet,
  loadDeployments,
  deploymentsExist,
  networkInfo,
  defaultNetworkName,
} from "0g-nexus-sdk";
import { withNet } from "../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public config the browser wallet needs: chain, addresses, and the operator
// address the user authorizes as an executor (so the server can run/prove for them).
//
// It also describes BOTH networks, so the district UI can offer the
// testnet/mainnet switch and say honestly, per network, whether server-signed
// writes are possible here (`canWrite`) or the deployment is read-only.
async function getHandler(_req: Request) {
  try {
    const chainId = config.chainId();
    let executor = "";
    try { executor = getWallet().address; } catch {}
    return NextResponse.json({
      chainId,
      chainHex: "0x" + chainId.toString(16),
      network: config.network(),
      chainName: config.networkLabel(),
      rpcUrl: config.rpcUrl(),
      explorerUrl: config.explorerUrl(),
      storageExplorer: config.storageExplorer(),
      currency: { name: "0G", symbol: "0G", decimals: 18 },
      deployed: deploymentsExist(),
      addresses: deploymentsExist() ? loadDeployments() : null,
      executor,
      canWrite: config.hasOperatorKey(),
      // the env default, i.e. what you get when no ?network= is supplied
      defaultNetwork: defaultNetworkName(),
      networks: [networkInfo("galileo"), networkInfo("mainnet")],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const GET = withNet(getHandler);
