import { exportProofBundle } from "0g-nexus-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Download a self-contained offline proof bundle for a receipt. Verify it
// air-gapped with `pnpm verify:bundle <file>` — the strongest answer to
// "what if your site lies?": the site hands you the evidence and the math.
export async function GET(_req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  try {
    const bundle = await exportProofBundle(receiptId);
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="nexus-proof-bundle-${bundle.network.name}-${receiptId}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
