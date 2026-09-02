import { NextResponse } from "next/server";
import { cloneAgent, getWallet, pubKeyOf } from "0g-nexus-sdk";
import { Wallet } from "ethers";
import { withNet } from "../../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    let toAddress: string = body?.toAddress ?? "";
    let toPubKey: string = body?.toPubKey ?? "";
    // no recipient given -> mint the clone to a fresh keypair (demo "new owner")
    if (!toAddress || !toPubKey) {
      const w = Wallet.createRandom();
      toAddress = w.address;
      toPubKey = pubKeyOf(w.privateKey);
    }
    const result = await cloneAgent(id, toAddress, toPubKey, getWallet());
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const POST = withNet(postHandler);
