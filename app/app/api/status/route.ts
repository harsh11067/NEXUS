import { NextResponse } from "next/server";
import { systemStatus } from "../../lib/server";
import { withNet } from "../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(_req: Request) {
  try {
    return NextResponse.json(await systemStatus());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const GET = withNet(getHandler);
