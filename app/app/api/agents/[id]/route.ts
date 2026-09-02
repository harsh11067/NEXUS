import { NextResponse } from "next/server";
import { getAgentCard } from "0g-nexus-sdk";
import { withNet } from "../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getAgentCard(id));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const GET = withNet(getHandler);
