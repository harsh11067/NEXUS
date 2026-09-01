# NEXUS — DIY Checklist (Next Features)

The things only you can do/verify for the next-feature layer. Do these after the base + Wave 3 superiority set are green (`DIY.md`). Order matters.

---

## 1. Confirm the recent-development facts live (they're new and moving)
- [ ] Find the **canonical ERC-8004 registry addresses on 0G** (Identity / Reputation / Validation). Read them from a live source — 0G docs, the ERC-8004 canonical deployment list, or on-chain — **do not hardcode from this doc**. ERC-8004 is Draft; the Validation Registry is under active revision.
- [ ] Confirm the current **Validation Registry interface** (`validationRequest(validatorAddress, agentId, requestURI, requestHash)` and the Validation Response method) against the live contract — the signature may have shifted.
- [ ] Confirm **0G supports ERC-8004 on mainnet 16661** (vs testnet only) so your Wave 3 integration is mainnet-real.
- [ ] Confirm **0G Pay's current developer surface** for card deposits before committing to N5 (it's newer, Khalani-powered).
- [ ] Skim the **"Internet Court" AI Agent Dispute standard** interface if you want N6 in the pitch.

## 2. ERC-8004 registration (you hold the key)
- [ ] Register one NEXUS agent in the live Identity Registry from your wallet; confirm the ERC-8004 tokenId and that its tokenURI resolves to your agent card on 0G Storage.
- [ ] Personally retrieve the agent card and confirm its hash matches the on-chain content hash.

## 3. The validator (the headline — eyeball it)
- [ ] Deploy `NexusTEEValidator` on mainnet; register it as a validator.
- [ ] Fire one real `validationRequest` and confirm NEXUS posts a **Validation Response with a TEE attestation** — open both txs on chainscan.
- [ ] **Validate one EXTERNAL agent** (an ERC-8004 agent not minted in NEXUS). This is the proof it's real infrastructure, not a walled garden — do it with your own eyes and capture the tx.
- [ ] Confirm the referenced run passes `processResponse` → true.

## 4. Deterministic replay (verify it actually re-runs)
- [ ] Run `replayReceipt` on a real receipt; personally confirm the replayed output matches the original and gets a **fresh** TEE verification (not a cached boolean).
- [ ] Test replay on a receipt whose model might be deprecated — confirm it degrades gracefully, not a crash.

## 5. Easy/standout (quick wins, do them)
- [ ] Generate an agent card + QR; scan the QR on your phone and confirm it lands on the live verify page.
- [ ] Render the "NEXUS-verified ✓" badge iframe on a throwaway page and confirm it works off-domain.
- [ ] Open the leaderboard; confirm rankings match on-chain scores and each entry drills into receipts.

## 6. Fiat onboarding (if shipping N5)
- [ ] Do one real card deposit via 0G Pay in a test flow; confirm it converts to a usable 0G balance and funds a real run.
- [ ] Confirm NEXUS stores **no** card/PII — only a deposit reference.

## 7. Security / isolation
- [ ] Sanitize every user-supplied agent-card field (name, endpoints) — the card is public and embeddable; no XSS/injection.
- [ ] Keep the ERC-8004 adapter in **one isolated module** so a spec revision changes one file, not the app.
- [ ] Guard the validator against spam/gas griefing (rate limit, min-stake, or per-request fee).
- [ ] Slither the new contracts; triage every high/medium before mainnet.

## 8. Pitch prep (you present)
- [ ] Rehearse the ERC-8004 line until it's crisp — it's your timeliest flex; judges from 0G know they just shipped ERC-8004 support.
- [ ] Have the external-agent validation and the live replay ready as the two "wow" beats.
- [ ] Update `PROOF_NEXT.md` via `gather-proofs.ts --include next`; confirm every row opens on chainscan.

## Reality check before you commit to this layer
This is a lot. If Wave 3 time is tight, the ranked cut is: **N1 Identity + N1 Validator (external-agent validation) + N2 replay** are the differentiators; **N3 card/QR** is a free win; **N4 leaderboard, N5 fiat, N6 dispute** are traction-wave / roadmap. Do not start N1's validator before base features and replay (N2) are solid — the validator *uses* replay + TEE as its method.
