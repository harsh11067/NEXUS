# input.md — the 3 things only you can provide/decide

Everything else in wave_3.0 Phases A–D is **done and verified** (see `wave_3.0/EXECUTE.md`
status block + `docs/PROOFS.mainnet.md` + `evidence/`). These items are blocked on
credentials/decisions that must come from you.

## 1. Vercel token with real scopes (BLOCKS the live-site redeploy)

The `VERCEL_TOKEN` currently in `.env` (`vck_…`) authenticates as `kumarharsh021`
but **cannot list, create, or manage any project** (every API call returns
`forbidden` / empty). The old project (`nexus-alpha-five-26.vercel.app`, still live,
running the June build) is not visible to it.

**Provide:** a full-access token from https://vercel.com/account/settings/tokens
(scope: the team that owns `nexus-alpha-five-26`), pasted here or into `.env` as
`VERCEL_TOKEN=`. Then the new build (ProofPass + mainnet switch) deploys with:

```bash
npx vercel deploy --prod --token <TOKEN>       # from repo root; project root dir = app
```

## 2. Decision: put the funded mainnet key on Vercel? (BLOCKS mainnet writes on the live URL)

The mainnet **read + verify** surfaces (`/proof/[id]`, `/api/verify`, `/api/badge`,
agents/receipts lists) need **no key** — setting `NEXT_PUBLIC_USE_MAINNET=true` on the
deployment is enough. But browser-triggered **writes** (create/run from the live URL)
need `OG_MAINNET_KEY` in Vercel env — which exposes the funded key (~0.32 0G spendable
+ the 3 0G compute ledger) to anyone hitting the public API.

**Options** (pick one):
- **(a) recommended** — production env: `NEXT_PUBLIC_USE_MAINNET=true` only. Mainnet
  verify surfaces live; demo writes stay on testnet fallback (fully working today).
- **(b)** also add `OG_MAINNET_KEY` + `TRUSTED_SIGNER_KEY` to Vercel env (dashboard →
  Settings → Environment Variables) accepting the burner-level risk. Full mainnet loop
  from the live URL.

## 3. Human-only Wave-3 submission items (from DIY.md — no agent can do these)

- [ ] Record the ≤3-min demo (script in `wave_3.0/WAVE3_SUPERIORITY.md` Part 3);
      mainnet links on screen; **no `.env` visible**. Money-shot: `pnpm demo:transfer`
      output + chainscan. Keep a testnet fallback clip.
- [ ] Public X post with the clip + required tags; link it in the AKINDO submission.
- [ ] Confirm the AKINDO dashboard's Wave-3 dates/fields.
- [ ] Rotate the tokens that sat in `.env` (Render key, GitHub PAT) after submission.

## For reference — what a judge can already verify with zero setup

- Contracts (verified source): https://chainscan.0g.ai/address/0x7D4eD6c120E41a241973760D8aD244f2f9Ec6793
- TEE-verified receipt: re-run `processResponse("0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C", "2cbdf7be-bde2-4317-bb27-50d5e9ae2329")` → `true`
- `OG_NETWORK=mainnet pnpm verify:proofs` re-checks every recorded tx + storage root live.
