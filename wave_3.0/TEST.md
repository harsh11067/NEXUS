# NEXUS — Test & Acceptance Plan

What the system must **do and prove** for Wave 3 and for a real launch. Builds on the existing **39/39 Foundry tests**; adds mainnet real-integration, correctness of the hard cryptographic claims (re-encryption, TEE verify, proof-derived reputation), security, and judge-reproducible acceptance. Five tiers; mocks allowed **only** in Tier 1.

Priorities: ✅ blocks Wave 3 · 🟡 should pass · 🔵 stretch. The mock-vs-real line is explicit: any test touching Chain/Storage/Compute in Tier 2+ must hit the live network — a mocked `processResponse`, faked storage root, or stubbed RPC is a **failed** test.

---

## Tier 1 — Unit (contracts + SDK; mocks allowed here only)

### 1.1 Contracts (`forge test`; keep the 39 green, add mainnet-hardening)
| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| C-01 | NexusAgent `mint` | token owned, personaRef/policyHash/ownerPubKey stored, `AgentMinted` | ✅ |
| C-02 | `transferFrom` / `safeTransferFrom` | revert `TransfersDisabled` | ✅ |
| C-03 | `requestTransfer` by non-owner | revert `NotAgentOwner` | ✅ |
| C-04 | `finalizeTransfer` valid signer | ownership flips, `newCipherRef` stored, `AgentTransferred` | ✅ |
| C-05 | `finalizeTransfer` bad signer | revert `BadSignature` | ✅ |
| C-06 | `finalizeTransfer` replay (same nonce) | revert | ✅ |
| C-07 | digest binds `address(this)`+`block.chainid` (sig from other chain/contract fails) | revert `BadSignature` | ✅ |
| C-08 | `clone` valid signer + royalty | new agent, `cloneCount++`, royalty paid, `AgentCloned` | ✅ |
| C-09 | `clone` royalty too low | revert `RoyaltyTooLow` | ✅ |
| C-10 | ProofMesh `openSession` policy mismatch | revert `PolicyMismatch` | ✅ |
| C-11 | `closeSession` anchors traceCID + teeSignature | `SessionClosed` fields match | ✅ |
| C-12 | `verifySession` returns valid + traceCIDHash | correct | ✅ |
| C-13 | Escrow `lockFunds` over per-tx | revert `OverPerTx` | ✅ |
| C-14 | Escrow over daily budget | revert `OverBudget` | ✅ |
| C-15 | Escrow disallowed merchant | revert `MerchantNotAllowed` | ✅ |
| C-16 | Escrow settle without fulfillment | revert `NotFulfilled` | ✅ |
| C-17 | Escrow `refund` before TTL | revert `TtlNotElapsed`; after TTL refunds | ✅ |
| C-18 | Dispute open → resolve both ways | funds route correctly | ✅ |
| C-19 | Reputation `updateScore` by non-writer | revert `NotWriter` | ✅ |
| C-20 | Reputation write carries receiptHash; tier recomputes | `ScoreUpdated` + tier | ✅ |
| C-21 | Composite `mint` invalid session | revert `SessionNotValid` | ✅ |
| C-22 | Composite `mint` unsettled referenced payment | revert `PaymentNotSettled` | ✅ |
| C-23 | Composite `mint` replay | revert `AlreadyMinted` | ✅ |
| C-24 | Reentrancy on escrow settle/refund (malicious merchant) | no double-spend | ✅ |
| C-25 | Fuzz signer/nonce across all signature paths | only valid signer+nonce passes | 🟡 |
| C-26 | Invariant: escrow balance == Σ locked-unsettled | always holds | 🟡 |

### 1.2 SDK / crypto (vitest)
| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| U-01 | AES-256-GCM persona encrypt/decrypt round-trip | plaintext recovered | ✅ |
| U-02 | ECIES key-wrap for owner pubkey | unwrap == original key | ✅ |
| U-03 | **Proxy re-encryption: after transfer, OLD key fails to decrypt, NEW key succeeds** | old=fail, new=ok | ✅ |
| U-04 | `transferDigest`/`cloneDigest` in SDK == Solidity digest (cross-check vs `cast`) | byte-equal | ✅ |
| U-05 | Receipt-proof assembly (owner/model/policy/payment/repDelta) shape | complete, typed | ✅ |

## Tier 2 — Real-integration (NO MOCKS — live 0G; testnet for parity, mainnet for Wave 3)

### 2.1 Chain
| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| R-01 | `eth_chainId` on both RPCs | testnet matches 16602, mainnet == 16661; build aborts on mismatch | ✅ |
| R-02 | Deploy 5 contracts to **mainnet 16661** `--evm-version cancun` | deployed, `mainnet.json` written, no invalid-opcode | ✅ |
| R-03 | Verify all 5 on chainscan | source visible for each | ✅ |
| R-04 | Real mint → openSession → closeSession → composite → reputation on mainnet | all txs land; reputation moved with receiptHash | ✅ |
| R-05 | Real `requestTransfer` → `finalizeTransfer` on mainnet | ownership flips on-chain; `newCipherRef` changed | ✅ |
| R-06 | Real escrow lock → fulfill → settle on mainnet | merchant paid on-chain | ✅ |
| R-07 | Real escrow TTL refund on mainnet | funds returned | ✅ |
| R-08 | Gas + latency per action recorded | documented, within UX budget | 🟡 |

