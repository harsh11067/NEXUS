# NEXUS — Architecture

> Revised: no eBPF, native 0G escrow, trusted-signer oracle. This is the buildable architecture, not the aspirational one.

---

## 1. The honest trust model (read this first — it's your viva armor)

NEXUS makes three *different* kinds of guarantee. Conflating them is how you lose a viva. Keep them separate and you have an answer for every hard question.

| Claim | Guarantee strength | How it's proven | What it does NOT prove |
|---|---|---|---|
| "This model ran on this input and produced this output" | **Hardware (strongest)** | 0G Sealed Inference TEE signs the response with an enclave-born key | What the agent's runtime did *around* the inference |
| "These tools were called with these payloads/costs" | **Application-level, immutably anchored** | Runtime assembles a tool-call log → encrypted → 0G Storage → hash on 0G Chain | That the log is complete at the kernel level (we don't claim this — that was the eBPF overreach) |
| "Ownership transferred and the seller lost access" | **Trusted-signer (v1) → cryptographic (v2)** | Off-chain re-encryption service signs with an ECDSA key the contract verifies | That the signer itself is trustless (v1 trusts the signer; v2 makes it TEE/ZKP) |

**The line that wins the viva:** *"The inference is hardware-proven. The tool log is application-level and immutably anchored. The re-encryption uses a trusted signer today, with a TEE/ZKP oracle as the v2 upgrade — the same pattern Zero Arena ships with."* No overclaim, clear roadmap, honest about boundaries. Judges reward this far more than a claim that falls apart on one question.

---

## 2. System overview

```
                          ┌──────────────────────────────────────┐
                          │            NEXUS PRODUCT              │
                          │   "create → own → prove → (hire)"     │
                          └──────────────────────────────────────┘

  L1 — SoulMint (Identity)      L2 — ProofMesh (Audit)      L3 — ReceiptGuard (Payments)
  ───────────────────────       ──────────────────────       ──────────────────────────
  ERC-7857 token                Session open/close           NexusEscrow on 0G Chain
  Encrypted persona → Storage   TEE attestation              Policy-bound spend
  Re-encryption transfer        Tool-call trace → Storage    Fulfillment check (schema)
  Clone (+ royalty)             Composite receipt            Auto-refund on TTL
            │                            │                            │
            └────────────────────────────┼────────────────────────────┘
                                         ▼
                       COMPOSITE RECEIPT  (agentId + sessionId + paymentId
                       + traceCID + teeSignature)  →  published to 0G DA
                                         │
                                         ▼
                       REPUTATION REGISTRY (0G Chain) — score from proofs, not votes
                                         │
                                         ▼
                       PUBLIC AGENT PROFILE CARD  (the thing that goes viral)
```

---

## 3. 0G primitive mapping

| 0G Primitive | Used by | What it does here | Production status |
|---|---|---|---|
| **0G Chain** | L1/L2/L3 | All contracts: token, receipts, escrow, reputation | Live (Aristotle mainnet) |
| **ERC-7857** | L1 | Token standard wrapping identity + encrypted transfer + clone | Reference impl exists; pre-audit |
| **0G Storage** | L1/L2/L3 | Encrypted personas, trace bundles, fulfillment evidence | Live, SDK available |
| **0G Compute (Sealed Inference)** | L2 | TEE inference, hardware-signed output + attestation | **Live on mainnet** |
| **0G DA** | shared | Append-only composite-receipt log | Live |

Five 0G primitives, each load-bearing in a way a judge can verify on-chain. This is the integration-depth story for Wave 3 (50% weight) — and unlike the old 6-primitive version, none of the five is architecturally fragile.

---

## 4. What "training an agent" means here

Not model fine-tuning (that's testnet-only on 0G — explicitly out of scope). An agent is a **persona + memory + policy**:

```
AgentPersona {
  systemPrompt:  string        // the agent's character + instructions
  memory:        Entry[]       // episodic context, domain knowledge
  policy: {
    dailyBudget:   uint         // e.g. 5 USDC (6 decimals)
    allowedTools:  bytes32[]    // keccak256(domain) allowlist
    maxPerTx:      uint
    maxTaskTTL:    uint         // seconds
    bannedActions: bytes32[]
  }
}
```

Lifecycle: serialize → AES-256-GCM encrypt (key wrapped to owner pubkey) → upload to 0G Storage → get CID → `NexusAgent.mint(CID, policyHash, owner, ownerPubKey)` → `tokenId = agentId`.

---

## 5. Complete task flow (your revised flow, formalized)

```
nexus.runTask(agentId, prompt, budget)

L1  IDENTITY
    NexusAgent.ownerOf(agentId) == caller        ✓ (else revert)
    cipherRef = NexusAgent.getPersonaRef(agentId)
    blob = 0gStorage.fetch(cipherRef)
    persona = decrypt(blob, ownerKey)            // AgentPersona JSON
    policyHash = NexusAgent.getPolicyHash(agentId)

L2  SESSION OPEN
    sessionId = ProofMeshReceipts.openSession(agentId, policyHash, taskHash)
    → policyHash written to 0G Chain (locks the rules for this run)
    runtime starts tool-call logger (application-level)

TEE INFERENCE  (0G Compute, Sealed Inference)
    POST router-api.0g.ai/v1/chat/completions  { model, persona+prompt }
    inside enclave: model loads, prompt decrypts, inference runs
    returns: { output, teeSignature, attestationRef }   // hardware-signed

L3  PAYMENT  (only if the task spends)
    NexusEscrow.lockFunds(agentId, sessionId, merchant, amount)
      policy check: merchant ∈ allowedTools && amount ≤ maxPerTx && spend ≤ dailyBudget
      → funds locked on 0G Chain (revert if policy fails — even if agent "signed")
    merchant delivers → submitFulfillment(paymentId, evidenceCID)
    fulfillment check (SCOPED: schema/hash match, not general semantics)
      pass → settlePayment(paymentId)   // release
      fail/ghost → auto-refund after TTL

L2  SESSION CLOSE
    traceBundle = { toolCalls[], inputHash, outputHash, modelHash, anomalyFlags }
    encrypt → 0G Storage → traceCID
    ProofMeshReceipts.closeSession(sessionId, traceCID, teeSignature)

DA  COMPOSITE RECEIPT
    CompositeReceipt { agentId, sessionId, paymentId, traceCID, fulfillmentCID, teeSignature, cost, ts }
    → publish to 0G DA (append-only)
    ReputationRegistry.updateScore(agentId, +delta, receiptHash)
    profile card refreshes

✓   RESULT + ONE-CLICK PROOF
    output + link to composite receipt on chainscan.0g.ai
    "Verify in 30s: who owned it, what model ran, what it paid, whether it obeyed its rules."
```

**Scoping note on fulfillment verification (constraint, not feature):** general "did the merchant deliver what was promised?" is AI-hard and unsolved. For Wave 3, the fulfillment check is **bounded**: does the evidence match the requested schema, is it non-empty, does its hash match a committed expectation? Frame it as "structural fulfillment verification," not "semantic." Anything more is a v2 research item. Do not demo a claim you can't defend.

---

## 6. The transfer sequence (the demo's money shot)

```
Seller: NexusAgent.requestTransfer(agentId, buyer, buyerPubKey)
   → emit ReEncryptionRequest(agentId, oldCipherRef, buyerPubKey, nonce)

Off-chain re-encryption service (you run it, trusted signer):
   - fetch oldCipherRef blob from 0G Storage
   - re-wrap the AES key under buyerPubKey   (never exposes plaintext key to chain)
   - store new blob → 0G Storage → newCipherRef
   - sign(agentId, newCipherRef, keccak(buyerPubKey), nonce)  with signer key

   → NexusAgent.finalizeTransfer(agentId, newCipherRef, signature)
      require ecrecover(...) == trustedSigner    // the v1 trust assumption, stated openly
      ownerOf(agentId) = buyer
      personaCipherRef(agentId) = newCipherRef
      // old cipherRef is now undecryptable by seller → seller provably lost access
```

Vanilla `transferFrom` is **disabled** (per ERC-7857 / Zero Arena pattern) — ownership only moves through `finalizeTransfer`. That's what makes "you actually own the intelligence" true instead of marketing.

---

## 7. The clone loop (the growth engine)

```
NexusAgent.clone(agentId, to, sealedKey, signature) → newAgentId
   - new token, new agentId, independent memory
   - same starting persona, re-encrypted for the cloner
   - royalty to original creator on clone
   - clone count is public on the profile card → social proof → more clones
```

Each clone is a share. The profile card surfaces clone count + reputation tier — the two numbers that make people want one. This is how distribution becomes a product feature instead of a marketing task.

---

## 8. What we explicitly do NOT build (see BUILD_PLAN constraints)

eBPF / kernel monitoring · model fine-tuning · TEE/ZKP re-encryption oracle (v1 uses trusted signer) · on-chain TDX quote verification (verify off-chain, anchor on-chain) · token/bonding curve · multi-chain · staking/slashing · secondary-royalty engine beyond a flat clone royalty · general semantic fulfillment verification · multi-agent orchestration.
