# NEXUS — Pitch & Demo Script (Wave 3)

Two scripts: a **≤3-min demo video** (the submission requirement) and a **~4-min live pitch** (Demo Day / judges). Both are written as **SAY** (exact words) + **SHOW** (exact screen action) + timing. Then delivery notes, the X post, the one-liners, and judge-Q&A answers. Deliver it calm and certain — you have real mainnet proofs; let them speak.

**The one-liner (memorize):** *"NEXUS is the verifiable trust layer for AI agents — own the intelligence, prove every task in hardware, and validate any agent on the new ERC-8004 standard, all on 0G mainnet."*

> ## READINESS (2026-09-01) — every SHOW beat below is live; nothing is vaporware
> | Beat | Live surface / command |
> | --- | --- |
> | Hook / hero | https://nexus-alpha-five-26.vercel.app (mainnet build) |
> | Create + own (0:18) | `/console` → mint, or `pnpm demo:mint` |
> | Run + prove TEE (0:45) | `pnpm demo:receipt` → `/proof/[id]` → RE-VERIFY LIVE |
> | **ERC-8004 external validation (1:15)** | `pnpm demo:validate-external` — real canonical registry `0x8004A169…432`, real response tx on chainscan |
> | Transfer money-shot (1:50) | `pnpm demo:transfer` |
> | Verify-in-30s + replay (2:20) | `/proof/2` → **RE-RUN THIS PROOF** (byte-identical + fresh enclave ✓) + **offline bundle** download; QR on `/agent/1` |
> | Close: leaderboard | `/leaderboard` |
>
> Judge Q&A ammo: NEXUS agent #1 = ERC-8004 **#3531152**; external agent **#3531171**
> validated 100/100; `processResponse("0xd9966e13…471C","fef2f327-7a74-46d3-8ad5-a6375c850091") → true`;
> 7 verified contracts; 51/51 + 13/13 tests; `OG_NETWORK=mainnet pnpm verify:proofs` green.

**The wedge (say it twice in any pitch):** *"Zero Arena trades agents. Marketplaces clone them. NEXUS proves them."*

---

## SCRIPT A — Demo video (≤3:00)

Record 1080p+, editor font large, notifications off, wallet warmed up, `forge test` pre-run, a testnet fallback clip ready. Never show a private key or `.env`.

### 0:00–0:18 · Hook
**SAY:** "When you own an AI agent today, you own a receipt — a pointer to someone else's server. And when an agent works for you, you just take its word. NEXUS replaces 'trust me' with 'verify it' — live on 0G mainnet."
**SHOW:** Title card "NEXUS — verifiable AI-agent trust layer · 0G Aristotle mainnet 16661", then the live app hero.

### 0:18–0:45 · Create + own (ERC-7857)
**SAY:** "I define an agent, its brain is encrypted and stored on 0G Storage, and it's minted as an ERC-7857 token. The identity *is* the intelligence — not a link to it."
**SHOW:** Console → define persona → mint → the agent appears as an owned card. Cursor hovers the on-chain `ownerOf` / persona ref.

### 0:45–1:15 · Run + prove (Sealed Inference, TEE)
**SAY:** "I run a task. It executes inside 0G Sealed Inference — a hardware enclave — and returns a signed attestation. Watch: I click verify, and the proof checks against the chip, not against my server."
**SHOW:** Run a task → output appears → click **Verify** → `processResponse` returns true, green ✓. Show the model provenance line ("ran on <model>, verified").

### 1:15–1:50 · The timely flex — ERC-8004 validation
**SAY:** "0G just shipped support for ERC-8004, the new Trustless-Agents standard from MetaMask, the Ethereum Foundation, Google and Coinbase. NEXUS is a TEE validator for it. Here's an agent that isn't even mine — from another platform — requesting validation. NEXUS re-executes it in the enclave and posts a hardware-backed validation response on-chain. NEXUS validates the whole agent economy, not just its own agents."
**SHOW:** Trigger a `validationRequest` on an **external** ERC-8004 agent → NEXUS posts a Validation Response → open the tx on chainscan. Show the agent's ERC-8004 portable identity card.

### 1:50–2:20 · The money-shot — transfer re-encryption
**SAY:** "Now I sell an agent. The oracle re-encrypts its brain for the buyer, and ownership flips. The critical part: the seller can no longer decrypt it — they provably lost access. You can't sell the token and secretly keep the intelligence."
**SHOW:** Sell → ownership flips → attempt to decrypt as the seller → fails; as the buyer → succeeds. Show the cipherRef change on chainscan.

### 2:20–2:45 · Verify-in-30-seconds + replay
**SAY:** "Every task is a permanent, verifiable record. Who owned it, what model ran, what it paid, what rules were locked, whether reputation was earned — and I can re-run the proof and get the same result. Reputation here comes from proofs, not reviews."
**SHOW:** Open `/proof/[receiptId]` → each field links on-chain → click **Re-run this proof** → replay reproduces + re-verifies. Scan the QR on the card to jump to it.

