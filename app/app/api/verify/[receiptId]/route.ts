import { NextResponse } from "next/server";
import { verifyReceipt } from "0g-nexus-sdk";
import { withNet } from "../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ProofPass: re-derives the validity of a composite receipt from primary
// sources (chain + 0G Storage + the provider's TEE signature endpoint) —
// it does NOT return a stored boolean.
async function getHandler(_req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  try {
    const { receiptId } = await params;
    return NextResponse.json(await verifyReceipt(receiptId));
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = /not found/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export const GET = withNet(getHandler);
