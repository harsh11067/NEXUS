# NEXUS — Wave 1 Submission Package

> The goal for Wave 1 is not "good vision doc." It's **"a team already shipping."** Almost every competitor submits vision-only. You submit vision + a working testnet app (Levels 0–3) + four green de-risking proofs. That gap is how you land top-tier in Wave 1.

---

## 1. Project name + one-line description (≤30 words)

**NEXUS**
> Create, own, and prove AI agents. Every agent is an ERC-7857 token; every task is cryptographically verifiable on 0G. Reputation you can trust, not reviews you can't.

---

## 2. Short summary (what / problem / 0G components)

**What it does:** NEXUS lets anyone create an AI agent, own it as an on-chain asset whose encrypted intelligence actually transfers with the token, and produce a hardware-signed proof for every task it runs. Reputation is computed from those proofs, not from reviews. Once an agent has a track record, it can be hired or sold.

**Problem it solves:** The agent economy runs on "trust me." You can't verify an agent used the model it claimed, stayed in budget, or followed its rules — and "owning" an agent NFT today means owning a pointer, not the intelligence. NEXUS replaces trust with on-chain proof.

**0G components used (5, all load-bearing):**
- **ERC-7857 (Agentic ID)** — agent identity + encrypted-intelligence transfer + clone
- **0G Storage** — encrypted personas, trace bundles, fulfillment evidence
- **0G Compute (Sealed Inference)** — TEE inference, hardware-signed outputs
- **0G Chain** — all contracts (identity, receipts, escrow, reputation)
- **0G DA** — append-only composite-receipt log

---

## 3. The de-risking proof section (your differentiator — most teams won't have this)

> "We didn't just plan it — we validated every risky primitive on 0G testnet before writing product code."

Include for each (with `chainscan.0g.ai` / explorer links from Level 0):
- ✅ **ERC-7857 mint** — agent minted on 0G testnet · tokenId · ownerOf · cipherRef → [tx link]
- ✅ **Sealed Inference** — signed response + attestation from `router-api.0g.ai/v1` → [screenshot/hash]
- ✅ **0G Storage** — encrypted persona round-trip → [CID]
- ✅ **0G escrow cycle** — lock → fulfill → settle on 0G Chain → [tx links]

Plus, if Levels 1–3 are reached: a live testnet URL + a 60-90s clip of create → run → prove → clone → transfer.

---

## 4. Architecture description / diagram

Point to `ARCHITECTURE.md`. Lead the written description with the honest trust model (§1) — judges reward a team that knows exactly where its guarantees start and stop. Include the system overview diagram and the 5-primitive mapping table.

---

## 5. Mandatory X post (draft)

Required: project name, demo screenshot/clip, `#0GBridge #BuildOn0G`, tag `@0G_labs @0G_Builders @AKINDO_io`.

> Building **NEXUS** for the #0GBridge buildathon 🛡️
>
> Zero Arena trades agents. CaaS clones them. **NEXUS proves them.**
>
> Create an AI agent → own it as an ERC-7857 Agentic ID → every task it runs is hardware-signed and verifiable on @0G_labs. Reputation from on-chain proofs, not fakeable reviews.
>
> Already live on testnet 👇 [clip: create → run → verify]
>
> #BuildOn0G @0G_Builders @AKINDO_io

(Keep a thread ready: post 2 = the transfer money-shot, post 3 = the verify-in-30s proof page. This seeds the Wave 4-5 social-proof habit early.)

---

## 6. Demo video shot list (≤3 min — for Wave 1/2)

1. **(0:00-0:20) The hook.** "When you "own" an AI agent today, you own a receipt. When an agent works for you, you take its word. NEXUS fixes both." Show the wedge line.
2. **(0:20-0:50) Create + own.** Define a persona → encrypt → mint as ERC-7857 → it appears as an owned agent with a profile card.
3. **(0:50-1:30) Run + prove.** Run a task → Sealed Inference signed output → click "verify" → the on-chain receipt (model hash, input/output hash). "The chip signed this, not me."
4. **(1:30-2:10) The money-shot — transfer.** Sell the agent → oracle re-encrypts its brain for the buyer → ownership flips → "the seller can no longer decrypt it. They provably lost access." Show the cipherRef change on-chain.
5. **(2:10-2:40) Clone + reputation.** Clone it (royalty to creator) → clone count ticks up → reputation tier on the card. "Every score traces to a receipt."
6. **(2:40-3:00) The close.** The verify-in-30s proof page. "Who owned it, what ran, what it paid, whether it obeyed — verify it yourself. That's the trust layer the agent economy is missing."

---

## 7. Wave 1 self-scoring check (against the rubric)

| Axis (Wave 1) | Weight | Are we strong? |
|---|---|---|
| Project Vision & 0G Fit | 40% | **Very** — impossible without 0G; 5 load-bearing primitives; sharp wedge |
| Technical Approach | 30% | **Very** — working testnet app + de-risking proofs, not just a plan |
| Team & Execution Signal | 30% | **Very** — shipping in Wave 1 is the strongest possible execution signal |

If all three are green at submission, you are in top-tier contention for Wave 1. The plan in BUILD_PLAN.md is designed to make them green.
