# NEXUS — Build Plan

> Organizing principle: **do not risk winning.** Every constraint below exists to remove a failure mode that costs more than it scores. Completion is expressed in **levels, not time** — you decide the clock.

---

## PART A — Wave 1 proof-of-work, in levels

You said Wave 1 must show real proof of work (backend ~65-70%, frontend ~70%), and you build in completion levels (~40% → ~55% → ~70%). Here's what each level *is*, with a hard definition-of-done. **Do not start a level until the one below it is green.** This ordering is itself win-protection: it front-loads the risky primitives so a failure shows up early, when you can still pivot.

### LEVEL 0 — Gate-check (before ANY product code)
Prove the four risky primitives work on 0G testnet. If any fails, you learn now, not in week 4. (Scripts spec'd in TEST_PLAN.)
- [ ] ERC-7857 mint returns a tokenId on 0G testnet, `ownerOf` correct, cipherRef stored
- [ ] Sealed Inference call to `router-api.0g.ai/v1` returns output **+ attestation field**
- [ ] 0G Storage write→read round-trips identical bytes
- [ ] A trivial escrow lock→settle cycle lands txs on `chainscan.0g.ai`
**DoD:** four green checks with tx links. *These links go straight into the Wave 1 submission as your de-risking proof.*

### LEVEL 1 — Skeleton Alive (~40%)
The spine works end-to-end in the ugliest possible form. No styling, no extras.
- Create an agent: define persona JSON → encrypt → upload to 0G Storage → `mint()` → agentId
- Run one task: fetch persona → Sealed Inference → display signed output + attestation
- Minimal UI: a form to create, a button to run, raw JSON output on screen
**DoD:** you (from a clean browser) create an agent and run a task; the signed attestation is visible. **No escrow, no reputation, no clone yet.**
**Constraint:** if persona encryption is slowing you down, start with owner-key encryption only (no transfer yet). Transfer is Level 3.

### LEVEL 2 — Loop Closed (~55%)
The full create → run → **prove** loop is visible and persistent.
- `openSession` / `closeSession` writing policyHash + traceCID to 0G Chain
- Tool-call logger (application-level) → trace bundle → 0G Storage
- CompositeReceipt minted → ReputationRegistry score increments
- Frontend: an **Agent Profile Card** (name, tier, score, task count, "verify" link to chainscan)
**DoD:** run a task → score goes up → profile card refreshes → clicking "verify" shows the on-chain receipt. This is the first moment it *feels* like the product.
**Constraint:** reputation = simple increment on success. No tiers logic beyond a lookup table. No anti-gaming math yet.

### LEVEL 3 — Demo-Grade (~70%, = Wave 1 submission state)
The two things that make people stop scrolling: **the transfer** and **the clone**.
- `NexusEscrow` integrated: a task that spends → lock → fulfill → settle on 0G Chain
- Re-encryption transfer working with the trusted-signer oracle (the "I provably lose access" moment)
- Clone button working (royalty to creator), clone count on the card
- Frontend polished enough to not embarrass: clean create flow, a real profile card, a public **Proof Page** ("verify in 30s")
**DoD:** a stranger can create an agent, run a paid task, see the proof, clone it, and watch a transfer re-encrypt and flip ownership — all on testnet, all verifiable. Backend ~70%, frontend ~70%.
**Constraint:** marketplace = a single hardcoded listing or two. NOT a browsable market. The market is Wave 4.

---

## PART B — Wave roadmap (what each wave's submission proves)

No dates (your call), but the *order* is fixed by the scoring shifts.

| Wave | Scoring emphasis | What ships | The thing judges see |
|---|---|---|---|
| **1** Scope + plan | Vision & 0G Fit (40%), Tech (30%), Execution (30%) | Levels 0–3 above on **testnet** + docs + X post | A team already shipping, not pitching. The de-risking proof links are the kill shot. |
| **2** Testnet demo | same | Hardening, the full 5-primitive loop, a clean <3-min demo video | Stranger-runnable testnet app; the transfer money-shot on video |
| **3** **Mainnet (biggest pool)** | **0G Integration Depth (50%)**, Tech (30%), Docs (20%) | All contracts verified on **0G mainnet**; trusted-signer oracle live | 5 load-bearing 0G primitives, real mainnet txs, verify-in-30s proof page |
| **4** Traction | Real Usage (40%), UX (30%), Marketing (20%), Roadmap (10%) | Turn on **the hire/marketplace button**; YouTube series; clone incentives | DAUs, organic clones, real X/YT posts from non-you accounts |
| **5** Growth + Demo Day | same + pitch | Metrics dashboard, growth roadmap, Apollo application | A fundable trajectory, not a finished toy |

**Marketplace sequencing (your correct call):** identity+proof+reputation in Waves 1–3 → "hire this agent" button turns on in Wave 4, *because* agents now have reputations worth trusting. The dependency order is the pitch.

---

## PART C — HARD CONSTRAINTS (win-protection — do not cross without a written reason)

These are the lines that keep you from becoming NeuroLedger 2.0 (technically magnificent, unfinished, undistributed).

**Architecture cuts (settled):**
- ❌ No eBPF / kernel monitoring (can't run on 0G's nodes; collapses under one viva question)
- ❌ No model fine-tuning (testnet-only on 0G; inference only)
- ❌ No on-chain TDX quote verification (verify off-chain, anchor on-chain)
- ❌ No TEE/ZKP re-encryption oracle in v1 (trusted ECDSA signer; TEE oracle is v2 roadmap)
- ❌ No x402-on-Base settlement (native 0G escrow — settlement must touch 0G or it doesn't score)

**Scope cuts (the over-scope guard):**
- ❌ No token / bonding curve / tokenomics
- ❌ No multi-chain / bridge
- ❌ No staking / slashing
- ❌ No multi-agent orchestration
- ❌ No secondary-royalty engine beyond a flat clone royalty
- ❌ No general semantic fulfillment verification (structural/schema check only)
- ❌ Marketplace ≤ 2 listings until Wave 4; single settlement asset until Wave 4

**Quality floors (these you may NOT cut — they're what win):**
- ✅ The verify-in-30s proof page must work flawlessly — it's the demo's spine
- ✅ The transfer "I provably lose access" moment must be real (trusted signer is fine; faking it is not)
- ✅ Every score must trace to an on-chain receipt hash
- ✅ The honest trust-model language (ARCHITECTURE §1) must be in the docs and the pitch

**The decision rule when tempted to add something:** *Does it create a new way for the live demo to fail? If yes, and it isn't on the quality-floor list, cut it.* Polish the five primitives that work until they're flawless instead of adding a sixth that might not.

---

## PART D — Parallelization (if a collaborator joins)

- **Track 1 (contracts + oracle):** NexusAgent → ProofMeshReceipts → NexusEscrow → ReputationRegistry → oracle service
- **Track 2 (runtime + frontend):** Sealed Inference integration → tool-call logger → create flow → profile card → proof page
- **Integration seam:** the agentId + sessionId + receiptId contract. Agree the event shapes (CONTRACTS.md) on day one so the tracks don't diverge.
Solo: do them in the Level 0→3 order above; resist the urge to build the pretty frontend before Level 0 is green.
