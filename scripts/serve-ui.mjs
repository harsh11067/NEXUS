// Minimal static server for the NEXUS_UI districts (no dependencies).
// Serves the cinematic .dc.html pages + support.js + nexus-district.js +
// nexus-api.js over http so they can fetch the API with proper CORS.
//   node scripts/serve-ui.mjs            -> http://localhost:4000
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../NEXUS_UI");
const PORT = Number(process.env.UI_PORT ?? 4000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (path === "/") path = "/NEXUS World.dc.html";
    const filePath = normalize(resolve(ROOT, "." + path));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const s = await stat(filePath).catch(() => null);
    if (!s || !s.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(PORT, () => {
  console.log(`\n  NEXUS districts → http://localhost:${PORT}/`);
  console.log(`  (make sure the API is running: pnpm --filter @nexus/app dev)\n`);
});
