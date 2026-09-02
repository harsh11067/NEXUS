import { NextResponse } from "next/server";
import { replayReceipt, config } from "0g-nexus-sdk";
import { withNet } from "../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Re-run the receipt: decrypt the sealed trace, re-execute on the SAME
// attested provider with the same deterministic params, compare + re-verify.
// Needs the operator key (traces are encrypted; the run costs compute) — on a
// read-only deployment this fails CLOSED with a clear message and the CLI
// command a verifier can run themselves.
async function postHandler(_req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  if (!config.hasOperatorKey()) {
    return NextResponse.json(
      {
        error: "read-only deployment: replay runs sealed inference and decrypts the trace, which needs the operator key.",
        runYourself: `OG_NETWORK=${config.network()} pnpm demo:replay ${receiptId}`,
      },
      { status: 503 },
    );
  }
  try {
    const r = await replayReceipt(receiptId);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const POST = withNet(postHandler);
