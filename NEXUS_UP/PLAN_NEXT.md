# NEXUS — Plan (Next Feature Layer)

> ## STATUS — EXECUTED 2026-09-01 (mainnet-first)
> - **N1 Identity ✅** — canonical ERC-8004 registries CONFIRMED live on 0G (probed via
>   `eth_getCode`, both networks). NEXUS agent #1 registered as **ERC-8004 #3531152**
>   (mainnet), card on 0G Storage, keccak content-hash + `nexusAgent` link metadata
>   on-chain; reverse lookup from chain events. Adapter isolated in
>   `packages/sdk/src/erc8004.ts` (N-L07).
> - **N1 Validation ✅** — the canonical Validation Registry does NOT exist on any chain
>   yet (spec section under revision), so NEXUS deployed the interface-faithful
>   reference: `ERC8004ValidationRegistry` `0x47FF84cA…38AC` + `NexusTEEValidator`
>   `0x7954e03C…D9ae` (both source-verified on chainscan; galileo parity
>   `0x35F340c8…7cca` / `0x2de7baA7…E687`). Full loop proven live: request → sealed
>   run → signed on-chain response (100/100) → independent re-verify — **including an
>   EXTERNAL agent never minted in NEXUS** (N-A04).
> - **N1 Reputation ✅** — proof-derived score in the CANONICAL Reputation Registry,
>   `feedbackHash` = NEXUS `receiptHash`; owner self-feedback proven blocked.
> - **N2 Replay ✅** — trace schema v2 (messages + params, temp 0/seed 8004, encrypted
>   owner+oracle); `replayReceipt` re-runs on the SAME attested provider: receipt #2
>   replayed **byte-identical + freshly enclave-verified**; legacy receipts degrade
>   gracefully (N-R08). Web: RE-RUN THIS PROOF on `/proof/[id]`.
> - **N3 Card/QR/badge ✅** — `/agent/[id]` public card, `/api/agentcard`, `/api/qr`
>   (same-origin only), `/api/badge/agent/[id]`, embed snippets.
> - **N4 Leaderboard ✅** — `/leaderboard` + `/api/leaderboard`, chain-derived only.
> - **N5 fiat / N6 dispute** — not started (N5 needs a human 0G Pay account decision;
>   both stay pitch/roadmap). Evidence: `evidence/mainnet/*erc8004*`, `*replay`,
>   `*proof-bundle` · `docs/PROOFS.mainnet.md` ERC-8004 sections · `input.md` for the
>   remaining human items.

Extends `PLAN.md` and `WAVE3_SUPERIORITY.md` with the next-generation features that use the newest 0G / agent-standard developments (June–Aug 2026). Order: harden existing → ship Wave 3 superiority set → this layer. Every feature rests on a real, current primitive and deepens the one thesis: **NEXUS is the verifiable trust + validation layer for the agent economy on 0G.**

**The elevated thesis (new):** with ERC-8004 "Trustless Agents" now natively supported on 0G, NEXUS is no longer a standalone app — it is **the TEE validation layer for the trustless-agent economy**, and the only stack that combines encrypted-intelligence *ownership* (ERC-7857) with cross-platform *validation* (ERC-8004), both anchored by 0G Sealed Inference proofs.

Recent 0G/ecosystem facts this layer is built on (verify live before building): 0G added native **ERC-8004** support and reports 400+ integrations; **ERC-8004** = three registries (Identity/Reputation/Validation), Validation explicitly invites **TEE-oracle validators**; 0G co-launched an **AI Agent Dispute standard ("Internet Court")** with 27 firms (Jul 10 2026); 0G Private Computer = 28 models, OpenAI-compatible API, 15M+ TEE attestations, no data retention; **0G Pay** now takes card deposits (Web2 onboarding).

---

## Feature N1 (headline, complex) — ERC-8004 Trustless Agents integration

**What:** make NEXUS agents first-class citizens of the ERC-8004 standard and make NEXUS a **TEE validator** in it.

Three parts, mapped to the three ERC-8004 registries:

1. **Identity Registry.** Register each NEXUS ERC-7857 agent in the ERC-8004 Identity Registry (itself an ERC-721 whose tokenURI points to an "agent card" JSON: name, capabilities, service endpoints (A2A/MCP/web), payment address, content hash). Host the agent card on **0G Storage**; put its content hash on-chain for integrity. Result: a NEXUS agent is now portable and discoverable by any ERC-8004-aware platform — not walled in NEXUS.
2. **Validation Registry (the money integration).** Deploy `NexusTEEValidator.sol`. When an agent (or a client) calls the standard `validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)`, NEXUS's validator re-executes/attests the task in **0G Sealed Inference** and posts a **Validation Response** carrying the TEE attestation + trace root. NEXUS thereby provides the exact "TEE oracle" validation the ERC-8004 spec invites — a service other agent platforms can consume.
3. **Reputation Registry.** Feed NEXUS's proof-only scores into the ERC-8004 Reputation Registry as bounded, receipt-anchored feedback, so a NEXUS agent's verified track record is portable and queryable cross-platform.

