/**
 * Tier-1 unit tests for the next-feature layer (TEST_NEXT.md N-U01…N-U05) —
 * pure local computation, no network.
 *   pnpm test:sdk
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toUtf8Bytes } from "ethers";
import { sanitizeCardText, type Erc8004AgentCard } from "../src/erc8004.js";
import { compareReplay } from "../src/replay.js";
import { sortLeaderboard, type LeaderboardRow } from "../src/leaderboard.js";

// ------------------------------------------------- N-U01 agent card schema
function validCard(): Erc8004AgentCard {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004",
    name: "NEXUS Agent #1",
    description: "test",
    services: [{ name: "web", endpoint: "https://example.org/agent/1" }],
    registrations: [{ agentRegistry: "eip155:16661:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }],
    trustModels: ["tee-attestation", "reputation"],
    nexus: {
      chainId: 16661,
      nexusAgentContract: "0x7D4eD6c120E41a241973760D8aD244f2f9Ec6793",
      nexusAgentId: "1",
      owner: "0x907c508449eb3F9D14BD8844AC71839DE90bD046",
      policyHash: "0x" + "11".repeat(32),
      score: 10,
      tier: "Trusted",
      taskCount: 3,
      verifyUrl: "https://example.org/agent/1",
      proofPassBadge: "https://example.org/api/badge/agent/1",
    },
  };
}

test("N-U01: agent card carries every required ERC-8004 + NEXUS field", () => {
  const card = validCard();
  assert.equal(card.type, "https://eips.ethereum.org/EIPS/eip-8004");
  for (const key of ["name", "description", "services", "registrations", "trustModels", "nexus"] as const) {
    assert.ok(card[key] !== undefined && card[key] !== "", `missing ${key}`);
  }
  assert.match(card.registrations[0].agentRegistry, /^eip155:\d+:0x[0-9a-fA-F]{40}$/);
  assert.ok(card.nexus.chainId > 0 && card.nexus.nexusAgentId.length > 0);
});

test("N-U01b: card text sanitization strips markup/control chars (N-L04)", () => {
  assert.equal(sanitizeCardText("<script>alert(1)</script>Agent"), "scriptalert(1)/scriptAgent");
  assert.equal(sanitizeCardText('a"b\'c`d&e<f>g'), "abcdefg");
  assert.equal(sanitizeCardText("x".repeat(500)).length, 200);
  assert.equal(sanitizeCardText("tab\tand\nnewline"), "tab and newline");
});

// ------------------------------------------- N-U02 content hash determinism
test("N-U02: contentHash(card) is deterministic and byte-sensitive", () => {
  const a = JSON.stringify(validCard(), null, 2);
  const b = JSON.stringify(validCard(), null, 2);
  assert.equal(keccak256(toUtf8Bytes(a)), keccak256(toUtf8Bytes(b)));
  const mutated = a.replace("Trusted", "Elite");
  assert.notEqual(keccak256(toUtf8Bytes(a)), keccak256(toUtf8Bytes(mutated)));
});

// --------------------------------------------------- N-U03/N-U04 comparator
test("N-U03: identical outputs → match=true with equal hashes", () => {
  const r = compareReplay("the answer is 256", "the answer is 256");
  assert.equal(r.match, true);
  assert.equal(r.originalHash, r.replayHash);
});

test("N-U04: tampered output → match=false", () => {
  const r = compareReplay("the answer is 256", "the answer is 257");
  assert.equal(r.match, false);
  assert.notEqual(r.originalHash, r.replayHash);
});

// -------------------------------------------------------- N-U05 leaderboard
test("N-U05: leaderboard sorts by score desc, taskCount desc, id asc — from chain values only", () => {
  const row = (agentId: string, score: number, taskCount: number): LeaderboardRow => ({
    agentId, owner: "0x0", score, tier: "t", taskCount, cloneCount: 0, parentOf: "0",
  });
  const rows = [row("3", 5, 1), row("1", 9, 2), row("4", 9, 7), row("2", 9, 7)];
  const sorted = sortLeaderboard(rows);
  assert.deepEqual(sorted.map((r) => r.agentId), ["2", "4", "1", "3"]);
  // stable against input order
  const sorted2 = sortLeaderboard(rows.reverse());
  assert.deepEqual(sorted2.map((r) => r.agentId), ["2", "4", "1", "3"]);
});
