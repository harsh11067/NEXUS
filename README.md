<div align="center">

# NEXUS

### The verifiable AI-agent trust layer on **0G**

**Create an agent → own it as an ERC-7857 token whose encrypted brain lives on 0G Storage → run it in 0G Sealed Inference (TEE) → prove every run on-chain.**
Reputation comes from proofs, not reviews.

> **Zero Arena trades agents. CaaS clones them. NEXUS *proves* them.**

**▶ Live: https://nexus-alpha-five-26.vercel.app**

[Architecture](ARCHITECTURE.md) · [On-chain Proof](PROOF.md) · [Setup](SETUP.md) · [Docs](DOCUMENTATION.md)

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

## Status — **Levels 0–3 live on testnet** ✅

Everything below ran against live 0G Galileo infrastructure (no mocks). Full tx links in **[PROOF.md](PROOF.md)**.

| Level | What | Proven live |
|---|---|---|
| **L0** | 4 gate-checks (mint · Sealed Inference TEE · 0G Storage · escrow) | ✅ |
| **L1** | Create + own an agent, run a Sealed-Inference task | ✅ 6 mints |
| **L2** | The prove loop: session → trace on 0G Storage → composite receipt → reputation | ✅ 4 receipts |
| **L3** | Clone (royalty) · transfer (re-encryption) · escrow-paid task · proof page | ✅ 3 clones, 1 transfer, 1 escrow settle |

5 contracts deployed · `forge test` **39/39** · `tsc` clean across app + SDK.

## Quickstart

```bash
pnpm install
cp .env.example .env          # fill PRIVATE_KEY (funded 0G testnet wallet) + addresses
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

## Architecture (one screen)

```
Browser (MetaMask) ─► Next.js app (one origin) ─► @nexus/sdk ─► 0G Chain · 0G Storage · 0G Sealed Inference
   /d/*  districts        /api/* real backend       crypto·storage         5 contracts · encrypted brains · TEE
   /console dashboard      /proof/[id] proof page    inference·runtime
```

Two write paths: **server-signed** (operator key) and **browser-wallet-signed** (viem/MetaMask,
so the user truly owns their agent). Full diagram + pipelines in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## The honest trust model (the pitch, and the viva armor)

| Layer | Strength |
|---|---|
| Inference | **Hardware-proven** (Sealed Inference TEE signature) |
| Tool / trace log | **App-level, immutably anchored** on 0G Storage + Chain (never claimed kernel-proven) |
| Transfer | **Trusted ECDSA signer (v1)** → TEE/ZKP oracle (v2) |

No overclaim: no on-chain TDX verification, no semantic fulfillment, testnet for compute.

## Stack

0G Chain (EVM, Foundry) · ERC-7857 · 0G Storage (`@0gfoundation/0g-storage-ts-sdk`) ·
0G Sealed Inference (`@0gfoundation/0g-compute-ts-sdk`, broker mode) · native-0G escrow ·
Next.js 15 · React 19 · viem · Three.js districts.

---

<div align="center">
Built for the <b>0G Bridge by AKINDO</b> buildathon. · <code>#BuildOn0G</code>
</div>
