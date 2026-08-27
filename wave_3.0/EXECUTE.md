# NEXUS — Wave 3 Execution Plan (EXECUTE.md)

This is the ordered, verified-against-the-repo runbook for executing everything in
`wave_3.0/`. The other files in this folder are the *spec*; this file is the
*sequence* — what exists, what's missing, who does each step (coding agent vs. you),
and the exact commands. Read `PLAN (3).md` for the "why", `DIY.md` for the
hands-on-keys checklist, this file for the "do it in this order".

Last audited against the repo: 2026-08-27.

> **STATUS 2026-08-27 (post-execution): Phases A–D are DONE on mainnet.**
> 5 contracts deployed + source-verified on 16661 (`contracts/deployments/mainnet.json`),
> full network parameterization landed (`OG_NETWORK` / `NEXT_PUBLIC_USE_MAINNET`),
> mainnet storage round-trip + **TeeML hardware-verified Sealed Inference** proven
> (receipt #1, `processResponse === true`), all demo scripts + append-only
> `evidence/` + `verify:proofs` + `gather:proofs --network` landed and green,
> ProofPass shipped (SDK `verifyReceipt`, `/api/verify/[receiptId]`,
> `/api/badge/[receiptId]`, RE-VERIFY LIVE on `/proof/[id]`).
> Remaining 🧑 items: record the ≤3-min demo video, the public X post, and the
> AKINDO submission (§ Phase D) — only a human can do those.

---

## 0. Reality check — what is actually built vs. what the specs assume

**Live and working (verified in the repo):**
- 5 contracts deployed + verified on **0G Galileo testnet (16602)** — addresses in
  `contracts/deployments/galileo.json`. `forge test` = 39/39.
- SDK (`packages/sdk`): crypto, persona, storage, inference (real `processResponse`),
  contracts, runtime. Full app on Next.js with API routes for the whole loop and a
  `/proof/[id]` page. Live on Vercel.
- `scripts/gather-proofs.ts` exists and pulls live on-chain proofs.
- Deploy path is `scripts/deploy.ts` (ethers-based) — **not** `forge script`
  (Foundry broadcast doesn't recognize 0G chain ids). The `CONTRACTS.md` runbook
  that says `forge script ... --broadcast` will NOT work here; use `deploy.ts`.

**Missing — this is the actual Wave 3 work (nothing here supports mainnet yet):**
A grep for `16661` / `mainnet` / `USE_MAINNET` / `evmrpc.0g.ai` across the codebase
returns *nothing*. Concretely:

| Gap | Where | Fix (Phase) |
| --- | --- | --- |
| `loadDeployments()` only ever reads `galileo.json` | `packages/sdk/src/config.ts` | A1 |
| `deploy.ts` hardcodes banner + writes `galileo.json` only | `scripts/deploy.ts` | A1 |
| `foundry.toml` has only the `galileo` RPC endpoint | `contracts/foundry.toml` | A1 |
| No `NEXT_PUBLIC_USE_MAINNET` switch in the app | `app/` + `config.ts` | A4 |
| Demo scripts the plan/PROOFS reference don't exist: `demo:mint/transfer/clone/escrow/refund/rep/receipt`, `verify:proofs`, `test:sdk`, `quickstart.sh` | `scripts/`, root `package.json` | C |
| SDK `verifyReceipt()` (ProofPass core) not implemented | `packages/sdk/src` | D |
| Advanced Part-2 contracts (AgentHiring, ReputationStake, `modelHash` in `closeSession`) not built | `contracts/src` | E (optional) |

**Strategic read (from the specs):** Wave 3 is scored 50% mainnet depth / 30%
technical / 20% docs+demo. It is a *packaging + mainnet-deploy + proof-legibility*
game, not a new-tech game. Do NOT add contract surface until Phase A–D are green.

---

## 1. Blocking dependencies (must clear before any mainnet step)

1. **A funded mainnet key.** ~0.05–0.1 0G for deploy + demos. The testnet faucet
   does NOT fund mainnet — you must bridge/acquire real 0G. See §6 (swap/bridge).
2. **Broker ledger funded** for Sealed Inference: keep the operator wallet ≥ ~3.2 0G
   (some nodes enforce a 3 0G ledger minimum). Or switch to router mode + API key.
3. **Live chainId confirmed:** `cast chain-id --rpc-url https://evmrpc.0g.ai` → `16661`.
   Abort if it differs — 0G docs disagree on ids; trust the RPC.
4. **TeeML provider confirmed** on mainnet (`0g-compute-cli inference verify
   --provider <ADDR>`). TeeTLS cannot back the "hardware-verified" claim.

Steps that are **yours** (keys/funds/human eyeball) are marked 🧑 below; everything
else a coding agent can do. The full 🧑 list is `DIY.md`.

---

## 2. Phase A — Make the code network-aware, then deploy to mainnet

### A1. Parameterize the network (coding agent, ~1 sitting, no funds needed)
- `packages/sdk/src/config.ts`: add a network selector (env `OG_NETWORK` or derive
  from `OG_CHAIN_ID`); make `loadDeployments()` read
  `contracts/deployments/<network>.json` (galileo|mainnet), keeping the env-var
  fallback for Vercel.
- `scripts/deploy.ts`: take a `--network` arg (or read `OG_NETWORK`), title the
  banner from it, and write `contracts/deployments/<network>.json`. Add
  `"deploy:mainnet"` to root `package.json`.
- `contracts/foundry.toml`: add `og_mainnet = "https://evmrpc.0g.ai"` under
  `[rpc_endpoints]` and a mainnet `[etherscan]` entry (`/open/api`, chain 16661)
  for verification.
- Verify locally against testnet: `pnpm build:contracts && pnpm test:contracts` stay green.

### A2. 🧑 Fund the mainnet key + confirm chainId (§1.1, §1.3)

### A3. Deploy the 5 contracts to mainnet (you run it; you hold the key)
```bash
pnpm build:contracts
OG_NETWORK=mainnet OG_RPC_URL=https://evmrpc.0g.ai OG_CHAIN_ID=16661 \
  pnpm deploy:mainnet            # writes contracts/deployments/mainnet.json
```
Then, on mainnet:
- `ReputationRegistry.setWriter(CompositeReceiptMinter, true)` (the deploy script
  already wires this — confirm it ran on 16661).
- Confirm `NexusAgent` trustedSigner == the key your oracle service uses
  (`setSigner` if not), or every transfer/clone reverts `BadSignature`.

### A4. Verify sources + wire the app to mainnet
- Verify all 5 on `chainscan.0g.ai/open/api` (foundry verify or the chainscan UI);
  open each page and eyeball that source shows.
- Add the `NEXT_PUBLIC_USE_MAINNET` switch: app reads mainnet addresses when true,
  keeps testnet as fallback so a mainnet hiccup never dark-screens the demo.
- Set the mainnet env vars on Vercel (section 6 of `.env.example`) and redeploy.

**Phase A done when:** 5 verified contracts on 16661, `mainnet.json` written, app
loads against mainnet with testnet fallback intact.

---

## 3. Phase B — Real 0G stack on mainnet (no mocks)  🧑 mostly

- **Storage:** point the indexer at mainnet turbo (`indexer-storage-turbo.0g.ai`).
  Round-trip an encrypted persona + a trace bundle; wait 3–5 min before retrieval;
  Merkle-verify + decrypt with the owner key only. (`TEST.md` S-01…S-05)
- **Compute:** fund the broker ledger, assert provider is **TeeML** at preflight,
  run a real inference, verify `processResponse` → `true`. If no mainnet TEE
  provider, label runs `unverified` and say so — never fake verification.
  (`TEST.md` T-01…T-07)
- **DA:** anchor the composite-receipt log root (already modeled by the minter).

Do one real mint / transfer / escrow settle / over-limit-blocked on mainnet and
eyeball each on chainscan (`DIY.md` §4).

---

## 4. Phase C — Evidence index (this is what actually wins)

- Extend `scripts/gather-proofs.ts` to take `--network mainnet` and regenerate the
  `PROOFS.md` tables from live chain state — never hand-type a hash.
- Add the missing demo scripts + `package.json` entries the plan references:
  `demo:mint`, `demo:transfer`, `demo:clone`, `demo:escrow`, `demo:refund`,
  `demo:rep`, `demo:receipt`, plus `verify:proofs` and `test:sdk`. (Several can wrap
  the existing `demo-level1/2.ts` + gate scripts rather than being written fresh.)
- Write append-only run artifacts under `evidence/<network>/<ts>-<scenario>/` — never
  overwrite. (`PROOFS.md` §D)

---

## 5. Phase D — The product moment + demo

- **ProofPass:** implement SDK `verifyReceipt(receiptId) → ProofBundle` and
  `GET /api/verify/[receiptId]`; make `/proof/[id]` re-derive validity client-side
  (re-run `processResponse`, Merkle-verify the trace, recompute the rep delta) rather
  than trusting a stored boolean. (`WAVE3_SUPERIORITY.md` §2.1)
- **Reputation-gated "hire this agent"** live on mainnet.
- Record the ≤3-min demo: create → run (verify chip) → **transfer money-shot (seller
  loses decrypt)** → verify-in-30s page → reputation tick, mainnet links on screen.
  🧑 (only you can record it) — keep a testnet fallback clip.
- 🧑 Mandatory public X post with the clip + required tags.

---

## 6. Getting real 0G onto mainnet (answering "swap my ETH")  🧑

You cannot fund a 0G-mainnet deploy from ETH directly, and this step must be done
from **your own wallet** — a coding agent must never hold your private key to do it.
Options, cheapest-friction first:

1. **Bridge/acquire 0G, then send to your mainnet deploy key.** Acquire the 0G token
   (0G's mainnet gas token) via a supported bridge or an exchange that lists it,
   then withdraw to the address of your mainnet `PRIVATE_KEY`. Confirm the receiving
   network is 0G mainnet (chainId 16661), not an EVM lookalike.
2. **Verify before you rely on it:** after funding,
   `cast balance <addr> --rpc-url https://evmrpc.0g.ai` shows the balance;
   `cast chain-id --rpc-url https://evmrpc.0g.ai` must print `16661`.

You do NOT need to give me your seed phrase or private key for this. If you want, I
can (a) confirm the exact current bridge/route from 0G's live docs, and (b) generate
a fresh mainnet keypair for you to fund (so no funded key is ever one that touched a
shared `.env`). Ask and I'll pull the current bridge details.

**Amount:** ~0.1–0.2 0G total is plenty for Wave 3 (≤0.1 for deploy+demo txs, ~3 0G
extra only if you run Sealed Inference in broker mode and the node enforces the
ledger minimum — otherwise use router mode).

---

## 7. Additional things to handle (found during the audit)

- **🔐 Rotate the tokens in your local `.env`.** It holds a Vercel token, a Render
  API key, a GitHub PAT, and two private keys in plaintext. `.env` is gitignored and
  was never committed (good), but the deploy tokens should be rotated since they've
  been shared, and the **mainnet** key must be a freshly-generated one, never these
  testnet keys.
- **Don't use `forge script --broadcast` for deploy.** 0G chain ids aren't in
  Foundry's known set; the working path is `scripts/deploy.ts`. `CONTRACTS.md` §8's
  forge-script runbook needs the `deploy.ts` substitution above.
- **Replay hardening (C-07):** confirm `transferDigest`/`cloneDigest` bind
  `address(this)` + `block.chainid` before mainnet, so a testnet signature can't be
  replayed on mainnet. Check in `NexusAgent.sol`; add if absent.
- **Port 3000 conflict** in dev — run `npx next dev -p 3005` if `:3000` is held.
- **Slither pass + secrets grep of the built bundle** before the mainnet site ships
  (`L-08`, `L-09`).
- **GitHub is already connected** (`origin = harsh11067/NEXUS`, SSH, `gh` authed).
  The only untracked thing was `wave_3.0/` itself — commit it so the plan lives in
  the repo.

---

## 8. Suggested execution order (TL;DR)

1. 🧑 Rotate leaked tokens; generate + fund a fresh mainnet key (§6). *(blocks A3)*
2. Agent: A1 network-parameterization + `.env.example` mainnet block *(done)*. No funds needed.
3. 🧑 Confirm `chainId 16661` + TeeML provider.
4. 🧑+agent: A3/A4 deploy + verify + wire the app switch.
5. Agent: Phase C evidence scripts; 🧑 run them against mainnet.
6. Agent: Phase D ProofPass; 🧑 record demo + X post.
7. Only if 1–6 are green: Phase E advanced contracts (`WAVE3_SUPERIORITY.md` Part 2).
