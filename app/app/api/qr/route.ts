import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// QR for proof/agent links — only same-origin paths are encoded, so the QR
// can never be pointed at a foreign site through this endpoint.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "/";
  if (!path.startsWith("/") || path.startsWith("//")) {
    return new Response("path must be a same-origin path", { status: 400 });
  }
  const target = `${url.origin}${path}`;
  const svg = await QRCode.toString(target, {
    type: "svg",
    margin: 1,
    width: 220,
    color: { dark: "#dce6ff", light: "#0b1020" },
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
