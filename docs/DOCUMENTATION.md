# NEXUS — Documentation & Progress

> The verifiable AI-agent layer on 0G. Create an agent, own it as an ERC-7857
> token whose encrypted brain lives on 0G Storage, run it in Sealed Inference,
> and prove every run on-chain. Reputation comes from proofs, not reviews.

This document records **what is real**, how it fits together, and what remains.
Status: **~70% of the NEXUS_IDEA brought to working, on-chain reality.**

---

## 1. System map (one product, one server)

```
┌──────────────────────────── http://localhost:3000 ───────────────────────────┐
│  Next.js (one process)                                                        │
│                                                                               │
│   /                → redirects into the World district                        │
│   /d/*             → serves the cinematic NEXUS_UI districts (Three.js)       │
│   /console         → plain operator dashboard (create/run/cards)              │
│   /api/*           → the real backend, wrapping 0g-nexus-sdk                    │
│                                                                               │
│   districts ── window.NexusAPI (NEXUS_UI/nexus-api.js) ──► /api/* ──► chain   │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │
                  0g-nexus-sdk (crypto · storage · inference · runtime · contracts)
                                  │
        0G Galileo testnet (chainId 16602): Chain · Storage · Compute(TEE)
```

Everything is one origin: the districts `fetch` the same server that holds the
operator key and signs transactions. No second service, no CORS in normal use.

## 2. The three layers (all implemented on-chain)

| Layer | Contract | What it does |
|---|---|---|
| **L1 SoulMint** (Identity) | `NexusAgent` (ERC-7857) | mint, encrypted persona ref, **trusted-signer re-encryption transfer**, **clone w/ royalty**, authorizeUsage. Vanilla `transferFrom` disabled. |
| **L2 ProofMesh** (Audit) | `ProofMeshReceipts` | open/close sessions, lock the policy hash, anchor the trace CID + TEE attestation. |
| **L3 ReceiptGuard** (Payments) | `NexusEscrow` | native-0G escrow, policy-bound spend, lock→fulfill→settle, TTL refund, disputes. |
| shared | `ReputationRegistry` | proof-only score writes, every change carries a `receiptHash`. Tiers Unverified→Elite. |
| shared | `CompositeReceiptMinter` | ties a session (+ optional payment) into one receipt, bumps reputation. |

5 contracts, 39 Foundry tests, deployed + verified-by-use on Galileo (addresses in `SETUP.md`).

## 3. What "training an agent" means

Not fine-tuning (out of scope on 0G). A persona = `systemPrompt + memory + policy`.
On create: serialize → **AES-256-GCM** content key → that key **ECIES-wrapped to the
owner AND the re-encryption oracle** → upload to 0G Storage → `mint(cipherRef, policyHash, owner, pubkey)`.
Transfer/clone re-wrap the content key for the new holder **without ever exposing plaintext**,
which is why "the seller provably loses access" is literally true (verified end-to-end).

## 4. One task, all layers (the real flow)

```
runTask(agentId, prompt)
 L1  ownerOf check → fetch cipherRef → download blob → decrypt persona
 L2  openSession(agentId, policyHash, taskHash)            → sessionId on chain
 TEE Sealed Inference (0G Compute) → output + processResponse() TEE verification
 L3  (optional) escrow lock → merchant fulfill → settle    → paymentId on chain
     encrypt trace bundle → 0G Storage → traceCID
 L2  closeSession(sessionId, traceCID, attestation)
 DA  CompositeReceiptMinter.mint(...) → receiptId, reputation += 5 (traced to receiptHash)
```

## 5. District → backend mapping (live)

| District | Wired to | Real action |
|---|---|---|
| **SoulMint** | `POST /api/agents` | persona captured in the forge; final step mints a real ERC-7857 agent, shows agentId + tx |
| **Marketplace** | `/api/agents`, `/run`, `/clone`, `/transfer` | live agent cards/tiers/scores; **Hire** = proven task; **Clone**/**Transfer** = real L3 |
| **Audit** | `/api/receipts`, `/api/network` | real composite receipts, session ids, chainscan link |
| **World / Network** | `/api/network` | live agent count, receipts, block height, chainId |
| **Execution** | `/api/receipts` | feed from real settled payments / proven sessions |
| **Treasury** | `/api/network`, `/api/agents` | feed from real agent/clone/royalty activity |

The cinematic experience (Three.js scenes, the SoulMint forge, motion) is **unchanged** —
only previously-hardcoded numbers now come from chain.

## 6. API reference

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/status` | wallet, balance, deployment, compute readiness |
| GET | `/api/network` | chainId, block, totalAgents, totalReceipts, addresses |
| GET | `/api/agents` | list on-chain agents (cards) |
| POST | `/api/agents` | create + mint an agent from a persona |
| GET | `/api/agents/:id` | one agent card |
| POST | `/api/agents/:id/run` | run a task (`{prompt, prove}`) |
| POST | `/api/agents/:id/clone` | clone (royalty + re-encryption) |
| POST | `/api/agents/:id/transfer` | re-encryption transfer (ownership flip) |
| GET | `/api/receipts` | composite receipts (proof trail) |

## 7. Honest trust model (viva armor)

- **Inference** is hardware-proven: 0G Sealed Inference signs in a TEE; we call
  `processResponse()` to verify the enclave signature independently.
- **Tool/trace log** is application-level, immutably anchored on 0G Storage + 0G Chain (we
  do **not** claim kernel-level completeness — the old eBPF overreach is cut).
- **Re-encryption transfer** uses a **trusted ECDSA signer (v1)**; a TEE/ZKP oracle is the v2 upgrade.
- **On-chain attestation** is anchored, **verified off-chain** (no on-chain TDX quote verification).

## 8. Proven on live testnet

- Level 0: G1 mint · G2 Sealed Inference **TEE-VERIFIED** · G3 storage round-trip · G4 escrow cycle
- Level 1: create + run (signed output)
- Level 2: full prove-loop → composite receipt #1 → reputation Emerging
- Level 3: **clone #5→#6 executed via the live API** (royalty + re-encryption); transfer + escrow routes live

## 9. The remaining ~30% (explicitly not done yet)

- **Per-user wallets** in the browser (wagmi/viem connect). Today the server signs with one
  operator key — a shared-auth/wallet system is the next foundation.
- **Transfer in the UI handing the agent to a chosen buyer** (currently an ephemeral buyer for the demo).
- **Escrow-paid tasks in the UI** (the runtime supports a spend step; the districts don't expose a merchant flow yet).
- **Marketplace browse/search, categories, pagination** beyond the featured 3 slots.
- **Treasury** is the least backend-mapped district (live feed only; no real vault logic — out of scope per BUILD_PLAN).
- **Dispute/refund UIs**, notifications, activity feed, global search (the shared systems in the brief).
- **Mainnet deploy + contract verification** (Wave 3), and the TEE/ZKP re-encryption oracle (v2).

## 10. Repo layout

```
contracts/   Foundry — 5 contracts, tests, deploy script
packages/sdk/ TypeScript SDK — crypto, storage, inference, runtime, contracts
scripts/     gate-checks G1–G4, level demos, deploy.ts, serve-ui.mjs
app/         Next.js — districts (/d/*), API (/api/*), console (/console)
NEXUS_UI/    the cinematic districts + nexus-api.js client + 3D engine
```
