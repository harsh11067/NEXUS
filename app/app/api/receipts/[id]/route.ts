import { NextResponse } from "next/server";
import { getReceiptProof } from "0g-nexus-sdk";
import { withNet } from "../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The 30-second proof bundle for a composite receipt.
async function getHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getReceiptProof(id));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 404 });
  }
}

export const GET = withNet(getHandler);
