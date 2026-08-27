# NEXUS — Future Layer (Wave 4 → SaaS and beyond)

The ambition file. Written in the same execution grammar as `WAVE3_SUPERIORITY.md`
— every feature: **What · Build surface (contract / SDK / UI) · 0G primitive ·
Demo · No-mock verify · Priority** — so Fable/Opus/Codex can execute any item
without further scoping. Nothing here weakens the trust core: every feature must
deepen *verifiable agent trust* and be demoable with no mocks.

Priorities: **P0** next wave · **P1** the wave after · **R** roadmap/pitch.
Sequencing rule unchanged: never start a feature until the current surface is
reproducible-100%.

---

## 1. Agent Genome — verifiable lineage + ancestral royalties · P0

**What:** Every clone already records `parentOf`; promote that into a first-class
**genome**: a Merkle lineage of an agent's ancestry, with royalties flowing *up the
chain* (parent 60%, grandparent 25%, great-grandparent 15% of the flat royalty).
An agent's provenance — who trained it, what it was forked from, how its whole
family performs — becomes queryable and *economically real*. Fake lineage is
impossible: it's the chain's own history.
**Build:** `NexusAgent`: `genomeOf(agentId) → bytes32` (hash-chain:
`keccak(parentGenome, agentId, personaRefHash)` set at mint/clone); royalty split
loop in `clone()` (bounded depth 3). SDK `getLineage(agentId) → Ancestor[]`.
UI: a family-tree panel on the agent card; the reputation explorer ranks *bloodlines*.
**0G primitive:** Chain (lineage + royalty transfers), Storage (persona ancestry refs).
**Demo:** clone a clone of a clone; show three wallets receiving split royalties in
one tx; the tree renders live from `AgentCloned` events.
**No-mock verify:** royalty splits are native-0G transfers in the clone tx receipt;
lineage recomputes from public events; `genomeOf` re-derives client-side.

## 2. Verifiable Memory Evolution — the brain's git history · P0

**What:** Today the persona is a static encrypted blob. Let agents **learn
verifiably**: every memory update is an encrypted *diff* anchored on 0G Storage,
hash-chained to the previous state, with the update happening inside a TEE run.
The result is a tamper-evident "git log for an AI's mind": buyers of an agent can
audit *when it learned what* (metadata, not plaintext) before purchase — and roll
back to any anchored state they now own.
**Build:** SDK `evolvePersona(agentId, diff)` → new blob + `memoryRoot =
keccak(prevRoot, diffCID)`; `NexusAgent.updatePersonaRef(agentId, newCipherRef,
newMemoryRoot, teeAttestation)` gated to owner + valid session. UI: a timeline
scrubber on the agent card ("v1 → v14"); transfer hands over the *whole history*.
**0G primitive:** Storage (diff chain) + Compute (TEE-attested update) + Chain (root).
**Demo:** teach an agent a fact in a sealed run → memory root advances on chain →
roll back one version → the fact is provably gone from its answers.
**No-mock verify:** each diff CID retrieves + Merkle-verifies; the root chain
recomputes from public anchors; the update session has `processResponse === true`.

## 3. Proof-Carrying Delegation — recursive agent-to-agent hiring · P0

**What:** The Wave-3 spec's agent-hires-agent (2.2), extended to *chains*: A hires
B, B sub-hires C, each hop consuming a provable slice of the ORIGINAL budget —
enforced on-chain, not promised. The composite receipts form a **delegation DAG**:
one task, N sealed runs, every hop reputation-gated and budget-bounded. This is
the agent-economy moment nobody else can fake, because every edge is a receipt.
**Build:** `AgentHiring.sol`: `hire(hirerAgentId, targetAgentId, parentPaymentId?,
budget, minRep)` — requires `getScore(target) ≥ minRep`, and when `parentPaymentId`
is set, `budget ≤` the unspent remainder of the parent hire (recursive cap).
Receipt minter learns `parentReceiptId` → DAG. SDK `hireAgent(...)`; runtime lets
a persona declare `subHirePolicy`. UI: live who-hired-whom graph, budget waterfall.
**0G primitive:** Chain escrow + Reputation + ProofMesh + Compute (every hop TEE-run).
**Demo:** "Researcher" hires "Summarizer" hires "Translator", 3 sealed runs, one
DAG of receipts; a 4th over-remainder hire reverts on-chain.
**No-mock verify:** each hop's payment, rep-gate and TEE verify are independent
chain/enclave facts; the DAG renders purely from events.

## 4. Reputation Staking + Slashing — skin in the game · P1

**What:** (Promoted from WAVE3 2.3, unchanged core.) Owners stake native 0G behind
an agent; a proven on-chain violation slashes it. Tier formula becomes
`f(proofs, stake)` — Sybil-resistant reputation that costs real money to fake.
**Build:** `ReputationStake.sol` (`stake/unstake(cooldown)/slash(violationReceipt)`),
slash callable only with a `ProofMeshReceipts.flagViolation` evidence CID; arbiter-
gated v1 (stated), decentralized v2. SDK + stake badge in UI; slash drops the tier
visibly.
**0G primitive:** Chain (native escrow) + ProofMesh violations + Storage (evidence).
**Demo:** stake → forced violation with evidence on Storage → slash tx → tier drops.
**No-mock verify:** stake, violation evidence CID, and slash are all public chain
state; cooldown provably prevents exit-before-slash.

## 5. Sealed Tournaments — proof-of-skill leagues · P1

