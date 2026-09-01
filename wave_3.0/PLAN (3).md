# NEXUS — Master Plan (Wave 3 → real SaaS)

**NEXUS is the verifiable trust layer for the AI-agent economy on 0G.** Create an agent → own it as an ERC-7857 token whose encrypted brain lives on 0G Storage → run it in 0G Sealed Inference (TEE) → every task emits an on-chain proof → reputation is computed from proofs, not reviews. This document is the specific, ambitious, end-to-end plan: what Wave 3 must ship, and how NEXUS becomes a real company after the buildathon. Written so a coding agent (Fable / Opus / Codex) can execute each phase without further scoping.

---

## 0. Where NEXUS already is (verified from the repo, not assumed)

- **5 contracts live on 0G Galileo testnet (chainId 16602)**, real addresses in `contracts/deployments/galileo.json`, real proof txs in `docs/PROOF.md`, **39/39 Foundry tests passing**.
- Real primitives, not stubs: ERC-7857 re-encryption transfer (`requestTransfer`/`finalizeTransfer` with ECDSA verify), clone-with-royalty, policy-bound escrow (`bindPolicy`/`lockFunds`/`settlePayment`/`refund`/dispute), TEE-signed proof sessions (`openSession`/`closeSession` anchoring `traceCID` + `teeSignature`), proof-only reputation writes (`updateScore` carries a `receiptHash`).
- Live product: `https://nexus-alpha-five-26.vercel.app`, cinematic district UI, operator console, proof pages, Next.js API routes for the full loop.
- An honestly-stated trust model already in `docs/PROOF.md` (inference hardware-proven; traces anchored not kernel-proven; v1 trusted ECDSA signer → v2 TEE/ZKP).

**Strategic read (from auditing the last winners):** the bar that won prior 0G waves was **mainnet + verified contracts + live product + evidence + demo + marketing** — not cryptographic depth (the winning marketplace used plain ERC721 and stubbed compute). NEXUS is already deeper on tech. **Wave 3 is therefore a packaging, mainnet-deployment, and proof-legibility game.** Do not add tech risk; make the existing depth mainnet-real and judge-reproducible.

## 1. Wave 3 objective (the 50% that decides this wave)

> **Ship NEXUS as mainnet-ready trust infrastructure: all 5 contracts deployed + verified on 0G Aristotle mainnet (16661), the full loop running on the real 0G stack, and every claim reproducible from an evidence index.**

Rubric mapping — Mainnet Integration Depth **50%** · Technical Quality **30%** · Documentation & Demo **20%**:

| Wave 3 rubric target | NEXUS deliverable | Proof surface |
| --- | --- | --- |
| Mainnet integration depth (50%) | 5 verified contracts on 16661; real mint/run/transfer/escrow/reputation txs on mainnet; encrypted personas + traces on mainnet 0G Storage; Sealed Inference verified via `processResponse` | `PROOFS.md` evidence index, chainscan links |
| Technical quality (30%) | 39/39 tests green + new mainnet integration tests; re-encryption correctness (seller provably loses access); reentrancy/replay/policy enforcement; Slither clean | `TEST.md` Tiers 1–2 |
| Docs & demo (20%) | Clean-clone reproducibility; ≤3-min demo hitting the transfer money-shot + verify-in-30s page; architecture + contracts docs | `CONTRACTS.md`, demo runbook |

**Definition of done for Wave 3:** a stranger can open the live app, watch (or reproduce) a real mainnet agent get created, run with a TEE-verified proof, transfer with a brain re-encryption, and earn reputation from that proof — and every one of those maps to a mainnet explorer link in `PROOFS.md`.

## 2. Wave 3 build phases (execute in order)

