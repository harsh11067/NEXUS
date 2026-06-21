# NEXUS

### The verifiable AI agent layer: own your agent, prove what it did, trust its reputation.

> **Zero Arena trades agents. CaaS clones them. NEXUS proves them.**

NEXUS is the trust layer the agent economy is missing. You create an AI agent, you *own* it as an on-chain asset whose intelligence actually transfers with the token (not a URL pointer), every task it runs produces a hardware-signed proof, and its reputation is computed from those proofs — not from reviews anyone can fake. Then, once an agent has a track record worth trusting, you can hire it or sell it.

---

## The one-liner (submission format, 30 words)

> NEXUS lets you create, own, and prove AI agents. Every agent is an ERC-7857 token; every task it runs is cryptographically verifiable on 0G. Reputation you can trust, not reviews you can't.

---

## Why this exists

When you "own" an AI agent NFT today, you own a receipt — a pointer to metadata sitting on someone else's server. The intelligence never moves. And when an agent does work for you, you have no way to prove it used the model it claimed, stayed inside its budget, or followed its own rules. The agent economy is being built on "trust me."

NEXUS replaces "trust me" with "verify it":

- **Identity that IS the intelligence.** ERC-7857 (Agentic ID) wraps the agent's encrypted persona on 0G Storage. Ownership transfers re-encrypt the intelligence for the buyer; the seller provably loses access.
- **Proof, not logs.** Every task runs in 0G's Sealed Inference TEE and returns a hardware-signed attestation: which model ran, on what input, producing what output. The proof is issued by the chip, not written by the operator.
- **Reputation that can't be gamed.** Scores are computed from on-chain proofs and settled payments — every score change carries a receipt hash. No user votes, no fakeable reviews.

---

## The wedge (why we're not Zero Arena or CaaS)

The ERC-7857 space on 0G is real and occupied — which is *validation*, not a problem, as long as our wedge is sharp:

| Project | What it does | What it doesn't |
|---|---|---|
| **Zero Arena** | ERC-7857 trading agents competing on locked datasets | Not a general proof/reputation layer; trading-specific |
| **CaaS** | ERC-7857 agents that clone + run across chat channels (World ID, x402, WLD) | No verifiable proof-of-work or trust scoring; payments are off-0G |
| **NEXUS** | **The verifiable proof + reputation layer for *any* agent** | — |

Cloning exists elsewhere. **Provable trust does not.** That's the wedge.

---

## What's in this repo (planning package)

| File | What it is |
|---|---|
| `README.md` | This file — the front door |
| `ARCHITECTURE.md` | Revised architecture, layers, task flow, trust boundaries, 0G mapping |
| `CONTRACTS.md` | Smart-contract specs (interfaces, state, events) + trusted-signer oracle design |
| `BUILD_PLAN.md` | Level-wise completion plan + wave roadmap + **hard win-protection constraints** |
| `TEST_PLAN.md` | Gate-checks, test matrix, the 30-second judge-verification path, demo failure mitigations |
| `WAVE1_SUBMISSION.md` | The actual Wave 1 submission: copy, X post, demo shot list |

---

## Stack

- **Chain:** 0G Chain (Aristotle Mainnet) — EVM, deploy via Hardhat/Foundry
- **Identity:** ERC-7857 (Agentic ID / iNFT), reference implementation from 0G docs
- **Inference:** 0G Compute Sealed Inference — OpenAI-compatible at `router-api.0g.ai/v1`, models incl. GLM-5 / DeepSeek, TEE-signed responses
- **Storage:** 0G Storage (`@0glabs/0g-ts-sdk`) — encrypted personas, trace bundles, fulfillment evidence
- **DA:** 0G DA — append-only composite-receipt log
- **Payments:** native **NexusEscrow.sol on 0G Chain** (NOT x402-on-Base — settlement must touch 0G for integration-depth scoring)
- **Re-encryption oracle:** trusted-ECDSA signer (v1) → TEE/ZKP oracle (v2 roadmap)
- **Frontend:** Next.js + wagmi/viem + 0G Storage SDK

---

## Status

Wave 1 (scoping). Build target sequence in `BUILD_PLAN.md`. Live testnet de-risking proofs in `WAVE1_SUBMISSION.md`.

*0G Bridge by AKINDO — 10-week, 5-wave buildathon. Demo Day around Token2049 Singapore, Oct 2026.*
