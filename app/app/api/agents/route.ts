import { NextResponse } from "next/server";
import { createAgent, getWallet, type AgentPersona } from "@nexus/sdk";
import { listAgents } from "../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ agents: await listAgents() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const persona = (await req.json()) as AgentPersona;
    if (!persona?.systemPrompt) {
      return NextResponse.json({ error: "systemPrompt required" }, { status: 400 });
    }
    // default the policy if the form omitted parts
    persona.memory ??= [];
    persona.policy ??= {
      maxPerTx: "500000000000000",
      dailyBudget: "5000000000000000",
      maxTaskTTL: 300,
      allowedTools: [],
      bannedActions: [],
    };
    const result = await createAgent(persona, getWallet());
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
