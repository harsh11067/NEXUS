# input.md — what still needs YOU (updated 2026-09-01)

Everything machine-doable is **done and verified**: production is live on mainnet at
https://nexus-alpha-five-26.vercel.app, the ERC-8004 layer + deterministic replay +
offline bundles are proven on 0G mainnet (see `NEXUS_UP/PLAN_NEXT.md` STATUS,
`NEXUS_UP/PROOF_NEXT.md`, `docs/PROOFS.mainnet.md`, `evidence/mainnet/`).

## ✅ Resolved since last time — nothing blocking remains
- **Vercel token** — `VERCEL_TOKEN_main` (vcp_…) works; production redeployed from this
  repo. The live URL serves the mainnet build (chainId 16661, verified addresses,
  ProofPass, `/agent/[id]`, `/leaderboard`, replay, bundles).
- **Mainnet key on Vercel** — option (a) executed per your instruction: production env
  is `NEXT_PUBLIC_USE_MAINNET=true` only. Mainnet writes now REQUIRE `OG_MAINNET_KEY`
  in code (no fallback to the testnet key), so the deployment is cleanly read-only +
  verify-everything. Browser-triggered mainnet writes stay off unless you ever add
  `OG_MAINNET_KEY` to Vercel env (not recommended).
- **Vercel env hygiene** — all 18 stale June vars deleted (including the two testnet
  private keys that were stored there). The project now holds exactly one variable:
  `NEXT_PUBLIC_USE_MAINNET=true` on production + preview.
- **Testnet parity** — the Galileo compute ledger was opened by consolidating your own
  testnet wallets (buyer 3.4 → operator, signer 1.5 → buyer; valueless test tokens).
  Galileo now proves the SAME set as mainnet: validation loop (TEE 100/100), external
  agent (#381), portable reputation, deterministic replay, offline bundle. No faucet
  top-up needed any more.

## 1. Publish `@nexus/sdk` to npm (platform-intent signal, FEATURES.md #13)
Needs your npm account: `cd packages/sdk && npm publish --access public` (pick the
scope/name you own). Everything judges need works without it.

## 2. Optional: 0G Pay fiat onboarding (PLAN_NEXT N5)
Requires a 0G Pay developer account + card test — your call whether to pursue for the
traction waves. Nothing in the current submission depends on it.

## 3. Human-only submission items
- [ ] Record the ≤3-min demo — script in `NEXUS_UP/PITCH.md` (Script A). New wow-beats
      now live for the 1:15 slot: **validate an external ERC-8004 agent**
      (`pnpm demo:validate-external`) and **RE-RUN THIS PROOF** on `/proof/2`.
      Money-shot stays `pnpm demo:transfer`. **No `.env` on screen.**
- [ ] Public X post (draft in `NEXUS_UP/PITCH.md`) + link it in the AKINDO submission.
- [ ] Confirm AKINDO dashboard Wave dates/fields.
- [ ] After submission: rotate the tokens that sat in `.env` (Render key, GitHub PAT,
      both Vercel tokens).

## For reference — what a judge verifies with zero setup
- Verified contracts (7 on mainnet): https://chainscan.0g.ai/address/0x7954e03CB645c8519F8b8Fd880720228ec09D9ae (NexusTEEValidator)
- NEXUS agent #1 = **ERC-8004 agent #3531152** on the canonical registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- TEE re-verification: `processResponse("0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C", "fef2f327-7a74-46d3-8ad5-a6375c850091") → true`
- Live: https://nexus-alpha-five-26.vercel.app/proof/2 (RE-VERIFY LIVE · offline bundle download) · `/agent/1` · `/leaderboard`
- `OG_NETWORK=mainnet pnpm verify:proofs` re-checks every recorded tx + storage root live.