### Phase A — Mainnet deploy + verify (the non-negotiable core)
1. Fund a mainnet key (~0.05–0.1 0G) — see `DIY.md`.
2. ⚡ Confirm mainnet chainId via `cast chain-id --rpc-url https://evmrpc.0g.ai` → must be `16661`. Never trust a doc over the live RPC (0G's own docs disagree on testnet ids; mainnet is 16661).
3. `foundry.toml`: add `og_mainnet` RPC + `evm_version = "cancun"`. Deploy all 5 via `script/Deploy.s.sol --rpc-url https://evmrpc.0g.ai --broadcast`.
4. Write `contracts/deployments/mainnet.json` (mirror the galileo.json shape).
5. Verify all 5 on chainscan (`/open/api`), source visible.
6. Wire the app to mainnet behind an env switch (`NEXT_PUBLIC_USE_MAINNET=true`), keep testnet as fallback.

### Phase B — Real 0G stack on mainnet (depth)
1. **Storage:** switch indexer to mainnet turbo `https://indexer-storage-turbo.0g.ai`; Flow auto-discovered (don't hardcode). Encrypted persona + trace round-trip on mainnet (`TEST.md` S-tests). Note 3–5 min propagation.
2. **Compute (Sealed Inference):** fund the broker ledger (≥ 3 0G; ≥ 1 0G per provider), assert the provider is **TeeML** at preflight, run real inference, verify with `processResponse` → `true`. If a mainnet TEE provider is unavailable, document the compute network used and fail closed rather than faking verification.
3. **DA:** anchor the composite-receipt log root (already modeled by `CompositeReceiptMinter`).

### Phase C — The evidence index (what actually wins)
1. Build `scripts/gather-proofs.ts` to pull live mainnet state → generate `PROOFS.md` tables automatically (never hand-type hashes).
2. Produce the AgentAllowance-style **claim → artifact → what-to-inspect → reproduce-command** table for every guarantee.
3. Record append-only run artifacts (JSON) for each demo scenario; never overwrite.

### Phase D — The product moment + demo
1. **Verify-in-30-seconds page** (`/proof/[receiptId]`): who owned it, what model ran, what it paid, what rules were locked, whether reputation was earned — each field links to its on-chain source and re-runs `processResponse` client-side.
2. **Reputation-gated "hire this agent"** marketplace action goes live on mainnet.
3. ≤3-min demo: create → run → **transfer money-shot (seller loses access)** → verify page → reputation tick. Mainnet contract links on screen.
4. Mandatory public X post with the clip + required tags.

## 3. The real SaaS future (post-buildathon ambition)

NEXUS is not a demo genre — it's **"Stripe-for-agent-trust": the verification and reputation layer every agent platform needs but none wants to build.** The company arc:

### 3.1 Product surface → platform
- **NEXUS SDK (npm).** Publish `0g-nexus-sdk` (`createAgent`, `runTask`, `getReceiptProof`, `transferAgent`, `cloneAgent`, `verifyReceipt`). This is how other builders integrate trust without touching 0G plumbing — the 0G-Forge/AgentAllowance "publish an SDK" signal, but for verifiable agent identity.
- **ProofPass API.** A hosted `verify(receiptId) → {owner, model, policy, payment, repDelta, valid}` endpoint + an embeddable badge. Any marketplace, agent host, or DAO can drop a "NEXUS-verified" badge next to an agent and let users check the proof in one click.
- **Agent Passport.** A portable, cross-platform identity: an agent's ERC-7857 token + its proof history + reputation, verifiable anywhere. Agents carry their track record between platforms.

### 3.2 The three-sided market
- **Agent creators** mint + earn clone royalties + build verifiable reputation.
- **Agent hirers** (users, DAOs, other agents) filter by proof-backed reputation and pay through policy-bound escrow (spend limits, allowed tools, budgets enforced on-chain).
- **Platforms** embed ProofPass to make their agents trustworthy without building a trust stack.

### 3.3 Business model
- **Protocol fee** on escrowed hires (like the 2% pattern the winners use), on-chain and transparent.
- **Creator royalties** on clones (already in `NexusAgent`).
- **ProofPass API** metered/subscription for platforms embedding verification at scale.
- **Reputation-as-data**: opt-in, privacy-preserving agent reputation feeds for marketplaces.

### 3.4 Moat
The moat is **accumulated, portable proof history** — the longer an agent runs verifiably on NEXUS, the more valuable its passport, and that history can't be faked or ported by a copycat because every entry is a hardware attestation anchored on 0G. Reviews can be bought; proof history cannot.

### 3.5 Roadmap milestones
1. **Decentralize the signer** — v1 trusted ECDSA oracle → v2 TEE-attested / ZKP re-encryption oracle (removes the last trust assumption; the honest gap called out in `PROOFS.md`).
2. **Multi-model, multi-provider** Sealed Inference with per-run model attestation.
3. **Agent-to-agent hiring** — agents autonomously hiring proven sub-agents through policy escrow (x402-style), the AgentAllowance pattern applied to NEXUS reputation.
4. **Cross-chain proof anchoring** and a public reputation explorer.
5. **Apollo / investment** — the buildathon's BD path; NEXUS as trust infrastructure is exactly the "invest in the picks-and-shovels" thesis.

## 4. Cross-cutting directives
- **No mocks on the mainnet paths.** Every Compute/Storage/Chain claim in Wave 3 hits the real network; `TEST.md` Tier 2 fails a mock.
- **Never hand-type a hash.** `gather-proofs.ts` is the single source of `PROOFS.md`.
- **Fail closed on verification** — a run whose `processResponse` isn't `true` is labeled `unverified`, never silently "verified" (the repo already does this correctly; keep it).
- **Funds never lock** — escrow TTL refund + dispute path tested live every wave.
- **State the trust model proactively** in the demo — it's a scoring asset, not a liability; winners reward teams that know exactly where guarantees start and stop.
- **Keep testnet as fallback** behind the env switch so a mainnet outage never dark-screens the judge demo.
