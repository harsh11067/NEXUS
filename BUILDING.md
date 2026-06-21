# NEXUS — Build & Run (Levels 0–2)

Real implementation. No mocks, no dummy fallbacks. Every primitive talks to live
0G Galileo testnet. The only things you must supply are in `.env` (see below).

## What's here

```
contracts/        Foundry — the 5 NEXUS contracts + 39 passing tests + deploy script
packages/sdk/     TypeScript SDK — crypto, 0G Storage, Sealed Inference, runtime
scripts/          Level-0 gate-checks (G1–G4) + Level-1/2 CLI demos
app/              Next.js dashboard — create (L1), run+prove (L2), profile cards
```

## 0. Prerequisites (already verified on this machine)

- Node 24, pnpm 10, Foundry (forge) — installed
- `pnpm install` at repo root — done

## 1. Fill `.env`

```bash
cp .env.example .env
```

Then set, at minimum:

| Var | Where to get it | Required |
|---|---|---|
| `PRIVATE_KEY` | a 0G Galileo testnet key funded at https://faucet.0g.ai | **yes** |
| `OG_COMPUTE_API_KEY` | 0G compute console / `0g-compute-cli` (router mode) | for inference (or use broker mode) |

Everything else has correct Galileo testnet defaults.

**Compute has two real modes** (set `OG_COMPUTE_MODE`):
- `router` — Bearer API key against `router-api.0g.ai` (set `OG_COMPUTE_API_KEY`).
- `broker` — pays via an on-chain ledger funded by `PRIVATE_KEY` (no API key; needs 0G on the compute chain).

## 2. Contracts: test + deploy

```bash
pnpm test:contracts        # 39 tests, all green (no network needed)
pnpm deploy:testnet        # deploys to Galileo, writes contracts/deployments/galileo.json + regenerates ABIs
```

## 3. Level 0 — gate-checks (the de-risking proof)

```bash
pnpm gate:g3   # 0G Storage round-trip
pnpm gate:g2   # Sealed Inference + TEE attestation
pnpm gate:g1   # ERC-7857 mint (needs deploy first)
pnpm gate:g4   # escrow lock → fulfill → settle on 0G Chain
# or:
pnpm gate:all
```

Each prints tx / storage-explorer links — capture these for the Wave 1 submission.

## 4. Level 1 & 2 — CLI demos

```bash
pnpm demo:level1   # create agent + run one task (signed output)
pnpm demo:level2   # create + run + PROVE (session → trace → receipt → reputation)
```

## 5. The dashboard (Levels 1 & 2, in the browser)

```bash
pnpm --filter @nexus/app dev      # http://localhost:3000
```

Create an agent, select it, run a task with the proof loop on, watch the profile
card's score tick up, and click **verify** to see the composite receipt on chainscan.

## Trust model (say this verbatim in the viva)

> The inference is hardware-proven (TEE). The tool log is application-level and
> immutably anchored on 0G Storage + 0G Chain. The re-encryption transfer uses a
> trusted ECDSA signer today, with a TEE/ZKP oracle as the v2 upgrade.