### 2.2 Storage (real upload/propagation/retrieve)
| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| S-01 | Encrypted persona upload to mainnet turbo indexer → root | non-null 0x+64hex root | ✅ |
| S-02 | Wait 3–5 min, retrieve by root, Merkle-verify, decrypt with owner key | byte-equal plaintext (retry/backoff) | ✅ |
| S-03 | Trace bundle upload + `traceCID` anchored on-chain == uploaded root | equal | ✅ |
| S-04 | Tampered retrieved blob | Merkle verify fails | ✅ |
| S-05 | Fulfillment evidence CID round-trip | retrievable + referenced in escrow | ✅ |

### 2.3 Compute / Sealed Inference (real TEE)
| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| T-01 | Preflight: broker ledger ≥ 3 0G, provider ≥ 1 0G, provider is **TeeML** | passes or aborts with guidance | ✅ |
| T-02 | Real inference returns output + chatID | both present | ✅ |
| T-03 | `processResponse(provider, chatID)` on genuine response | **true** | ✅ |
| T-04 | Tampered response / wrong chatID | false → run anchored as `unverified`, never "verified" | ✅ |
| T-05 | Provider unavailable | fail closed; UI shows "no TEE service — anchored off-chain" (existing behavior) | ✅ |
| T-06 | teeSignature anchored in `closeSession` matches the verified run | consistent | ✅ |
| T-07 | Client (verify page) re-runs verification independently | ✓ shown, matches server | ✅ |

## Tier 3 — End-to-end (real browsers + wallets, live network)
| ID | Scenario | Expect | Pri |
| --- | --- | --- | --- |
| E-01 | Full loop mainnet: connect → create → run (verified) → verify page → reputation tick | all real, all linked on explorer | ✅ |
| E-02 | Transfer money-shot: sell agent → oracle re-encrypts → ownership flips → **seller can no longer decrypt** | provable access loss on screen | ✅ |
| E-03 | Clone: clone agent → royalty to creator → clone count ticks → reputation reflects | correct | ✅ |
| E-04 | Hire w/ escrow: bind policy → lock → fulfill → settle; and an over-limit attempt blocked | pay succeeds; over-limit blocked, no settlement | ✅ |
| E-05 | Verify-in-30s page for a real receipt | owner/model/policy/payment/rep all resolve to on-chain sources | ✅ |
| E-06 | Second external wallet completes the loop unaided | works from live URL, no docs | ✅ |
| E-07 | Reputation cannot be moved without a receipt (attempt direct write) | reverts `NotWriter` | ✅ |
| E-08 | Mainnet outage → testnet fallback via env switch | demo never dark-screens | 🟡 |

## Tier 4 — Judge-reproducible acceptance (Wave 3)
- **A-01** 5 verified contracts on `chainscan.0g.ai` (16661), source visible.
- **A-02** Real mainnet txs for mint, run/closeSession, transfer, escrow settle, reputation update — all linked in `PROOFS.md`.
- **A-03** A published `{provider, chatID}` a judge runs through `processResponse` → true.
- **A-04** A published storage root (persona or trace) that retrieves + Merkle-verifies.
- **A-05** `gather-proofs.ts` regenerates `PROOFS.md` from live chain — hashes are never hand-typed.
- **A-06** ≤3-min demo shows the transfer money-shot + verify-in-30s page + a live mainnet contract link.
- **A-07** Clean-clone reproducibility: README quick-start works; `forge test` 39/39+ green.
- **A-08** Public X post with clip + required tags.

## Tier 5 — Launch readiness (real SaaS)
| ID | Check | Bar | Pri |
| --- | --- | --- | --- |
| L-01 | No-setup judge/user flow from live URL | works without wallet-config docs | ✅ |
| L-02 | ProofPass verify API returns correct `{owner,model,policy,payment,valid}` for any receipt | correct + fast | ✅ |
| L-03 | Reputation integrity: 100 receipts, every score change maps to a real receiptHash | 100% | ✅ |
| L-04 | Re-encryption integrity at scale: 20 transfers, seller access loss every time | 100% | ✅ |
| L-05 | Escrow safety: fuzz merchant/limits; funds never lock (TTL always recovers) | proven | ✅ |
| L-06 | Latency: inference + storage p50/p95 measured; "thinking"/pending states cover it | acceptable p95 | ✅ |
| L-07 | Failure UX: provider down / tx rejected / storage slow | calm messaging + retry, never a stack trace | ✅ |
| L-08 | Security pass: reentrancy, access-control, signature-replay, integer (Slither + manual) | clean | ✅ |
| L-09 | Secrets hygiene: no private keys in browser bundle or logs | verified (grep + build audit) | ✅ |
| L-10 | Instrumentation: agents created, runs verified, transfers, hires, DAU tracked | live dashboard | ✅ |
| L-11 | SDK smoke: `@nexus/sdk` consumer app runs the full loop independently | green | 🟡 |

## Definition of done — Wave 3
Tier 1 all green (≥ 39 + new) · Tier 2 R-01…R-07, S-01…S-05, T-01…T-07 on **mainnet** · Tier 3 E-01…E-07 · Tier 4 A-01…A-08. Tier 5 substantially green for the "real product" claim.

## What this plan refuses to accept as passing
A mocked `processResponse`, a hardcoded storage root, a testnet result labeled "mainnet," a transfer where the seller can still decrypt, a reputation change with no receiptHash, or an escrow path that can lock funds. Each is an explicit failure above.
