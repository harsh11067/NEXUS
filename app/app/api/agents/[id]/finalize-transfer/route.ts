import { NextResponse } from "next/server";
import { finalizeTransferFor } from "0g-nexus-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Called after the USER signs requestTransfer. The oracle re-encrypts the persona
// for the buyer's pubkey and finalizes the ownership flip on-chain.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const buyerPubKey: string = body?.buyerPubKey ?? "";
    if (!buyerPubKey) return NextResponse.json({ error: "buyerPubKey required" }, { status: 400 });
    return NextResponse.json(await finalizeTransferFor(id, buyerPubKey));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
