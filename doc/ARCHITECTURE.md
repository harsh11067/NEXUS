# NEXUS — Architecture & Pipeline

NEXUS is the **verifiable AI-agent trust layer on 0G**. You create an agent, own
it as an **ERC-7857** token whose **encrypted brain lives on 0G Storage**, run it
in **0G Sealed Inference (TEE)**, and **prove every run on-chain**. Reputation
comes from proofs, not reviews.

> Wedge: *Zero Arena trades agents. CaaS clones them. **NEXUS proves them.***

---

## 1. The honest 3-tier trust model (this is the pitch, and the viva armor)

| Layer | Strength | How |
|---|---|---|
| **Inference** | **Hardware-proven** | 0G Sealed Inference TEE signs the response; we verify the enclave signature via `broker.inference.processResponse()`. `verified === true` is the hardware proof. |
| **Tool / trace log** | **App-level, immutably anchored** | The run trace is encrypted, uploaded to 0G Storage, and its hash is anchored on 0G Chain. Not kernel-proven — and we never claim it is. |
| **Transfer** | **Trusted ECDSA signer (v1)** | A re-encryption oracle re-wraps the persona key for the buyer and signs the ownership flip. TEE/ZKP oracle is v2. |

On-chain attestation is **anchored on-chain, verified off-chain** (no on-chain TDX
quote verification). Fulfillment verification is **structural/schema**, not semantic.

---

## 2. System shape (one process, one origin)

```
                          ┌─────────────────────────────────────────────┐
   Browser (MetaMask)     │            Next.js app  (port 3000)          │
   ───────────────────►   │                                              │
   /d/*  cinematic         │  /d/[...slug]   → serves NEXUS_UI districts  │
         districts ◄──────┤  /console       → operator dashboard (React) │
   /api/* JSON   ◄────────┤  /proof/[id]    → verify-in-30s proof page   │
                          │  /api/*         → real backend  ┐            │
                          └─────────────────────────────────┼────────────┘
                                                            │ wraps
                                                  ┌─────────▼──────────┐
                                                  │     @nexus/sdk     │
                                                  │ crypto · storage · │
                                                  │ inference · runtime│
                                                  │ · contracts        │
                                                  └─────────┬──────────┘
                                                            │
              ┌──────────────────────────┬──────────────────┴───────────────┐
              ▼                          ▼                                   ▼
      0G Chain (16602)          0G Storage (testnet)              0G Compute / Sealed
   5 NEXUS contracts          encrypted personas + traces        Inference (TEE, broker)
```

- **One server, one origin.** Districts at `/d/*`, API at `/api/*`, all same-origin
  so CORS is moot and the server holds the operator key.
- **Two write paths:** server-signed (operator key, for demos/ops) **and**
  **browser-wallet-signed** (MetaMask via viem) so a user truly *owns* their agent
  on-chain. The server only does the encryption / 0G Storage / oracle work and
  hands the user calldata to sign (`prepare-mint`, `prepare-clone`, `finalize-transfer`).

---

## 3. The five 0G primitives (load-bearing, not decorative)

1. **0G Chain** — ERC-7857 identity, sessions, escrow, reputation, composite receipts.
2. **0G Storage** — encrypted persona + encrypted run traces (round-tripped, verified).
3. **0G Sealed Inference (TEE)** — the hardware-proven inference.
4. **0G Compute broker ledger** — on-chain micropayments funding each signed request.
5. **The composite receipt** — one object that ties identity + session + (payment) + reputation.

---

## 4. Persona encryption (the "you provably lose access" mechanism)

```
persona {systemPrompt, memory, policy}
  → serialize
  → AES-256-GCM with a random content key
  → content key ECIES-wrapped to TWO recipients:  [ owner pubkey , oracle pubkey ]
  → upload cipher blob to 0G Storage  → rootHash
  → mint(cipherRef=rootHash, policyHash, owner, ownerPubKey)   (ERC-7857)
```

- The **plaintext persona is never on-chain** — only the 0G Storage reference is.
- **Transfer / clone** re-wrap the content key for the *new* holder (the oracle can
  unwrap because it was a recipient) and upload a fresh blob. The old reference is
  replaced, so the seller **provably loses access** — verified end-to-end.

---

## 5. End-to-end pipelines

### Create (L1)
`persona → encrypt → 0G Storage → mint() → agentId` — owner is on-chain, brain is encrypted off-chain.

### Run + Prove (L1 → L2)
```
ownerOf / isAuthorizedExecutor check
  → fetch + decrypt persona
  → Sealed Inference (TEE)  → verified, outputHash, attestation
  → openSession(agentId, policyHash, taskHash)         [locks policy on-chain]
  → (optional) escrow spend: bindPolicy → lockFunds → submitFulfillment → settle
  → encrypt trace → 0G Storage → traceCID
  → closeSession(sessionId, traceCID, attestation)     [anchors proof on-chain]
  → CompositeReceiptMinter.mint(...)                   [one receipt; bumps reputation]
  → ReputationRegistry score updated, carrying the receiptHash
```

### Clone (L3)
`re-encrypt persona for cloner → oracle signs clone digest → clone() pays royalty → new independent agent`; parent's clone count increments.

### Transfer (L3)
```
USER signs requestTransfer(agentId, buyer, buyerPubKey)   [only owner can]
  → oracle re-encrypts persona for buyer → uploads new blob
  → oracle signs the transfer digest (trusted-signer v1)
  → finalizeTransfer(agentId, newRef, signature)          [flips ownership + cipher ref]
```

### Verify (the 30-second proof page)
`/proof/<receiptId>` reads `getReceiptProof()` → **5 independently-checkable facts**
(identity · session · TEE · payment · reputation), each linking to chainscan.

---

## 6. Reputation (proofs, not reviews)

Base **1000**. `−50` violation · `−100` dispute lost · `−200` fraud · `−10` failed ·
`+5` success · `+20` merchant-positive. Tiers: **Unverified · Emerging (0–200) ·
Trusted (200–500) · Verified (500–800) · Elite (800–1000) · Flagged (<0) · Banned
(<−500)**. Every score change **must** carry a receiptHash — the registry rejects
writes that don't.

---

## 7. Repo map

| Path | What |
|---|---|
| `contracts/` | Foundry — 5 contracts, tests (**39/39**), `Deploy.s.sol`, `deployments/galileo.json` |
| `packages/sdk/` | `@nexus/sdk` — crypto · storage · inference · runtime · contracts · config |
| `app/` | Next.js — `/api/*` backend, `/console`, `/proof/[id]`, `/d/[...slug]` district server |
| `NEXUS_UI/` | Cinematic Three.js districts + `nexus-api.js` (the browser ↔ chain bridge + viem wallet) |
| `scripts/` | gate-checks G1–G4 · demo-level1/2 · `deploy.ts` · `gather-proofs.ts` |

See [`PROOF.md`](PROOF.md) for the on-chain evidence, [`SETUP.md`](SETUP.md) to run it.
