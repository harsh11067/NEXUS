import { getAgentCard, findIdentity } from "0g-nexus-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Agent-level badge: tier + verified task count, re-derived from chain on
// every render (cached 5 min). Green only when real receipts back it.
function svg(label: string, value: string, color: string): string {
  const lw = 7 * label.length + 14;
  const vw = 7 * value.length + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="24" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <rect rx="4" width="${lw + vw}" height="24" fill="#0b1020"/>
  <rect rx="4" x="${lw}" width="${vw}" height="24" fill="${color}"/>
  <rect rx="4" width="${lw + vw}" height="24" fill="url(#s)"/>
  <g fill="#dce6ff" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11">
    <text x="${lw / 2}" y="16" fill="#8092b8">${label}</text>
    <text x="${lw + vw / 2}" y="16" fill="#04060e" font-weight="bold">${value}</text>
  </g>
</svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  let body: string;
  try {
    const card = await getAgentCard(agentId);
    let portable = false;
    try { portable = (await findIdentity(agentId)) !== null; } catch { /* badge stays honest without it */ }
    const label = `NEXUS agent #${agentId}${portable ? " · ERC-8004" : ""}`;
    body = card.taskCount > 0
      ? svg(label, `${card.tier.toUpperCase()} · ${card.taskCount} proven`, "#3ad07a")
      : svg(label, card.tier.toUpperCase(), "#ffc23a");
  } catch {
    body = svg(`NEXUS agent #${agentId}`, "NOT FOUND", "#ff5a6a");
  }
  return new Response(body, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
