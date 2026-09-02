import { NextResponse } from "next/server";
import { transferAgent, getWallet, pubKeyOf } from "0g-nexus-sdk";
import { Wallet } from "ethers";
import { withNet } from "../../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    let buyerAddress: string = body?.buyerAddress ?? "";
    let buyerPubKey: string = body?.buyerPubKey ?? "";
    // no buyer given -> generate one (demonstrates the ownership flip + re-encryption)
    if (!buyerAddress || !buyerPubKey) {
      const w = Wallet.createRandom();
      buyerAddress = w.address;
      buyerPubKey = pubKeyOf(w.privateKey);
    }
    const result = await transferAgent(id, buyerAddress, buyerPubKey, getWallet());
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const POST = withNet(postHandler);
