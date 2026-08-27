# NEXUS — Wave 3 Superiority Spec

The definitive build spec to make NEXUS a genuinely superior Wave 3 submission: every existing feature hardened to reproducible-100% on **mainnet (16661)**, plus a futuristic layer that puts it ahead of anything that has won a 0G wave. Extends `PLAN.md`, `FEATURES.md`, `CONTRACTS.md`, `TEST.md`. Written so Fable/Opus/Codex can execute each item without further scoping.

**Superiority thesis:** *mainnet + genuinely-working deep primitives + an autonomous-agent-economy layer + total verifiability legibility (anyone verifies any claim in 30s, offline).* The last-wave winner shipped plain ERC721 on mainnet; NEXUS ships real ERC-7857 re-encryption + TEE proofs on mainnet, plus the layer below.

**Sequencing rule (do not violate):** finish Part 1 (harden to 100%) before starting Part 2 (advanced). Ten features at 70% loses to seven at 100% + three that genuinely wow. Every new feature must deepen *verifiable agent trust* and be demoable + reproducible with no mocks.

---

# Part 1 — Harden existing features to reproducible-100% (mainnet)

"100% working" = works end-to-end on mainnet, no mock on any 0G path, a stranger can reproduce it from the live URL, and every failure mode is handled gracefully. Definition-of-done per feature:

| # | Feature | "100%" means | Proof (from TEST.md / PROOFS.md) |
| --- | --- | --- | --- |
| 1 | Create agent (ERC-7857 mint) | mainnet mint; encrypted persona really on mainnet 0G Storage; `ownerOf`/`getPersonaRef`/`getPolicyHash` resolve on chainscan | R-04, S-01/S-02, A-01 |
| 2 | Run in Sealed Inference | real TeeML run; `processResponse === true`; `teeSignature` anchored in `SessionClosed`; provider-down path labels `unverified` not fake-verified | T-01…T-06 |
| 3 | Verifiable trace | trace blob on mainnet Storage; `traceCID` on-chain == uploaded root; Merkle-verifies | S-03, C-11/C-12 |
| 4 | Transfer (re-encryption) | mainnet ownership flip; **seller key provably cannot decrypt new cipherRef, buyer can**; replay-safe | U-03, C-04…C-07, E-02 |
| 5 | Clone w/ royalty | mainnet clone; royalty paid to creator; `cloneCount++`; reputation reflects | C-08/C-09, E-03 |
| 6 | Policy escrow (hire) | mainnet lock→fulfill→settle; over-limit + disallowed-merchant blocked; TTL refund works | C-13…C-18, E-04, R-06/R-07 |
| 7 | Proof-only reputation | mainnet score moves only via receipt-anchored writes; non-writer reverts; tier recomputes | C-19/C-20, E-07 |
| 8 | Composite receipt | one receipt per task, session(+payment) tied, replay-safe | C-21…C-23 |

Hardening tasks that are usually where "not 100%" hides:
- **Storage propagation** (3–5 min) handled with retry/backoff + a pending UI state, never a hard fail.
- **Broker ledger** kept funded (≥3 0G ledger, ≥1 0G/provider); preflight aborts with guidance if underfunded.
- **Signer/oracle** address on mainnet matches `NexusAgent.setSigner`; otherwise every transfer/clone reverts `BadSignature` — verify first.
- **Env switch** `NEXT_PUBLIC_USE_MAINNET=true` with testnet fallback so a mainnet hiccup never dark-screens the demo.
- **Failure UX** everywhere: provider down, tx rejected, storage slow → calm message + retry, never a stack trace.
- **No secrets in the browser bundle** (grep the build).

---

# Part 2 — The advanced / futuristic layer

