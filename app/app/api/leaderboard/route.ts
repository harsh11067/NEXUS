import { NextResponse } from "next/server";
import { getLeaderboard, config, network } from "@nexus/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ranked purely from on-chain reputation state (proof-only writes) — the
// server reads chain, the client renders. Nothing client-sortable, nothing
// self-reported (N-L05).
export async function GET() {
  try {
    const rows = await getLeaderboard(50);
    return NextResponse.json({
      network: config.network(),
      chainId: network().chainId,
      explorerUrl: config.explorerUrl(),
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
