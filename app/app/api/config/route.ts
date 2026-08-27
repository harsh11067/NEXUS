import { NextResponse } from "next/server";
import { config, getWallet, loadDeployments, deploymentsExist } from "@nexus/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public config the browser wallet needs: chain, addresses, and the operator
// address the user authorizes as an executor (so the server can run/prove for them).
export async function GET() {
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
      currency: { name: "0G", symbol: "0G", decimals: 18 },
      deployed: deploymentsExist(),
      addresses: deploymentsExist() ? loadDeployments() : null,
      executor,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
