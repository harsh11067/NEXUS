import { readFile, stat } from "node:fs/promises";
import { resolve, extname, normalize } from "node:path";
import { existsSync } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the cinematic NEXUS_UI districts (and their assets) so the whole product
// runs from a single server/origin — districts at /d/*, API at /api/*.
function uiRoot(): string {
  for (const c of [
    resolve(process.cwd(), "..", "NEXUS_UI"),
    resolve(process.cwd(), "NEXUS_UI"),
    resolve(process.cwd(), "..", "..", "NEXUS_UI"),
  ]) {
    if (existsSync(c)) return c;
  }
  return resolve(process.cwd(), "..", "NEXUS_UI");
}
const ROOT = uiRoot();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const rel = slug.map(decodeURIComponent).join("/");
  const filePath = normalize(resolve(ROOT, rel));
  if (!filePath.startsWith(ROOT)) return new Response("forbidden", { status: 403 });
  const s = await stat(filePath).catch(() => null);
  if (!s || !s.isFile()) return new Response("not found", { status: 404 });
  const body = await readFile(filePath);
  return new Response(body, {
    headers: {
      "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    },
  });
}