### 2:45–3:00 · Close
**SAY:** "NEXUS — own the intelligence, prove every task in hardware, validate any agent, on 0G mainnet. The trust layer the agent economy is missing."
**SHOW:** Mainnet contract links + the leaderboard, then the title card with the repo + X handle.

---

## SCRIPT B — Live pitch (~4:00, judges / Demo Day)

### 0:00–0:30 · Problem
**SAY:** "The agent economy has a trust hole. Agents make payments, call tools, hire other agents — but there's no verifiable way to know who an agent is, whether it did the work it claims, or whether you actually own its intelligence. Today that's all 'trust me.' NEXUS makes it 'verify it,' in hardware, on 0G."

### 0:30–1:00 · What NEXUS is
**SAY:** "Three things, all live on 0G mainnet. One: agents are ERC-7857 tokens whose encrypted brain transfers with the token — sell it and the seller provably loses access. Two: every task runs in 0G Sealed Inference and is proven by the chip, not the operator. Three — and this is new — NEXUS is a TEE validator for ERC-8004, the Trustless-Agents standard 0G just adopted, so NEXUS can validate any agent on any platform."

### 1:00–3:00 · Live demo
Run the SCRIPT A beats, but linger on **ERC-8004 external-agent validation** (the infrastructure story) and the **transfer money-shot** (the visceral one). Narrate each on-chain link: "this is mainnet, you can open it right now."

### 3:00–3:40 · Why it wins / SaaS
**SAY:** "NEXUS is picks-and-shovels for the agent economy. Any ERC-8004 agent, anywhere, can request a NEXUS TEE validation and carry a NEXUS-verified reputation. Our moat is accumulated, portable proof history — reviews can be bought, hardware proof can't. The business is a protocol fee on hires, royalties on clones, and a metered ProofPass API for platforms that embed verification."

### 3:40–4:00 · Ask / close
**SAY:** "We're on mainnet with five verified contracts, real transactions, and an ERC-8004 validator running today. We're building the verification layer the whole agent economy plugs into. That's NEXUS."

---

## Delivery notes
- **Pace:** ~130 wpm, calm. Silence after the money-shot beat — let the "seller lost access" land.
- **Every claim → a link.** Say "this is on mainnet, open it yourself" at least twice. Reproducibility is your edge over polished-but-unverifiable competitors.
- **Lead the trust model, don't hide it:** if asked, say plainly "inference is hardware-proven; traces are anchored; the re-encryption signer is trusted in v1, TEE/ZKP in v2." Judges reward a team that knows exactly where its guarantees start and stop.
- **Don't overclaim ERC-8004:** it's Draft; say "we integrate the standard 0G just shipped support for," not "the finalized standard."
- **Fallback:** if mainnet is congested live, cut to the pre-recorded clip and keep talking — never dead-air a spinner.

## The mandatory X post
> **NEXUS** is live on @0G_labs mainnet 🛡️ — the verifiable trust layer for AI agents.
> Own the intelligence (ERC-7857) · prove every task in hardware (0G Sealed Inference) · and now a **TEE validator for ERC-8004 Trustless Agents**.
> Reputation from proofs, not reviews. Verify any agent yourself 👇 [clip]
> #BuildOn0G #0GBridge @0G_Builders @AKINDO_io
>
> *(Confirm exact required tags in the AKINDO dashboard.)*
> Thread: post 2 = the transfer money-shot · post 3 = validating an external agent · post 4 = re-run-the-proof.

## Judge Q&A — have these ready
- **"What stops the operator cheating?"** → "Reputation only moves via receipt-anchored writes; inference is verified by the enclave, not us; and you can re-run any proof and check it yourself. The one v1 trust assumption is the re-encryption signer, which moves into a TEE/ZKP oracle in v2."
- **"How is this different from the NFT-agent marketplaces?"** → "They tokenize a pointer and take the agent's word. We tokenize the encrypted intelligence itself, prove every run in hardware, and validate agents across platforms via ERC-8004. Different category — infrastructure, not a marketplace."
- **"Is the ERC-8004 part real?"** → "Yes — here's a live mainnet validation of an external agent. NEXUS posted a TEE-backed validation response. Open the tx."
- **"What's the moat?"** → "Portable, accumulated proof history. The longer an agent runs verifiably on NEXUS, the more valuable and un-fakeable its passport."
- **"Traction plan?"** → "Free Solo-style verification + fiat onboarding via 0G Pay for Web2 users, the shareable proof cards/QR for virality, and ProofPass so other platforms embed us. We measure verified runs and validated external agents, not vanity metrics."

## Suggested extra things to work on (beyond this layer)
- **Publish `@nexus/sdk` to npm** — platform signal + how others integrate.
- **A2A protocol bridge** — since ERC-8004 extends Google's Agent-to-Agent protocol, make NEXUS agents A2A-discoverable.
- **"Internet Court" dispute alignment** — map your escrow disputes onto the 0G-backed agent-dispute standard.
- **Public reputation explorer + API** — reputation-as-data for other dApps.
- **Multi-model provenance dashboard** — show which of 0G's 28 models earned which reputation.
- **Agent teams (multi-agent composite tasks)** — a DAG of agents, each sub-proof composed into one pipeline receipt.
