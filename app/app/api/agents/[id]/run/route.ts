import { NextResponse } from "next/server";
import { runTask, getWallet } from "0g-nexus-sdk";
import { withNet } from "../../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const prompt: string = body?.prompt ?? "";
    const prove: boolean = body?.prove !== false;
    if (!prompt.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });
    const result = await runTask(id, prompt, { prove }, getWallet());
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const POST = withNet(postHandler);
