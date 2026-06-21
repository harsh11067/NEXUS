# NEXUS — Test Plan & Core Checkpoints

> Two goals: (1) catch failure early (gate-checks), (2) make the win *provable* to a judge in 30 seconds. The second is as important as the first — a working product that can't be verified quickly loses to a worse one that can.

---

## 1. Level 0 gate-checks (run before product code)

Each is a tiny standalone script. Green = the primitive is real on your machine. Red = you just saved yourself weeks. **Capture the tx links — they go in the Wave 1 submission.**

| # | Checks | Pass condition |
|---|---|---|
| G1 | ERC-7857 mint on 0G testnet | `tokenId` returned; `ownerOf(tokenId)==you`; `getPersonaRef` returns the CID |
| G2 | Sealed Inference | POST to `router-api.0g.ai/v1/chat/completions` returns output **and** an attestation/signature field; you can fetch the RA report |
| G3 | 0G Storage round-trip | write blob → CID; read CID → identical bytes; works for a ~50KB persona |
| G4 | 0G escrow cycle | `lockFunds` → `submitFulfillment` → `settlePayment`; all three txs visible on `chainscan.0g.ai` |

**If G2's attestation field isn't what the docs imply:** that's your single biggest unknown — resolve it at G2, before anything depends on it. Fallback: if on-chain-anchorable attestation is thinner than expected, anchor the response signature + hashes and verify off-chain (still honest, still scores).

---

## 2. Contract test matrix (per CONTRACTS.md)

Unit (Foundry/Hardhat) → integration (full task flow) → fork test against testnet.

**NexusAgent**
- mint: tokenId increments; cipherRef + policyHash + creator set; `AgentMinted` emitted
- transferFrom / safeTransferFrom: **revert** (ownership only via finalizeTransfer)
- requestTransfer: emits `ReEncryptionRequest` with correct nonce
- finalizeTransfer: rejects bad signature; on valid sig flips owner + updates cipherRef; old ref no longer owner-decryptable; `AgentTransferred` emitted
- clone: new agentId independent; royalty paid to creator; `AgentCloned` emitted
- authorizeUsage: executor can run but not transfer/clone

**ProofMeshReceipts**
- openSession: writes policyHash; returns unique sessionId
- closeSession: stores traceCID + teeSignature; `SessionClosed` emitted
- verifySession: returns valid=true only for closed sessions with matching policy hash
- flagViolation: marks session; triggers a negative reputation delta

**NexusEscrow**
- lockFunds: reverts on merchant ∉ allowedTools; reverts on amount > maxPerTx; reverts on cumulative > dailyBudget; succeeds + locks on valid policy
- submitFulfillment → settlePayment: releases to merchant; `PaymentSettled` emitted
- refund: callable after TTL when unfulfilled; funds return to payer
- dispute path: openDispute → resolveDispute both branches (refund / settle)

**ReputationRegistry**
- updateScore: only callable by authorized contracts (revert from EOA)
- every update carries a receiptHash; `ScoreUpdated` emitted
- tier lookup correct at boundary values (0, 200, 500, 800, negatives)

**CompositeReceiptMinter**
- mints only after SessionClosed (+ PaymentSettled if a payment existed)
- publishes to 0G DA; `CompositeReceiptMinted` emitted with all references

**Integration (the whole flow):** create → run (with one spend) → close → receipt → score up → profile refresh. Assert the composite receipt links resolve on-chain.

---

## 3. The 30-second judge-verification path (THE checkpoint that wins Wave 3)

A judge should verify your core claim without trusting you, in under 30 seconds, from the proof page:

```
Proof Page for Composite Receipt #N
├─ Agent #42  → chainscan link → ownerOf, creator, cipherRef        (identity is real)
├─ Session    → chainscan link → policyHash locked, traceCID         (rules were locked)
├─ TEE proof  → "verify attestation" → model hash + input/output hash (right model ran)
├─ Payment    → chainscan link → locked + settled on 0G Chain        (paid on 0G)
└─ Score      → chainscan link → delta + receiptHash                 (reputation from proof)
```

**Checkpoint test:** hand the proof-page URL to someone who's never seen the project. Time them. If they can't independently confirm "this agent, this model, this payment, these rules" in 30 seconds, the page has failed and you fix it before the wave closes. This single page is worth more in Wave 3 than any feature.

---

## 4. Demo failure-mode mitigations (rehearse these)

Live demos die in predictable ways. Pre-empt each:

| Failure | Mitigation |
|---|---|
| Sealed Inference latency/timeout on camera | Pre-run the inference; demo replays the signed receipt from chain (still real, just not live-waited) |
| Testnet/mainnet RPC flaky | Record a clean run as backup video; have a second RPC endpoint configured |
| Transfer oracle hiccups | The money-shot transfer is pre-validated; show the on-chain result + the re-encrypted blob diff |
| Judge asks "is the tool log hardware-proven?" | ARCHITECTURE §1 answer verbatim: inference is; tool log is anchored app-level; TEE oracle is v2 |
| Judge asks "what stops fake reviews?" | "There are no reviews — score comes only from on-chain receipts; here's the receiptHash" |
| Judge asks "isn't this just Zero Arena/CaaS?" | "They trade / clone agents. We *prove* them. Neither has a verifiable proof + reputation layer." |

---

## 5. Definition-of-Done gates (don't advance until green)

- **Level 0 done** = 4 gate-checks green + tx links saved
- **Level 1 done** = create + run + signed output visible, clean browser
- **Level 2 done** = full prove-loop + profile card + working verify link
- **Level 3 done** = transfer + clone + escrow + proof page, stranger-runnable
- **Wave 3 done** = all of the above on **mainnet**, contracts verified, 30-second proof path flawless
- **Wave 4 done** = ≥1 organic clone and ≥1 organic social post from someone who isn't you

That last gate is the one your history says to watch. Treat "first organic clone by a stranger" as a hard milestone, not a nice-to-have.
