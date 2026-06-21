/**
 * G3 — 0G Storage round-trip.
 * Write a ~50KB blob -> get a root hash -> download -> assert identical bytes.
 * Pass condition: bytes match; storage explorer link printed.
 */
import { randomBytes } from "node:crypto";
import { uploadBytes, downloadBytes, storageFileUrl } from "@nexus/sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";

async function main() {
  banner("G3 · 0G Storage round-trip");
  const { wallet } = await preflight();

  // ~50KB persona-sized blob with a recognizable marker
  const marker = `nexus-g3-${Date.now()}`;
  const payload = Buffer.concat([Buffer.from(marker), randomBytes(50 * 1024)]);
  info("payload", `${payload.length} bytes, marker=${marker}`);

  console.log("  uploading to 0G Storage…");
  const { rootHash, txHash } = await uploadBytes(new Uint8Array(payload), wallet);
  ok(`uploaded · rootHash ${rootHash}`);
  if (txHash) info("storage tx", txHash);
  info("explorer", storageFileUrl(rootHash));

  console.log("  downloading back…");
  const got = await downloadBytes(rootHash);

  if (got.length !== payload.length) fail(`length mismatch: ${got.length} != ${payload.length}`);
  if (Buffer.compare(Buffer.from(got), payload) !== 0) fail("byte mismatch on round-trip");

  ok("round-trip identical — 0G Storage is REAL ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
