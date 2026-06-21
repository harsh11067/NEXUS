/**
 * Persona encryption for NEXUS.
 *
 * The persona is encrypted with a random AES-256-GCM content key. That content
 * key is then wrapped (ECIES over secp256k1) to one or more recipient public
 * keys. We always wrap to TWO recipients:
 *   - the agent OWNER   (so the owner can decrypt and run the agent)
 *   - the re-encryption ORACLE (so transfer can re-wrap the key for a buyer
 *     without ever exposing the plaintext to the chain).
 *
 * This is the honest v1 trust model: the oracle is trusted to behave (it can
 * unwrap the content key), and that assumption is stated openly. v2 moves the
 * oracle into a TEE. The plaintext persona is NEVER on chain — only the 0G
 * Storage reference to this cipher blob is.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt } from "eciesjs";
import { computeAddress, SigningKey, getBytes, hexlify } from "ethers";

export const CIPHER_VERSION = 1;
export const CIPHER_ALG = "AES-256-GCM+ECIES-secp256k1";

export interface CipherBlob {
  v: number;
  alg: string;
  iv: string; // hex
  ciphertext: string; // hex
  tag: string; // hex
  /** map of recipient uncompressed pubkey (hex) -> ECIES-wrapped content key (hex) */
  wraps: Record<string, string>;
}

/** Uncompressed secp256k1 public key (0x04…) for a private key. */
export function pubKeyOf(privateKey: string): string {
  return SigningKey.computePublicKey(privKeyToSigning(privateKey), false);
}

export function addressOf(privateKey: string): string {
  return computeAddress(privKeyToSigning(privateKey));
}

function privKeyToSigning(pk: string): string {
  return pk.startsWith("0x") ? pk : `0x${pk}`;
}

/** Encrypt a persona (or any bytes) to a set of recipient public keys. */
export function encryptForRecipients(plaintext: Uint8Array, recipientPubKeys: string[]): CipherBlob {
  const contentKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", contentKey, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();

  const wraps: Record<string, string> = {};
  for (const pub of dedupe(recipientPubKeys)) {
    const normalized = normalizePub(pub);
    const wrapped = eciesEncrypt(normalized, Buffer.from(contentKey));
    wraps[normalized] = hexlify(wrapped);
  }

  return {
    v: CIPHER_VERSION,
    alg: CIPHER_ALG,
    iv: hexlify(iv),
    ciphertext: hexlify(ct),
    tag: hexlify(tag),
    wraps,
  };
}

/** Decrypt a cipher blob using a private key whose pubkey is one of the wraps. */
export function decryptBlob(blob: CipherBlob, privateKey: string): Uint8Array {
  const myPub = normalizePub(pubKeyOf(privateKey));
  const wrapped = blob.wraps[myPub];
  if (!wrapped) {
    throw new Error(
      `no wrap for this key (have wraps for: ${Object.keys(blob.wraps).join(", ")})`,
    );
  }
  const contentKey = eciesDecrypt(strip0x(privateKey), Buffer.from(getBytes(wrapped)));
  const decipher = createDecipheriv("aes-256-gcm", contentKey, Buffer.from(getBytes(blob.iv)));
  decipher.setAuthTag(Buffer.from(getBytes(blob.tag)));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(getBytes(blob.ciphertext))),
    decipher.final(),
  ]);
  return new Uint8Array(pt);
}

/**
 * Re-encrypt a blob for a new owner. The oracle unwraps the content key with its
 * own private key and re-wraps it for [newOwnerPub, oraclePub]. The ciphertext is
 * unchanged; only the key wraps change — so the seller's old wrap no longer
 * appears and the seller provably loses access.
 */
export function reEncryptForNewOwner(
  blob: CipherBlob,
  oraclePrivateKey: string,
  newOwnerPubKey: string,
): CipherBlob {
  const oraclePub = normalizePub(pubKeyOf(oraclePrivateKey));
  const wrapped = blob.wraps[oraclePub];
  if (!wrapped) throw new Error("oracle has no wrap on this blob — cannot re-encrypt");
  const contentKey = eciesDecrypt(strip0x(oraclePrivateKey), Buffer.from(getBytes(wrapped)));

  const wraps: Record<string, string> = {};
  for (const pub of dedupe([newOwnerPubKey, oraclePub])) {
    const normalized = normalizePub(pub);
    wraps[normalized] = hexlify(eciesEncrypt(normalized, Buffer.from(contentKey)));
  }
  return { ...blob, wraps };
}

export function encodeBlob(blob: CipherBlob): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(blob));
}

export function decodeBlob(bytes: Uint8Array): CipherBlob {
  return JSON.parse(new TextDecoder().decode(bytes)) as CipherBlob;
}

function normalizePub(pub: string): string {
  // eciesjs wants the uncompressed key; ethers gives 0x04… — keep as 0x-hex
  return pub.startsWith("0x") ? pub.toLowerCase() : `0x${pub.toLowerCase()}`;
}

function strip0x(s: string): string {
  return s.startsWith("0x") ? s.slice(2) : s;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.toLowerCase())));
}
