# input.md — what still needs YOU (updated 2026-09-01)

Everything machine-doable is **done and verified**: production is live on mainnet at
https://nexus-alpha-five-26.vercel.app, the ERC-8004 layer + deterministic replay +
offline bundles are proven on 0G mainnet (see `NEXUS_UP/PLAN_NEXT.md` STATUS,
`NEXUS_UP/PROOF_NEXT.md`, `docs/PROOFS.mainnet.md`, `evidence/mainnet/`).

## ✅ Resolved since last time
- **Vercel token** — `VERCEL_TOKEN_main` (vcp_…) works; production redeployed from this
  repo. The live URL now serves the mainnet build (chainId 16661, verified addresses,
  ProofPass, `/agent/[id]`, `/leaderboard`, replay, bundles).
- **Mainnet key on Vercel** — option (a) executed per your instruction: production env
  is `NEXT_PUBLIC_USE_MAINNET=true` only. Mainnet writes now REQUIRE `OG_MAINNET_KEY`
  in code (no fallback to the testnet key), so the deployment is cleanly read-only +
  verify-everything. Browser-triggered mainnet writes stay off unless you ever add
  `OG_MAINNET_KEY` to Vercel env (not recommended).

## 1. Vercel env hygiene (2 minutes, dashboard or CLI)
The 18 stale June env vars (incl. `PRIVATE_KEY`, `BUYER_PRIVATE_KEY` testnet keys) are
still stored on the Vercel project. The code now ignores all of them, but they should
be deleted for hygiene. My session was permission-blocked from bulk-deleting env vars,
so run it yourself — either in the dashboard (Project → Settings → Environment
Variables → delete everything except `NEXT_PUBLIC_USE_MAINNET`) or:

```bash
for K in PRIVATE_KEY BUYER_PRIVATE_KEY OG_RPC_URL OG_CHAIN_ID OG_EXPLORER_URL \
  OG_STORAGE_INDEXER OG_STORAGE_EXPLORER OG_FLOW_CONTRACT OG_COMPUTE_MODE \
  OG_COMPUTE_ROUTER_URL OG_COMPUTE_MODEL OG_COMPUTE_RPC_URL OG_COMPUTE_DEPOSIT \
  PROOFMESH_ADDRESS NEXUS_AGENT_ADDRESS REPUTATION_ADDRESS COMPOSITE_MINTER_ADDRESS \
  NEXUS_ESCROW_ADDRESS; do
  npx vercel env rm "$K" production --yes --token <VERCEL_TOKEN_main>
done
```

## 2. Testnet compute ledger (unblocks full testnet parity)
Mainnet is fully proven. On Galileo, registration + validationRequest are proven, but
answering the validation needs a sealed run, and the testnet operator
(`0x01239786Ac8c9D78F8055045d7a3e7E18e5492DA`, balance 0.96 0G) can't open the 3 0G
compute ledger. **Faucet it ~2.5 0G** (https://faucet.0g.ai, captcha), then:

```bash
OG_NETWORK=galileo pnpm demo:validate "" 10 && OG_NETWORK=galileo pnpm demo:replay
```

## 3. Publish `@nexus/sdk` to npm (platform-intent signal, FEATURES.md #13)
Needs your npm account: `cd packages/sdk && npm publish --access public` (pick the
scope/name you own). Everything judges need works without it.

## 4. Optional: 0G Pay fiat onboarding (PLAN_NEXT N5)
Requires a 0G Pay developer account + card test — your call whether to pursue for the
traction waves. Nothing in the current submission depends on it.

## 5. Human-only submission items
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