**Positioning:** NEXUS = ERC-7857 (own the encrypted intelligence) + ERC-8004 (portable identity/reputation) + 0G TEE (the validation method). The only stack doing all three.

**Build surface:**
- `contracts/src/NexusTEEValidator.sol` — implements the ERC-8004 validator interface; verifies the NEXUS trusted-signer/TEE attestation; writes a Validation Response.
- Adapter `sdk/erc8004.ts` — `registerIdentity(agentId, agentCardCID)`, `requestValidation(agentId, task)`, `postReputation(agentId, score, receiptHash)`; wraps the canonical ERC-8004 registry addresses on 0G (read them live; do not hardcode).
- Agent-card generator → 0G Storage; content hash on-chain.
- UI: an "ERC-8004 verified · portable identity" panel on the agent card, with the cross-platform ID and validation history.

**0G primitive:** Chain (registries) + Compute (TEE validation) + Storage (agent card, trace).
**Priority:** P0 for this layer — it is the timeliest, most fundable differentiator.
**Honest note:** ERC-8004 is Draft; Identity + Reputation registries are audited/deployed on 20+ networks, the Validation Registry is under active revision with the TEE community — confirm the 0G deployment addresses and the current Validation interface live before building.

## Feature N2 (complex) — Deterministic Proof Replay ("re-run the receipt")

**What:** anyone re-executes a past task from its sealed trace and gets the same output, freshly TEE-verified. This is reproducible, auditable AI — and it is the *validation method* NEXUS offers to ERC-8004 (N1.2 calls this).

**Build surface:**
- Trace bundle stores everything needed to reproduce: input, model + `modelHash`, params (temp=0, fixed seed), tool I/O. Anchored on 0G Storage; root on-chain.
- SDK `replayReceipt(receiptId) → { originalOutput, replayOutput, match, teeVerifiedAgain }` — pulls the sealed trace, re-runs through the same attested provider, compares outputs, re-verifies via `processResponse`.
- UI: a "Re-run this proof" button on the verify page → shows the replayed output matches + a fresh TEE check.

**0G primitive:** Compute (deterministic Sealed Inference) + Storage (sealed trace).
**Priority:** P0 — pairs with N1; together they make NEXUS a real validator.
**Honest note:** TEE signatures include a nonce, so signatures won't be byte-identical across runs; the *output* matches and each run is independently verified. Claim "reproducible + re-verified," not "identical signature."

## Feature N3 (easy, standout) — Agent Card + NEXUS-verified badge + QR proof

**What:** every agent gets a public, shareable card (aligned with the ERC-8004 agent-card concept) with a "NEXUS-verified ✓" badge and a QR/short link to its verify page. Every receipt gets a shareable proof card + QR.

**Build surface:** an OG-image generator for the card/receipt; a QR encoding the verify URL; the embeddable badge iframe from ProofPass. No new contract.
**0G primitive:** reads existing on-chain + storage state.
**Priority:** P0 — trivial, viral, and it makes the demo and Wave-4 traction tangible.

## Feature N4 (easy, standout) — Agent Trust Leaderboard

**What:** a public ranking of agents by proof-backed reputation (and ERC-8004 portable reputation), each score drilling into its receipts; filter by verified model, price, policy.

**Build surface:** an indexer over `ScoreUpdated` events + reputation reads; a ranked UI. No new contract.
**Priority:** P1 — drives the "real usage" narrative and is a natural discovery surface for the marketplace.

## Feature N5 (easy, real-users) — Fiat onboarding via 0G Pay

**What:** let non-crypto users fund compute/hires with a card, using 0G Pay's card-deposit path, so a Web2 user can create + run + verify an agent without first acquiring 0G.

**Build surface:** integrate the 0G Pay deposit flow into onboarding; gate the crypto path behind an env flag.
**Priority:** P1 — removes the biggest real-user drop-off; strong for Wave 4/5 traction.
**Honest note:** confirm 0G Pay's current developer surface (it's newer, powered by Khalani) before committing.

## Feature N6 (roadmap) — Align with the "Internet Court" AI Agent Dispute standard

**What:** map NEXUS's existing `openDispute`/`resolveDispute` escrow path onto the emerging 0G-backed agent-dispute standard, so NEXUS disputes are resolvable by the shared arbitration layer.
**Priority:** R — say it in the pitch as the trajectory; confirm the standard's interface before building.

---

## Build order (this layer)
1. **N1 Identity + N3 Agent Card/QR** first (Identity registration produces the card the badge/QR use).
2. **N2 Deterministic Replay** (the validation method).
3. **N1 Validation Registry (`NexusTEEValidator`)** — depends on N2 as its method.
4. **N1 Reputation feed** + **N4 Leaderboard**.
5. **N5 Fiat onboarding** for the traction waves.
6. **N6** stays roadmap.

## Why this wins beyond Wave 3
NEXUS becomes infrastructure the *rest of the agent economy plugs into*: any ERC-8004 agent, on any platform, can request a NEXUS TEE validation and carry a NEXUS-verified reputation. That is a picks-and-shovels position — exactly the 0G investment thesis — and the moat (accumulated portable proof history) compounds with every validated task.
