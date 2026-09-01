import { NextResponse } from "next/server";
import { prepareClone, pubKeyOf } from "0g-nexus-sdk";
import { Wallet } from "ethers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Server re-encrypts the persona for the cloner + signs the clone digest; the
// USER's wallet sends the clone tx (pays royalty, becomes the clone owner).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    let toAddress: string = body?.toAddress ?? "";
    let toPubKey: string = body?.toPubKey ?? "";
    if (!toAddress || !toPubKey) {
      const w = Wallet.createRandom();
      toAddress = w.address;
      toPubKey = pubKeyOf(w.privateKey);
    }
    const r = await prepareClone(id, toAddress, toPubKey);
    return NextResponse.json({ ...r, toAddress });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
