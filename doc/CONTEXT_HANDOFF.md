# NEXUS — CONTEXT HANDOFF (paste this into a new chat)

You are resuming work on **NEXUS**, a deployed Web3/AI project mid-build. Below is full state. Do not re-architect; continue from here.

## PROJECT
NEXUS = the verifiable AI-agent trust layer on **0G** (decentralized AI L1). Tagline: *create an agent, own it as an ERC-7857 token whose encrypted brain lives on 0G Storage, run it in 0G Sealed Inference (TEE), prove every run on-chain; reputation comes from proofs, not reviews.* For the **0G Bridge by AKINDO** buildathon (10 weeks, 5 waves). **Currently Wave 1; deadline June 26 2026, 23:59 UTC.** Wedge: **"Zero Arena trades agents. CaaS clones them. NEXUS proves them."**

## LOCKED DECISIONS (do not relitigate)
1. **eBPF / kernel monitoring CUT** — can't instrument 0G's TEE nodes (you don't own them). Gone for good.
2. **Payments = native 0G Chain escrow**, NOT x402-on-Base. Settlement asset = **native 0G token via `msg.value`** (no ERC-20 address needed); USDC/ERC-20 is v2. `lockFunds` is payable.
3. **Re-encryption oracle = trusted ECDSA signer (v1)**; TEE/ZKP oracle is v2 roadmap. (Zero Arena uses the same trusted-signer stub.)
4. **Marketplace sequenced, not cut**: creator-clone loop (create/own/clone) is Waves 1–3; hire/marketplace button turns on Waves 4–5 once agents have reputations.
5. **Honest 3-tier trust model** (this is the pitch + viva armor):
   - Inference = **hardware-proven** (0G Sealed Inference TEE signs; we call `processResponse()` to verify enclave signature).
   - Tool/trace log = **application-level, immutably anchored** on 0G Storage + Chain (NOT kernel-proven — never claim that).
   - Transfer = **trusted-signer (v1)**.
   - On-chain attestation = **anchored on-chain, verified OFF-chain** (no on-chain TDX quote verification).
6. **Fulfillment verification = structural/schema check only**, not semantic (semantic = AI-hard, v2).
7. **0G Compute auth = Broker mode** (`OG_COMPUTE_MODE=broker`), on-chain ledger, **testnet**, **burner private key**. Chosen over router b/c on-chain verifiable micropayments = integration depth.
8. **Compute/Storage/DA stay on testnet the whole program** (rules allow; testnet has full TeeML attestation). Only **Chain contracts go mainnet at Wave 3.**
9. Over-scoping is the known failure mode. **Freeze features for Wave 1; package and ship.**

## 0G FACTS (verified)
- Galileo testnet **chainId 16602**; RPC `https://evmrpc-testnet.0g.ai`; explorer `chainscan-galileo.0g.ai`; storage explorer `storagescan-galileo.0g.ai`.
- Testnet services are **TeeML-verifiable** (TEE attestation works on testnet, ~free).
- Faucet 0.1 0G/day; Google Cloud 0G faucet drips more; buildathon TG gives lump sums.
- Broker ledger: **min 3 0G to open (v0.6.x), 1 0G/provider min**; 0.1 0G ≈ 10k requests. SDK `@0glabs/0g-serving-broker`; Sealed Inference OpenAI-compatible at `router-api.0g.ai/v1`.
- Broker uses the **provider's served model** → inference ran on a live **qwen TEE provider**, NOT GLM-5. Still genuinely TEE-verified. To force GLM-5: pin `OG_COMPUTE_PROVIDER` to a GLM-5 provider or use router mode. **Never claim GLM-5 in the demo.**
- ERC-7857: vanilla `transferFrom` disabled; ownership only via re-encryption `finalizeTransfer`.
- Competitors: **Zero Arena** (ERC-7857 trading agents, trusted-ECDSA stub), **CaaS / fabianferno/caas** (ERC-7857 agents + cloning + x402 + 0G Storage memory).

## DEPLOYED — 0G Galileo testnet (chainId 16602), verified-by-use, 39 Foundry tests
| Contract | Address | Role |
|---|---|---|
| NexusAgent (ERC-7857) | `0x5Df50CB3F60d46136E072C279eA411dFf17c88B0` | mint, encrypted persona ref, trusted-signer re-encryption transfer, clone w/ royalty, authorizeUsage; transferFrom disabled |
| ProofMeshReceipts | `0xEfCB8Ea852Fa34d870d484B92d5483e0172A9794` | open/close session, lock policy hash, anchor traceCID + TEE attestation |
| NexusEscrow | `0xf7144F87A8c35ec1873816c082bF73093B6328Cf` | native-0G escrow, policy-bound spend, lock→fulfill→settle, TTL refund, disputes |
| ReputationRegistry | `0x9510ec90e82a738D048a569909b1e6b4C79a53A7` | proof-only score writes, every change carries receiptHash, tiers Unverified→Elite |
| CompositeReceiptMinter | `0x201E8a25E73cc7f293A38EC5F9d4E5B86de159B6` | ties session (+optional payment) into one receipt, bumps reputation |

Operator wallet (server signer, funded ≥3.2 0G): `0x2f737521b9b59c202e7d33509C5746A58D795870`

**Reputation formula:** base 1000; −50/violation, −100/dispute lost, −200/fraud, −10/failed, +5/success, +20/merchant-positive. Tiers: Unverified · Emerging 0–200 · Trusted 200–500 · Verified 500–800 · Elite 800–1000 · Flagged <0 · Banned <−500.

## STACK / REPO
- **Next.js single process** on `localhost:3000`: `/d/*` cinematic Three.js "districts", `/console` operator dashboard, `/api/*` real backend wrapping `0g-nexus-sdk`. One origin; server holds operator key and signs.
- `0g-nexus-sdk`: crypto · storage · inference · runtime · contracts.
- **Crypto:** persona (systemPrompt+memory+policy) → serialize → **AES-256-GCM** content key → content key **ECIES-wrapped to owner AND re-encryption oracle** → upload 0G Storage → `mint(cipherRef, policyHash, owner, pubkey)`. Transfer/clone re-wrap content key for new holder w/o exposing plaintext → "seller provably loses access" (verified end-to-end).
- Repo: `contracts/` (Foundry, 5 contracts+tests+deploy), `packages/sdk/`, `scripts/` (gate-checks G1–G4, level demos, deploy.ts, serve-ui.mjs), `app/` (Next.js), `NEXUS_UI/` (districts + nexus-api.js + 3D engine).
- API: `GET /api/status|network|agents|agents/:id|receipts`; `POST /api/agents` (create+mint), `/api/agents/:id/run` ({prompt,prove}), `/api/agents/:id/clone`, `/api/agents/:id/transfer`.

## PROVEN LIVE (executed, not asserted)
- **Level 0 — all 4 gate-checks GREEN:** G1 mint, **G2 Sealed Inference TEE-VERIFIED (the big unknown — RESOLVED)**, G3 0G Storage round-trip (4 nodes), G4 escrow lock→fulfill→settle.
- **Level 1:** agent #4 minted → TEE-verified inference → signed output + outputHash.
- **Level 2:** create → proven task → session locked → encrypted trace on 0G Storage → composite receipt #1 → reputation Emerging (score 5), traced to receiptHash.
- **Level 3:** clone #5→#6 via live API (royalty + re-encryption), parent clone count =1; transfer + escrow routes live.
- Districts wired to real chain data (SoulMint forge mints real ERC-7857; Marketplace cards/tiers/scores; Audit real receipts; World/Network/Execution/Treasury live feeds). `/api/network` showed 6 agents, 1 receipt, block ~39953103.

Key tx links (for submission): G1 mint `0xf5bc1de8…`; G4 escrow lock `0x4862ccbd…`/fulfill `0xda8500d6…`/settle `0x7414b474…`; G3 storage file `0x9432401c…`; L1 mint#4 `0x1dc860a2…`; L2 receipt `0xe2a5d05d…`; L3 clone `0x719f136d…`.

## REMAINING ~30% (NOT done — Wave 2+ unless noted)
- **Per-user wallets (wagmi/viem) in browser** — today one operator key signs everything. Critical path to Wave 4 traction.
- Transfer-to-chosen-buyer in UI (currently ephemeral buyer).
- Escrow-paid tasks exposed in UI (runtime supports spend; districts don't show a merchant flow).
- Marketplace browse/search/pagination beyond 3 featured slots.
- Dispute/refund UIs, notifications, activity feed, global search.
- Treasury vault logic (out of scope per BUILD_PLAN).
- **Mainnet deploy + contract verification (Wave 3).**
- TEE/ZKP re-encryption oracle (v2).

## NEXT STEPS (Wave 1, in order — packaging, NOT new features)
1. **Record the 3-min demo** (script exists: DEMO_SCRIPT.md). Rehearse path twice; warm the TEE provider first; pre-open chainscan tabs.
2. **Submit on AKINDO early** (1–2 days before June 26). Lead with de-risking proof tx links.
3. **Post mandatory X thread** — `#0GBridge #BuildOn0G`, tag `@0G_labs @0G_Builders @AKINDO_io`; clip = 60s social cut.
4. **Clean SETUP.md + documentation.md** so a judge can run it (reproducibility is scored).
5. **FREEZE features** — adding more = more demo failure modes; none of the remaining 30% is scored in Wave 1.
Then (overall-win levers, not Wave 1): start the **YouTube build series now**; begin **per-user wallets** for Wave 2.

## GUARDRAILS
Honesty is the pitch — never overclaim (no GLM-5, no kernel-level proof, no on-chain TDX verification, no semantic fulfillment). Testnet for compute the whole program. Burner key only in `.env`. Don't over-build before shipping Wave 1.
