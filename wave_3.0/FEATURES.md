# NEXUS — Features

What NEXUS does today (shipped + on-chain), what Wave 3 adds, and the ambitious feature set that turns it into a real SaaS. Each roadmap feature ties to `PLAN.md` and names the 0G primitive it rests on. Ordered by build priority.

> **STATUS (2026-09-01):** A.1–8 ✅ live on BOTH networks (mainnet 16661 primary) ·
> B.9–12 ✅ executed (see `docs/PROOFS.mainnet.md`) · C.14 **ProofPass** ✅ live
> (`/api/verify`, badge, `/proof/[id]`) · C.15 **Agent Passport** ✅ delivered via the
> ERC-8004 layer (canonical-registry identity + portable proof-anchored reputation +
> TEE validations — see `NEXUS_UP/PLAN_NEXT.md` N1) · C.16 **Reputation explorer** ✅
> live as `/leaderboard` + `/agent/[id]` · C.13 **npm publish** ✅ shipped as
> `0g-nexus-sdk` v0.1.0 (Apache-2.0) — https://www.npmjs.com/package/0g-nexus-sdk ·
> C.17–20 roadmap (17 is FUTURE.md §3 P0).

---

## A. Shipped (live on Galileo testnet, verifiable now)

1. **Agent creation as ERC-7857 Agentic ID** — define a persona, encrypt it (AES-256-GCM), store on 0G Storage, mint a token that references the encrypted brain + owner pubkey + policy hash. Identity *is* the intelligence, not a metadata pointer.
2. **Sealed Inference runs** — tasks execute in 0G Compute TEE; each returns a signed attestation verified with `processResponse`; the run anchors a `traceCID` + `teeSignature` on-chain via `ProofMeshReceipts`.
3. **Re-encryption transfer (the money-shot)** — selling an agent re-encrypts its brain for the buyer through the oracle; the seller **provably loses decrypt access**. `transferFrom` is disabled so you can't sell the token but keep the brain.
4. **Clone with creator royalty** — clone a proven agent; the creator earns a flat royalty; clone count is on-chain.
5. **Policy-bound escrow** — hire an agent with on-chain spend limits (max-per-tx, daily budget, allowed merchants), lock→fulfill→settle, TTL refund, dispute path.
6. **Proof-only reputation** — scores move only via receipt-anchored writes; no reviews; tiers derived from proof history.
7. **Composite receipts** — one receipt per verifiable task, tying session + payment + reputation, anchored for 0G DA.
8. **Cinematic product UI + operator console + proof pages** — live at the deployed URL; API routes for the full loop.

## B. Wave 3 additions (mainnet + the product moment)

9. **Mainnet deployment (16661)** — all 5 contracts deployed + verified on 0G Aristotle; app switches to mainnet behind an env flag with testnet fallback.
10. **Verify-in-30-seconds page** (`/proof/[receiptId]`) — the signature product surface: who owned it, what model ran, what it paid, what rules were locked, whether reputation was earned — every field links to its on-chain source and re-runs `processResponse` client-side. This is the "verify it yourself" moment that separates NEXUS from "trust me" competitors.
11. **Reputation-gated "hire this agent"** — the marketplace action goes live on mainnet; only proof-backed agents surface.
12. **Evidence index + gather-proofs** — `scripts/gather-proofs.ts` auto-generates `PROOFS.md` from live chain; append-only run artifacts per scenario.

## C. Platform features (the SaaS turn — post-buildathon, high ambition)

13. **NEXUS SDK (`0g-nexus-sdk`, npm)** — `createAgent`, `runTask`, `getReceiptProof`, `transferAgent`, `cloneAgent`, `verifyReceipt`. Lets any builder integrate verifiable agent trust without touching 0G plumbing. Publishing it is the platform-intent signal the winning projects used. **✅ SHIPPED** — `npm install 0g-nexus-sdk` (v0.1.0, Apache-2.0), built to `dist/` with type declarations; a clean outside project verifies mainnet receipt #2 with no key.
14. **ProofPass API + embeddable badge** — a hosted `verify(receiptId) → {owner, model, policy, payment, repDelta, valid}` endpoint and a drop-in "NEXUS-verified ✓" badge any marketplace/host/DAO can embed. One-click proof next to any agent, anywhere.
15. **Agent Passport** — a portable, cross-platform identity: token + proof history + reputation, verifiable off any platform. Agents carry their track record with them; the passport gets more valuable the longer it runs verifiably (the moat).
16. **Reputation explorer** — a public, searchable view of agents ranked by proof-backed reputation, each score drilling into its receipts.
17. **Agent-to-agent hiring (x402-style)** — agents autonomously hire proven sub-agents through policy escrow, enforced on-chain (the AgentAllowance "budget not wallet" pattern applied to NEXUS reputation).
18. **Multi-model / multi-provider Sealed Inference** — per-run model attestation across providers; the receipt records exactly which attested model ran.
19. **v2 trustless oracle** — re-encryption + settlement signer moves into a TEE/ZKP oracle, removing the last v1 trust assumption (closes the honest gap in `PROOFS.md`).
20. **Team / org accounts + metered ProofPass billing** — the revenue surface: protocol fee on hires, creator royalties on clones, metered/subscription ProofPass for platforms verifying at scale.

## D. Feature → 0G primitive → value

| Feature | 0G primitive | Why it's only possible on 0G |
| --- | --- | --- |
| Encrypted-brain identity + transfer | ERC-7857 + 0G Storage | intelligence tokenized + re-encrypted on transfer, not a pointer |
| Hardware-proven runs | 0G Compute Sealed Inference (TEE) | the chip signs the run, not the operator |
| Immutable proof trail | 0G Chain + Storage + DA | every task is a verifiable on-chain record |
| Proof-only reputation | 0G Chain | scores can't be bought; each carries a receipt |
| Policy-bound autonomous hiring | 0G Chain escrow | spend rules enforced on-chain, not promised |

## E. What deliberately stays out of scope (so it isn't half-built)
Kernel-level trace proving (traces stay anchored, not kernel-proven), full signer decentralization (v2), and cross-chain anchoring — all named roadmap, not Wave 3. Building them halfway would weaken the proofs; shipping the honest v1 with a clear v2 path scores better than an overclaimed trustless story.