Each feature: what it is · build surface (contract / SDK / UI) · 0G primitive · how it's demoed · how it's verified with no mock · priority. Priorities: **P0** ship for Wave 3 · **P1** ship if time · **R** roadmap (say it, don't build it this wave).

## 2.1 ProofPass — offline-verifiable proof, public API, embeddable badge  · P0
**What:** anyone verifies any NEXUS receipt in ~30s **without trusting NEXUS's server** — the killer legibility feature and the SaaS wedge.
**Build:**
- SDK `verifyReceipt(receiptId) → ProofBundle` assembling: composite receipt + session + `traceCID` + `{provider, chatID}` + reputation delta + signer. Then it independently: re-runs `processResponse(provider, chatID)`, Merkle-verifies the trace blob against the anchored root, recomputes the reputation delta from the receiptHash, checks the trustedSigner recovery.
- API route `GET /api/verify/[receiptId]` returns `{ valid, owner, model, modelHash, policyHash, payment, repDelta, teeVerified, traceVerified }`.
- UI `/proof/[receiptId]`: every field links to its on-chain source; a big green/red **VALID** with a client-side "re-verify" button; a "copy badge" snippet.
- Embeddable badge: an `<iframe>`/`<img>` "NEXUS-verified ✓" any marketplace can drop next to an agent, linking to the verify page.
**0G primitive:** Chain (events) + Compute (`processResponse`) + Storage (Merkle).
**Demo:** paste any receiptId → 30s → all green, live.
**No-mock verify:** the page re-derives validity from chain/TEE/storage, not from a stored boolean. (TEST T-07, E-05, A-03.)

## 2.2 Agent-to-agent autonomous hiring (reputation-gated policy escrow)  · P0
**What:** an agent autonomously hires a *proven* sub-agent, paying from an on-chain-bounded budget, gated by reputation. The futuristic multi-agent-economy moment, squarely on 0G's agent thesis.
**Build:**
- Contract: extend `NexusEscrow` or add `AgentHiring.sol` — `hire(hirerAgentId, targetAgentId, bytes32 sessionId, uint256 budget, task)` requires `ReputationRegistry.getScore(targetAgentId) >= minRep` and the hirer's authorized executor; routes payment through the existing policy escrow (max-per-tx, budget, allowed target); emits `AgentHired(hirer, target, paymentId)`. Sub-agent run produces its own proof session; both tie into one composite receipt.
- SDK `hireAgent(hirerAgentId, targetAgentId, task, budget)`.
- UI: "This agent can hire sub-agents" panel; a live graph of who-hired-whom with proof links.
**0G primitive:** Chain escrow + Reputation + ProofMesh + Compute.
**Demo:** Agent A ("Researcher") autonomously hires Agent B ("Summarizer", rep > threshold), pays from a bounded budget; both runs TEE-verified; composite receipt ties the chain; an over-budget or under-rep hire is blocked on-chain.
**No-mock verify:** real reputation read gates a real escrow payment; both agent runs verified via `processResponse`; all txs on chainscan.

## 2.3 Reputation staking + slashing  · P1
**What:** owners stake 0G behind an agent; a provably-flagged policy violation slashes the stake. Makes reputation economically backed and Sybil-resistant (DeFi×AI).
**Build:**
- Contract `ReputationStake.sol` — `stake(agentId) payable`, `unstake(agentId)` (after cooldown), `slash(agentId, bytes32 violationReceipt)` callable only when `ProofMeshReceipts` has a flagged violation with on-chain evidence; slashed funds go to a treasury / the wronged party. Stake weight feeds the reputation tier (staked + proven > proven alone).
- SDK `stakeAgent`, `getStake`, and slashing hooks off `ViolationFlagged`.
- UI: stake badge on the agent card; a slash event visibly drops the tier.
**0G primitive:** Chain (native 0G escrow) + ProofMesh violations.
**Demo:** stake behind an agent → a real flagged violation (evidence CID on Storage) → `slash` executes → tier drops, all on-chain.
**No-mock verify:** real 0G staked, real violation evidence on Storage, real slash tx. Keep v1 slashing arbiter-gated (owner/arbiter), v2 decentralized — state honestly.

## 2.4 Verifiable model provenance (per-model reputation)  · P0 (cheap, high-integrity)
**What:** every receipt records the attested `modelHash` that actually ran, so reputation is per-model and a silent model swap is detectable ("this 5-star record was earned on DeepSeek-V3, verified").
**Build:**
- Add `bytes32 modelHash` (and provider address) to `ProofMeshReceipts.closeSession` / the composite receipt; surface in ProofPass.
- SDK captures the model + provider from `getServiceMetadata` and binds it into the session.
- UI verify page shows the model provenance line.
**0G primitive:** Compute metadata + Chain anchor.
**Demo:** two runs on two models → provenance visible and distinct on the verify page; reputation attributable per-model.
**No-mock verify:** modelHash derived from the real provider metadata + attested run.

## 2.5 Programmable guardrails / "agent constitution" + on-chain violations  · P1
**What:** structured policy (allowed tools, forbidden actions, data scopes, rate limits) hashed into the agent and enforced at runtime; violations flagged on-chain with evidence. The Trust & Safety angle the buildathon lists.
**Build:**
- Define a policy JSON schema; hash → the existing `policyHash` on `NexusAgent` / session. Runtime enforces before each tool call; a breach calls `ProofMeshReceipts.flagViolation(sessionId, type, evidenceCID)`.
- UI: the agent's "constitution" shown on its card; violations visible in its history and penalize reputation.
**0G primitive:** Chain (policyHash + flagViolation) + Storage (evidence).
**Demo:** an agent attempts a forbidden tool → violation flagged on-chain with evidence → reputation penalty.
**No-mock verify:** real policyHash match, real on-chain violation flag with a retrievable evidence CID.

## 2.6 Roadmap-only (say it, don't build it this wave)  · R
- **ZK reputation threshold** — prove `rep > X` without revealing history (privacy-preserving hiring).
- **Streaming TEE checkpoints** — long tasks emit intermediate signed checkpoints anchored to 0G DA.
- **v2 trustless oracle** — re-encryption + settlement signer moves fully into a TEE/ZKP oracle (removes the last v1 trust assumption).
- **Cross-chain proof mirroring** — anchor NEXUS proofs to other chains so the passport is portable everywhere.
These are the Wave 5 / post-buildathon superiority story; building them now risks the deadline.

---

# Part 3 — The superior Wave 3 demo narrative (≤3 min)

1. **(0:00–0:20)** Hook: "When you own an AI agent today you own a receipt, and when it works for you, you take its word. NEXUS proves both — on 0G mainnet."
2. **(0:20–0:50)** Create + run: mint an ERC-7857 agent (encrypted brain on mainnet Storage) → run in Sealed Inference → **tap verify → `processResponse` true, live**. "The chip signed this, not me."
3. **(0:50–1:25)** The futuristic beat — **agent hires agent**: Agent A autonomously hires proven Agent B through reputation-gated policy escrow; show the over-budget hire blocked on-chain. "Agents hiring proven agents, with on-chain guardrails."
4. **(1:25–2:00)** The money-shot — **transfer re-encryption**: sell an agent → brain re-encrypts for the buyer → **seller can no longer decrypt**. Show the cipherRef change on chainscan.
5. **(2:00–2:30)** **ProofPass**: paste a receiptId into the verify-in-30s page → owner, model provenance, policy, payment, reputation — all resolve on-chain, re-verified client-side. "Verify it yourself. No trust required."
6. **(2:30–3:00)** Close: mainnet contract links on screen; "reputation from proofs, not reviews — the trust layer the agent economy is missing." X post + tags.

---

# Part 4 — Build order (respect the sequence)

1. **Harden Part 1 to 100% on mainnet** (deploy + verify 5 contracts; every existing feature reproducible). Nothing advanced until this is green.
2. **P0 advanced:** ProofPass (2.1) + Agent-to-agent hiring (2.2) + Model provenance (2.4) — these three define the "superior" submission and all demo on camera.
3. **P1 advanced (if time):** Reputation staking/slashing (2.3) + Guardrails (2.5).
4. **Evidence:** regenerate `PROOFS.md` via `gather-proofs.ts` so every new feature has a mainnet row.
5. **Roadmap (2.6):** put in the pitch as the Wave 5 / company trajectory — don't build.

**Honest risk flags:** (a) new contract surface (AgentHiring, ReputationStake) means new audit surface — Slither + the `TEST.md` cases before mainnet; (b) agent-to-agent hiring adds a reentrancy/gas path — guard it; (c) don't let staking/slashing economics create a way to lock funds — TTL/cooldown + arbiter escape hatch, tested live; (d) keep every advanced feature behind the same fail-closed + testnet-fallback discipline as the base.
