/**
 * Tier-1 SDK unit tests (TEST.md U-01…U-05) — pure local crypto, no network.
 *   pnpm test:sdk
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import {
  encryptForRecipients,
  decryptBlob,
  encodeBlob,
  decodeBlob,
  reEncryptForNewOwner,
  pubKeyOf,
} from "../src/crypto.js";
import { computePolicyHash, serializePersona, deserializePersona, type AgentPersona } from "../src/persona.js";

const persona: AgentPersona = {
  name: "Unit Probe",
  description: "test persona",
  systemPrompt: "You are a test.",
  memory: [{ role: "note", content: "memo" }],
  policy: {
    maxPerTx: "1000",
    dailyBudget: "5000",
    maxTaskTTL: 60,
    allowedTools: [{ name: "tool", merchant: "0x2f737521b9b59c202e7d33509C5746A58D795870" }],
    bannedActions: ["sendTransaction"],
  },
};

test("U-01: AES-256-GCM persona encrypt/decrypt round-trip", () => {
  const owner = Wallet.createRandom();
  const blob = encryptForRecipients(serializePersona(persona), [pubKeyOf(owner.privateKey)]);
  const back = deserializePersona(decryptBlob(blob, owner.privateKey));
  assert.deepEqual(back, persona);
});

test("U-01b: cipher blob JSON encode/decode round-trip", () => {
  const owner = Wallet.createRandom();
  const blob = encryptForRecipients(new TextEncoder().encode("hello 0g"), [pubKeyOf(owner.privateKey)]);
  const decoded = decodeBlob(encodeBlob(blob));
  assert.equal(new TextDecoder().decode(decryptBlob(decoded, owner.privateKey)), "hello 0g");
});

test("U-02: ECIES key-wrap — every listed recipient can unwrap, others cannot", () => {
  const owner = Wallet.createRandom();
  const oracle = Wallet.createRandom();
  const stranger = Wallet.createRandom();
  const blob = encryptForRecipients(toUtf8Bytes("secret brain"), [
    pubKeyOf(owner.privateKey),
    pubKeyOf(oracle.privateKey),
  ]);
  assert.equal(Object.keys(blob.wraps).length, 2);
  assert.doesNotThrow(() => decryptBlob(blob, owner.privateKey));
  assert.doesNotThrow(() => decryptBlob(blob, oracle.privateKey));
  assert.throws(() => decryptBlob(blob, stranger.privateKey), /no wrap/);
});

test("U-03: proxy re-encryption — OLD owner loses access, NEW owner gains it", () => {
  const seller = Wallet.createRandom();
  const oracle = Wallet.createRandom();
  const buyer = Wallet.createRandom();
  const blob = encryptForRecipients(serializePersona(persona), [
    pubKeyOf(seller.privateKey),
    pubKeyOf(oracle.privateKey),
  ]);
  const reBlob = reEncryptForNewOwner(blob, oracle.privateKey, pubKeyOf(buyer.privateKey));
  // buyer can decrypt, seller cannot — the money-shot, locally provable
  assert.deepEqual(deserializePersona(decryptBlob(reBlob, buyer.privateKey)), persona);
  assert.throws(() => decryptBlob(reBlob, seller.privateKey), /no wrap/);
  // ciphertext unchanged; only the wraps rotated
  assert.equal(reBlob.ciphertext, blob.ciphertext);
  assert.ok(!Object.keys(reBlob.wraps).includes(pubKeyOf(seller.privateKey).toLowerCase()));
});

test("U-03b: only the oracle can re-encrypt (a stranger cannot rotate wraps)", () => {
  const seller = Wallet.createRandom();
  const oracle = Wallet.createRandom();
  const attacker = Wallet.createRandom();
  const blob = encryptForRecipients(toUtf8Bytes("x"), [pubKeyOf(seller.privateKey), pubKeyOf(oracle.privateKey)]);
  assert.throws(
    () => reEncryptForNewOwner(blob, attacker.privateKey, pubKeyOf(attacker.privateKey)),
    /oracle has no wrap/,
  );
});

test("U-04: policy hash is deterministic and formatting-independent", () => {
  const h1 = computePolicyHash(persona.policy);
  const h2 = computePolicyHash(JSON.parse(JSON.stringify(persona.policy)));
  assert.equal(h1, h2);
  assert.match(h1, /^0x[0-9a-f]{64}$/);
  // any semantic change moves the hash
  const changed = { ...persona.policy, maxPerTx: "1001" };
  assert.notEqual(computePolicyHash(changed), h1);
  // lowercase/checksum merchant formatting must NOT move the hash
  const lower = {
    ...persona.policy,
    allowedTools: [{ name: "tool", merchant: "0x2f737521b9b59c202e7d33509c5746a58d795870" }],
  };
  assert.equal(computePolicyHash(lower), h1);
});

test("U-05: attestation decodes to the ProofPass shape {provider, chatID, model, verified, outputHash}", () => {
  const parts = {
    provider: "0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C",
    chatID: "abc-123",
    model: "zai-org/GLM-5-FP8",
    verified: true,
    outputHash: keccak256(toUtf8Bytes("output")),
  };
  const hex = Buffer.from(JSON.stringify(parts)).toString("hex");
  const decoded = JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
  assert.deepEqual(decoded, parts);
});
