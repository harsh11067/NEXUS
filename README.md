<div align="center">

# NEXUS

### The verifiable AI-agent trust layer on **0G**

**Create an agent → own it as an ERC-7857 token whose encrypted brain lives on 0G Storage → run it in 0G Sealed Inference (TEE) → prove every run on-chain.**
Reputation comes from proofs, not reviews.

> **Zero Arena trades agents. CaaS clones them. NEXUS *proves* them.**

**▶ Live: https://nexus-alpha-five-26.vercel.app**

[Architecture](docs/ARCHITECTURE.md) · [On-chain Proof](docs/PROOF.md) · [Setup](docs/SETUP.md) · [Docs](docs/DOCUMENTATION.md)

`0G Galileo testnet · chainId 16602 · ERC-7857 · Sealed Inference TEE · 39/39 contract tests`

</div>

---

## What this is

When you "own" an AI-agent NFT today, you own a *receipt* — a pointer to metadata on
someone else's server. The intelligence never moves, and when an agent does work for
you there's no way to prove it used the model it claimed, stayed in budget, or followed
its own rules. The agent economy is being built on "trust me."

NEXUS replaces "trust me" with "verify it":

- **Identity that IS the intelligence.** ERC-7857 wraps the agent's **encrypted persona**
  on 0G Storage. Ownership transfers **re-encrypt** the brain for the buyer — the seller
  *provably loses access*.
- **Proof, not logs.** Every task runs in **0G Sealed Inference (TEE)** and returns a
  hardware-verified attestation. The proof is issued by the chip, not written by the operator.
- **Reputation that can't be gamed.** Scores are computed from **on-chain proofs** and
  settled payments — every score change carries a receipt hash. No reviews.

---

## Design Pattern

NEXUS establishes a verifiable trust lifecycle for AI agents through a strict cryptographic pipeline:

```
     Agent (ERC-7857) 
            │
            ▼
Encrypted Brain (0G Storage)
            │
            ▼
  Sealed Run (0G Compute TEE)
            │
            ▼
    Trace (0G Storage)
            │
            ▼
Composite Receipt (0G DA)
            │
            ▼
   Reputation (0G Chain)
```

1.  **ERC-7857 Agent Identity**: Every agent is an on-chain ERC-7857 iNFT. It controls its identity, creator royalties, and execution privileges. Vanilla transfers are disabled; ownership transfers can only occur via re-encryption, ensuring the seller provably loses access.
2.  **Encrypted Persona on 0G Storage**: The agent's "brain" (prompt, memory, policy) is encrypted using AES-256-GCM. The encryption key is wrapped to both the owner and the oracle using ECIES. Only the cipher reference (CID) is anchored on-chain.
3.  **0G Sealed Inference Run**: Compute tasks run inside a 0G Compute TEE (Confidential Compute) using broker or router mode. The processor returns the model output along with a hardware-signed attestation.
4.  **Proof/Trace Anchoring**: The agent's runtime monitors and logs tool payloads, inputs, and outputs. This trace log is encrypted and uploaded to 0G Storage, producing an immutable trace CID.
5.  **Composite Receipt**: Once the session is closed and any native 0G escrow payments are settled, a `CompositeReceipt` is minted to 0G DA, binding the session, TEE signature, and escrow details.
6.  **Proof-Based Reputation**: The `ReputationRegistry` updates the agent's score and tier automatically on receipt minting. The score is computed strictly from on-chain receipt hashes—there are no fakeable user reviews.

---

## Live Galileo Testnet Deployments (Originality Proofs)

All contracts are compiled using Foundry and deployed directly to the **0G Galileo Testnet** (Chain ID: `16602`). These addresses are verifiable on the block explorer:

