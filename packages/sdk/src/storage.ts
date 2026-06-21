/**
 * 0G Storage wrapper. Uploads in-memory bytes (encrypted personas, trace bundles,
 * fulfillment evidence) and downloads them back, with Merkle-root verification.
 * The returned `rootHash` is what we anchor on chain as the cipher reference.
 */
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { Wallet } from "ethers";
import { config } from "./config.js";

export interface UploadResult {
  rootHash: string;
  txHash?: string;
}

let _indexer: Indexer | null = null;
function indexer(): Indexer {
  if (!_indexer) _indexer = new Indexer(config.storageIndexer());
  return _indexer;
}

/** Upload raw bytes to 0G Storage. Returns the Merkle root hash (the CID). */
export async function uploadBytes(bytes: Uint8Array, signer: Wallet): Promise<UploadResult> {
  const file = new MemData(bytes);
  const [tree, treeErr] = await file.merkleTree();
  if (treeErr !== null) throw new Error(`merkleTree failed: ${treeErr}`);
  const rootHash = tree!.rootHash();
  if (!rootHash) throw new Error("merkleTree returned empty root hash");

  const [tx, uploadErr] = await indexer().upload(file, config.rpcUrl(), signer);
  if (uploadErr !== null) {
    // a blob already present on the network returns a benign "already exists"
    const msg = String(uploadErr);
    if (!/exist|already/i.test(msg)) throw new Error(`upload failed: ${msg}`);
  }
  const txHash = tx && typeof tx === "object" && "txHash" in tx ? (tx as any).txHash : undefined;
  return { rootHash, txHash };
}

/** Download bytes by root hash. Verifies the Merkle proof. */
export async function downloadBytes(rootHash: string): Promise<Uint8Array> {
  const [blob, err] = await indexer().downloadToBlob(rootHash, { proof: true } as any);
  if (err !== null) throw new Error(`download failed: ${err}`);
  const ab = await (blob as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
  return new Uint8Array(ab);
}

/** Compute the 0G Storage root hash for some bytes without uploading. */
export async function computeRootHash(bytes: Uint8Array): Promise<string> {
  const file = new MemData(bytes);
  const [tree, treeErr] = await file.merkleTree();
  if (treeErr !== null) throw new Error(`merkleTree failed: ${treeErr}`);
  return tree!.rootHash()!;
}

/** Encode a storage root hash as on-chain bytes (utf8 of the hex string). */
export function rootHashToBytes(rootHash: string): Uint8Array {
  return new TextEncoder().encode(rootHash);
}

export function bytesToRootHash(bytes: string): string {
  // bytes come back from chain as a 0x-hex string; decode utf8
  const clean = bytes.startsWith("0x") ? bytes.slice(2) : bytes;
  const buf = Buffer.from(clean, "hex");
  return buf.toString("utf8");
}
