import { NextResponse } from "next/server";
import {
  getAgentCard,
  buildAgentCard,
  findIdentity,
  fetchAndVerifyCard,
  listValidations,
  getLineage,
  network,
  config,
  explorerAddress,
  loadDeployments,
} from "@nexus/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// The public agent card: NEXUS trust state (chain-derived) + the ERC-8004
// portable identity panel (canonical registry + NEXUS validations), every
// field independently checkable.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const base = new URL(req.url).origin;
    const nexus = await getAgentCard(id);
    const d = loadDeployments();

    let erc8004: any = null;
    try {
      const found = await findIdentity(id);
      if (found) {
        let cardCheck: any = null;
        try {
          const c = await fetchAndVerifyCard(found.erc8004AgentId);
          cardCheck = { hashMatches: c.hashMatches, contentHash: c.contentHash, agentURI: c.agentURI, name: c.card.name };
        } catch { /* stated below as unverifiable */ }
        let validations: any[] = [];
        try { validations = await listValidations(found.erc8004AgentId); } catch { /* validation registry may not be deployed */ }
        erc8004 = {
          erc8004AgentId: found.erc8004AgentId,
          identityRegistry: network().erc8004.identity,
          identityRegistryUrl: explorerAddress(network().erc8004.identity),
          agentURI: found.agentURI,
          cardCheck,
          validations,
          validationRegistry: d.ERC8004ValidationRegistry ?? null,
          validator: d.NexusTEEValidator ?? null,
        };
      }
    } catch { /* no portable identity — shown as such, never faked */ }

    let lineage: any[] = [];
    try { lineage = await getLineage(id, 6); } catch { /* solo agent */ }

    // the ERC-8004-style card JSON (what registerIdentity uploads)
    const cardJson = await buildAgentCard(id, { appBaseUrl: base });

    return NextResponse.json({
      network: config.network(),
      chainId: network().chainId,
      explorerUrl: config.explorerUrl(),
      agentUrl: explorerAddress(d.NexusAgent),
      nexus,
      erc8004,
      lineage,
      cardJson,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 404 });
  }
}