*   **NexusAgent (ERC-7857)**: [`0x8B1BB4B8E6c7c3484FA6DECC360B9FC63dBf2D78`](https://chainscan-galileo.0g.ai/address/0x8B1BB4B8E6c7c3484FA6DECC360B9FC63dBf2D78)
*   **ProofMeshReceipts**: [`0x1bE84724492C94124F166904E54A3F9e289A4814`](https://chainscan-galileo.0g.ai/address/0x1bE84724492C94124F166904E54A3F9e289A4814)
*   **NexusEscrow**: [`0xE85c91123734FEABABF547C5f08b8E433D119BF4`](https://chainscan-galileo.0g.ai/address/0xE85c91123734FEABABF547C5f08b8E433D119BF4)
*   **ReputationRegistry**: [`0xaA2292341aEe457a2dE3f535006A8F47aE5a8625`](https://chainscan-galileo.0g.ai/address/0xaA2292341aEe457a2dE3f535006A8F47aE5a8625)
*   **CompositeReceiptMinter**: [`0xf6e60F3130774051e12C697cc87682293A0FCDc2`](https://chainscan-galileo.0g.ai/address/0xf6e60F3130774051e12C697cc87682293A0FCDc2)

---

## Status — **Levels 0–3 live on testnet** ✅

Everything below ran against live 0G Galileo infrastructure (no mocks). Full tx links in **[docs/PROOF.md](docs/PROOF.md)**.

| Level | What | Proven live |
|---|---|---|
| **L0** | 4 gate-checks (mint · Sealed Inference TEE · 0G Storage · escrow) | ✅ |
| **L1** | Create + own an agent, run a Sealed-Inference task | ✅ 6 mints |
| **L2** | The prove loop: session → trace on 0G Storage → composite receipt → reputation | ✅ 4 receipts |
| **L3** | Clone (royalty) · transfer (re-encryption) · escrow-paid task · proof page | ✅ 3 clones, 1 transfer, 1 escrow settle |

5 contracts deployed · `forge test` **39/39** · `tsc` clean across app + SDK.

---

## Quickstart

```bash
pnpm install
cp .env.example .env          # fill PRIVATE_KEY (funded 0G testnet wallet)
pnpm test:contracts           # 39/39
pnpm dev                      # → http://localhost:3000
```

- `/` — the cinematic NEXUS world (districts)
- `/console` — operator dashboard: create → run → prove, live profile cards
- `/proof/<receiptId>` — **verify-in-30s** proof page (5 on-chain facts)

Reproduce the proofs straight from chain (no key needed):

```bash
npx tsx scripts/gather-proofs.ts
```

---

## Architecture (one screen)

```
Browser (MetaMask) ─► Next.js app (one origin) ─► @nexus/sdk ─► 0G Chain · 0G Storage · 0G Sealed Inference
   /d/*  districts        /api/* real backend       crypto·storage         5 contracts · encrypted brains · TEE
   /console dashboard      /proof/[id] proof page    inference·runtime
```

Two write paths: **server-signed** (operator key) and **browser-wallet-signed** (viem/MetaMask,
so the user truly owns their agent). Full diagram + pipelines in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## The honest trust model (the pitch, and the viva armor)

| Layer | Strength |
|---|---|
| Inference | **Hardware-proven** (Sealed Inference TEE signature) |
| Tool / trace log | **App-level, immutably anchored** on 0G Storage + Chain (never claimed kernel-proven) |
| Transfer | **Trusted ECDSA signer (v1)** → TEE/ZKP oracle (v2) |

No overclaim: no on-chain TDX verification, no semantic fulfillment, testnet for compute.

---

## Docs

All supplementary documentation, plans, specifications, and test configurations are organized inside the `docs/` directory:

*   **Setup & Running**: [docs/SETUP.md](docs/SETUP.md) — Configuration and running guide.
*   **On-chain Proof of Work**: [docs/PROOF.md](docs/PROOF.md) — Active transaction explorer links verifying levels 0–3.
*   **Architecture & Flows**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Multi-layer design and diagrams.
*   **Smart Contract Interfaces**: [docs/CONTRACTS.md](docs/CONTRACTS.md) — Solidity specs and signatures.
*   **Validation Plan**: [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — Matrix validation and TEE report checks.
*   **Level Completion Roadmaps**: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — Scope levels and DoD gates.
*   **Original Technical Concept**: [docs/NEXUS_IDEA.md](docs/NEXUS_IDEA.md) — In-depth overview document.
*   **Wave 1 Submissions Package**: [docs/WAVE1_SUBMISSION.md](docs/WAVE1_SUBMISSION.md) — Copy drafts and shot list.
*   **Auditing Report**: [docs/project_analysis.md](docs/project_analysis.md) — Project audit, bugs, and fallbacks analysis.

---

## Stack

0G Chain (EVM, Foundry) · ERC-7857 · 0G Storage (`@0gfoundation/0g-storage-ts-sdk`) ·
0G Sealed Inference (`@0gfoundation/0g-compute-ts-sdk`, broker mode) · native-0G escrow ·
Next.js 15 · React 19 · viem · Three.js districts.

---

<div align="center">
Built for the <b>0G Bridge by AKINDO</b> buildathon. · <code>#BuildOn0G</code>
</div>
