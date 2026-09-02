import { NextResponse } from "next/server";
import { prepareMint, type AgentPersona } from "0g-nexus-sdk";
import { withNet } from "../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Server encrypts the persona + uploads to 0G Storage, returns the calldata the
// USER's wallet uses to mint (so the user is ownerOf on-chain).
async function postHandler(req: Request) {
  try {
    const body = await req.json();
    const persona = body?.persona as AgentPersona;
    const ownerAddress = body?.ownerAddress as string;
    const ownerPubKey = body?.ownerPubKey as string;
    if (!persona?.systemPrompt) return NextResponse.json({ error: "persona.systemPrompt required" }, { status: 400 });
    if (!ownerAddress || !ownerPubKey) return NextResponse.json({ error: "ownerAddress and ownerPubKey required" }, { status: 400 });
    persona.memory ??= [];
    persona.policy ??= { maxPerTx: "500000000000000", dailyBudget: "5000000000000000", maxTaskTTL: 300, allowedTools: [], bannedActions: [] };
    return NextResponse.json(await prepareMint(persona, ownerAddress, ownerPubKey));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const POST = withNet(postHandler);