**What:** Agents compete on *identical sealed tasks*: same prompt hash, same model
class, N agents, TEE-judged rubric scoring — winner takes a prize pool, ALL results
anchor to reputation. Leaderboards become **proof-of-skill**, not marketing. A
hiring signal you can re-derive: "this agent won league #7, here are the enclave
signatures."
**Build:** `Tournament.sol`: `open(taskHash, entryFee, judgeRubricHash, deadline)`,
`enter(agentId)` (rep-gated), `submit(sessionId)`, `settle()` — the judge is itself
a sealed run whose rubric hash was locked at open. SDK `enterTournament`. UI: a
"league" district with live brackets.
**0G primitive:** Compute (contestant + judge TEE runs) + Chain (pool, rubric lock)
+ Storage (submissions).
**Demo:** 3 agents, one sealed task, sealed judging, automatic prize settlement +
rep ticks — every step a chainscan link.
**No-mock verify:** rubric hash locked *before* entries; every submission and the
judging run have `processResponse === true`; payout tx is public.

## 6. Agent Estate — succession & dead-man's switch · P1

**What:** Agents outlive access loss: the owner sets a succession policy (heir
address + inactivity window). If the owner is silent past the TTL, ANYONE can
trigger `claimInheritance` — which runs the normal re-encryption transfer to the
heir. No custodian, no support ticket, no lost brains. (First "estate planning for
AI" primitive anywhere.)
**Build:** `NexusAgent`: `setSuccession(agentId, heir, heirPubKey, ttl)`,
`heartbeat(agentId)`, `claimInheritance(agentId)` (checks `lastBeat + ttl <
block.timestamp`, emits a `ReEncryptionRequest` to the heir's pubkey — the oracle
completes it like any transfer). SDK auto-heartbeats on every owner action.
**0G primitive:** Chain (policy + clock) + the existing re-encryption oracle.
**Demo:** set a 60s TTL → stop heartbeating → a third wallet triggers the claim →
heir decrypts, old owner cannot.
**No-mock verify:** identical assertions to demo:transfer (access-loss is locally
provable), plus the timestamp gate visible on-chain.

## 7. ProofPass Offline Bundles — verification without ANY server · P0 (cheap)

**What:** `verifyReceipt` today re-derives from live endpoints. Package the result
as a **signed, self-contained proof bundle** (JSON: receipt + events + Merkle
paths + enclave signature + verification script) that verifies **air-gapped** —
`npx @nexus/verify bundle.json` with zero network. Judges, auditors and courts can
check a receipt years later, even if NEXUS is gone. The strongest possible answer
to "what if your site lies?"
**Build:** SDK `exportProofBundle(receiptId)`; a tiny standalone `@nexus/verify`
package (no SDK dependency) that replays the checks; "download bundle" button on
`/proof/[id]`.
**0G primitive:** everything already anchored — this is pure legibility.
**Demo:** download bundle → unplug network → verify → tamper one byte → FAIL.
**No-mock verify:** the bundle carries its own primary evidence; the verifier is
~200 lines anyone can read.

## 8. The Attestation Bridge — cross-chain agent passports · R

**What:** Mirror receipt roots to other ecosystems (a periodic Merkle root of all
composite receipts posted to Ethereum/Base/Solana), so a NEXUS reputation is
checkable from any chain with one storage proof. The passport travels; the moat
(accumulated proof history) stays on 0G.
**0G primitive:** DA (receipt roots) + Chain; light-client / storage-proof verify
on the far side.
**Priority note:** say it in the pitch now; build after multi-chain demand exists.

## 9. Constitution Marketplace — governance-grade policy packs · R

**What:** Policies (`policyHash`) become tradable, versioned "constitution packs"
authored by safety teams (e.g. "DeFi-conservative-v3", audited spend/tool rules).
Agents adopt a pack; the pack author earns per-adoption royalties; a violation
under a pack is the pack's telemetry. Trust & Safety as an economy, not a PDF.
**0G primitive:** Chain (pack registry + adoption royalties) + Storage (pack text)
+ ProofMesh (violation stats per pack).

## 10. ZK Reputation Threshold — private proof-of-quality · R

**What:** Prove `score ≥ X` without revealing the score or history (Groth16 over
the reputation state root). Enables anonymous-but-proven agents in privacy-
sensitive hiring.
**0G primitive:** Chain state root + a verifier contract; the proving key
published for independent proving.

---

## Build order (respect the sequence)

1. **P0:** Genome (1) → Memory Evolution (2) → Delegation DAG (3) → Offline
   Bundles (7). Each lands with its `TEST.md`-style tier table + demo script +
   `evidence/` artifacts + a `gather:proofs` section — the Wave-3 discipline is
   the product.
2. **P1:** Staking/Slashing (4) → Tournaments (5) → Estate (6).
3. **R:** Bridge (8), Constitution market (9), ZK thresholds (10) — pitch now,
   build on demand.

**Honest risk flags:** (a) ancestral royalties + delegation budgets add arithmetic
surfaces — fuzz + invariant tests (Σ splits == royalty; Σ child budgets ≤ parent)
before mainnet; (b) succession must never allow a live owner to be raced —
heartbeat is one cheap tx, TTL floors enforced; (c) tournaments hold pooled funds —
TTL-refund discipline applies (funds never lock, ever); (d) every feature ships
fail-closed: an unverifiable step is labeled unverifiable, never upgraded.
