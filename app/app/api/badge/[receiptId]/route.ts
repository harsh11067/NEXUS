import { verifyReceipt } from "0g-nexus-sdk";
import { withNet } from "../../../lib/net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Embeddable "NEXUS-verified" badge. Any marketplace or agent host drops
//   <a href="<site>/proof/<id>"><img src="<site>/api/badge/<id>" /></a>
// next to an agent — the verdict is re-derived live, not cached from a claim.
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

async function getHandler(_req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  let body: string;
  try {
    const p = await verifyReceipt(receiptId);
    body = p.valid
      ? svg(`NEXUS receipt #${receiptId}`, p.tee.reVerified === true ? "TEE-VERIFIED ✓" : "VERIFIED ✓", "#3ad07a")
      : svg(`NEXUS receipt #${receiptId}`, "UNVERIFIED", "#ffc23a");
  } catch {
    body = svg(`NEXUS receipt #${receiptId}`, "NOT FOUND", "#ff5a6a");
  }
  return new Response(body, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const GET = withNet(getHandler);
