# NEXUS — Test Plan (Next Features)

> ## RESULTS — 2026-09-01
> **Tier 1 ✅** — contracts: 12 Foundry tests in `test/ERC8004.t.sol` cover
> N-C01…N-C05 (+ chain-binding, direct-response guard, summary math); suite **51/51**.
> SDK: `test/next.test.ts` N-U01…N-U05 (+ sanitize) — **13/13** via `pnpm test:sdk`.
> **Tier 2 ✅ on mainnet** — N-R01 (registries probed live, never hardcoded from docs),
> N-R02/03 (register + card Merkle/hash check), N-R04 (live validationRequest → TEE
> response, `processResponse === true`), N-R05 (**external** agent validated),
> N-R06 (canonical-registry feedback, receipt-anchored, self-feedback blocked),
> N-R07 (replay: byte-identical output + fresh enclave proof), N-R08 (legacy trace
> degrades gracefully). N-R09 (fiat) 🟡 not run — human 0G Pay decision.
> **Tier 3** — N-E01/02/03/05 ✅ (agent card + QR + badge live; validation visible on
> card; web replay; leaderboard reads chain per request). N-E04 ✅ via
> demo:validate-external. N-E06 🟡 (fiat).
> **Tier 4 ✅** — N-A01 (#3531152) · N-A02 (response tx on chainscan) · N-A03
> (`pnpm demo:replay 2`) · N-A04 (external agent #3531171 validated) · N-A05
> (`gather:proofs` emits the ERC-8004 sections; `verify:proofs` re-checks every row).
> **Tier 5** — N-L02 (respond = one-shot + signature-gated; spam requests cost the
> spammer, not NEXUS) · N-L04 (card text sanitized, QR same-origin-only) · N-L05
> (server-side chain reads only) · N-L07 (one adapter module) ✅; N-L01/03 measured
> informally (validator p95 ≈ sealed-run latency; replay 2/2) — formal batch runs
> remain open. Testnet parity: register/request ✅; the answer leg waits on a ~3 0G
> faucet top-up for the testnet compute ledger (see `input.md`).

Cases for the next-feature layer. Same tiers/rules as `TEST.md`: mocks only in Tier 1; every ERC-8004 / Compute / Storage path in Tier 2+ hits the live network. A mocked validation response, a faked agent-card hash, or a stubbed replay is a **failed** test.

Priorities: ✅ blocks the feature · 🟡 should · 🔵 stretch.

---

## Tier 1 — Unit

### ERC-8004 validator (`NexusTEEValidator.sol`, Foundry)
| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| N-C01 | `validationRequest` by non-owner/operator of agentId | revert (spec: MUST be owner/operator) | ✅ |
| N-C02 | Validator posts Validation Response for a valid TEE attestation | response recorded, event emitted | ✅ |
| N-C03 | Validator rejects a bad/forged attestation | no response / rejection recorded | ✅ |
| N-C04 | Response binds agentId + requestHash | mismatch reverts | ✅ |
| N-C05 | Replay of the same validationRequest | idempotent / rejected | 🟡 |
| N-C06 | Reputation feedback write is bounded + receipt-anchored | matches NEXUS receiptHash | ✅ |

### SDK (vitest)
| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| N-U01 | Agent-card JSON schema valid (name, capabilities, endpoints, payment, contentHash) | schema passes | ✅ |
| N-U02 | contentHash(card) == on-chain hash | equal | ✅ |
| N-U03 | Replay comparator: identical inputs → identical output flagged `match=true` | correct | ✅ |
| N-U04 | Replay comparator: tampered trace → `match=false` | correct | ✅ |
| N-U05 | Leaderboard sort matches raw on-chain scores | order correct | ✅ |

## Tier 2 — Real-integration (NO MOCKS — live ERC-8004 registries + 0G)

| ID | Test | Expect | Pri |
| --- | --- | --- | --- |
| N-R01 | Read the canonical ERC-8004 registry addresses live on 0G (don't hardcode) | resolved; Identity/Reputation/Validation present | ✅ |
| N-R02 | Register a NEXUS agent in the live Identity Registry | ERC-8004 tokenId issued; tokenURI → card on 0G Storage | ✅ |
| N-R03 | Retrieve the agent card from Storage, Merkle-verify, hash == on-chain | equal | ✅ |
| N-R04 | Fire a real `validationRequest`; NEXUS validator posts a TEE-attested response | response on-chain; referenced run `processResponse` → true | ✅ |
| N-R05 | Validate an **external** ERC-8004 agent (not minted in NEXUS) | NEXUS still posts a valid TEE validation | ✅ |
| N-R06 | Feed a proof-derived score into the Reputation Registry | bounded feedback on-chain, receipt-anchored | ✅ |
| N-R07 | Deterministic replay of a real receipt end-to-end | replay output == original; fresh `processResponse` → true; same modelHash | ✅ |
| N-R08 | Replay of a receipt whose model is deprecated | graceful degrade + clear message, not a crash | 🟡 |
| N-R09 | 0G Pay card deposit funds a real run | fiat → 0G balance → verified run | 🟡 |

## Tier 3 — End-to-end
| ID | Scenario | Expect | Pri |
| --- | --- | --- | --- |
| N-E01 | Create NEXUS agent → auto-register ERC-8004 identity → card + QR + badge live | all resolve; badge renders | ✅ |
| N-E02 | Client requests validation → NEXUS validates via TEE → response visible on the agent card | end-to-end on mainnet | ✅ |
| N-E03 | "Re-run this proof" from the verify page | replay + re-verify shown live | ✅ |
| N-E04 | Cross-platform: an outside ERC-8004 agent gets NEXUS-validated and shows a NEXUS badge | works, portable | ✅ |
| N-E05 | Leaderboard reflects a new verified run within one refresh | rank updates from chain | ✅ |
| N-E06 | Web2 user: fiat onboard → create → run → verify, no prior crypto | completes unaided | 🟡 |

## Tier 4 — Judge-reproducible acceptance
- **N-A01** A live ERC-8004 Identity tokenId for a NEXUS agent, resolvable on-chain, card on 0G Storage.
- **N-A02** A live `validationRequest` → NEXUS Validation Response tx a judge can open, with the referenced run passing `processResponse`.
- **N-A03** A deterministic replay a judge runs themselves that reproduces + re-verifies.
- **N-A04** An external (non-NEXUS) agent validated by NEXUS — proves it's infrastructure, not a walled garden.
- **N-A05** `gather-proofs.ts --include next` regenerates every row of `PROOF_NEXT.md` from chain.

## Tier 5 — Launch readiness
| ID | Check | Bar | Pri |
| --- | --- | --- | --- |
| N-L01 | Validator latency (request → response) measured; async UX covers it | acceptable p95 | ✅ |
| N-L02 | Validator can't be griefed (spam requests, gas) | rate/gas guarded | ✅ |
| N-L03 | Replay determinism across 20 receipts | 100% output match or graceful degrade | ✅ |
| N-L04 | Agent card / badge XSS + injection safe (user-supplied fields sanitized) | clean | ✅ |
| N-L05 | Leaderboard can't be spoofed (scores read from chain, not client) | verified | ✅ |
| N-L06 | Fiat path: no card/PII stored by NEXUS; deposit ref only | verified | ✅ |
| N-L07 | ERC-8004 interface pinned + adapter isolated (a spec revision changes one file) | isolated | ✅ |

## Definition of done (next layer, Wave 3+)
Tier 1 green · Tier 2 N-R01…N-R07 on mainnet · Tier 3 N-E01…N-E05 · Tier 4 N-A01…N-A05. Fiat (N-R09/N-E06) and replay-degrade (N-R08) are 🟡 for the traction waves.

## Refuses to pass
A mocked validation response, a hardcoded ERC-8004 address, a replay that doesn't actually re-run inference, a leaderboard sorted client-side, or a validator that only works on NEXUS-minted agents (it must validate external agents to be real infrastructure).
