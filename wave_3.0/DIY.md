# NEXUS — DIY Checklist (things you must personally do/verify)

These are the steps a coding agent **cannot** do for you — they need your wallet, your keys, your accounts, or a human eyeball on live network state. Everything else in `PLAN.md` is executable by Fable/Opus. Do these yourself, in order. Check each box before the Wave 3 deadline.

---

## 1. Wallet + funds (blocks everything)
- [ ] Fund a **mainnet** key with ~0.05–0.1 0G (deploy + demo txs). Bridge/acquire real 0G; the testnet faucet does NOT fund mainnet.
- [ ] Keep a separate **testnet** key funded from `faucet.0g.ai` (~0.1 0G/day) for the fallback demo.
- [ ] Fund the **0G Compute broker ledger**: ≥ **3 0G** to open the ledger, ≥ **1 0G** transferred per provider sub-account. Keep it topped (fees settle in delayed batches, so balance drops in lumps).
- [ ] Optionally fund a **second key** ("the buyer") for the transfer demo, so the re-encryption money-shot uses two real accounts, not an ephemeral one.

## 2. The two live checks (never trust a doc)
- [ ] `cast chain-id --rpc-url https://evmrpc.0g.ai` → must print **16661**. Put that in config; abort if it differs.
- [ ] Confirm your Sealed Inference provider is **TeeML** (not TeeTLS): `0g-compute-cli inference verify --provider <ADDR>`. TeeTLS cannot back the "hardware-verified" claim — if only TeeTLS is available on mainnet, decide consciously whether to label runs `unverified` and say so in the demo.
- [ ] Confirm the AKINDO dashboard's Wave 3 dates, required tags/hashtags, and submission fields — the program brief you have may not match the live dashboard.

## 3. Mainnet deploy (you run it, you hold the key)
- [ ] Deploy all 5 contracts to 16661 with `--evm-version cancun`; save output to `contracts/deployments/mainnet.json`.
- [ ] `ReputationRegistry.setWriter(CompositeReceiptMinter, true)` (and any other proof emitter) on mainnet — reputation writes fail without this.
- [ ] Set the mainnet `trustedSigner` to the key your oracle service actually uses; confirm `NexusAgent.setSigner` matches it (transfers/clones fail on `BadSignature` otherwise).
- [ ] Verify all 5 sources on chainscan; open each page and eyeball that source shows.

## 4. Real 0G stack sanity (human eyeball on live state)
- [ ] Do one **real mainnet mint** and confirm on chainscan: `ownerOf`, `getPersonaRef`, `getPolicyHash`.
- [ ] Upload one **encrypted persona** to mainnet turbo storage; wait 3–5 min; retrieve by root and confirm it decrypts **only** with the owner key.
- [ ] Run one **real inference**; confirm `processResponse` returns `true`; confirm the `teeSignature` is anchored in `SessionClosed`.
- [ ] Do one **real transfer** with the buyer key; personally confirm the **seller key can no longer decrypt** the new cipherRef. This is the claim judges probe hardest — verify it with your own eyes.
- [ ] Do one **real escrow** lock→fulfill→settle and one over-limit attempt; confirm the over-limit reverts.

## 5. The demo (only you can record it)
- [ ] Record ≤3 min: create → run (show verify chip) → **transfer money-shot (seller loses access)** → verify-in-30s page → reputation tick. Mainnet contract links on screen.
- [ ] Have a **testnet fallback clip** ready in case mainnet is congested during recording.
- [ ] No private keys, seed phrases, or `.env` contents visible on screen at any point.
- [ ] Host public (YouTube/Loom); put the link in the AKINDO submission + README.

## 6. Proof hygiene (you decide what's real)
- [ ] Run `gather-proofs.ts --network mainnet` and confirm every row in `PROOFS.md` resolves on chainscan — delete any row that doesn't.
- [ ] Confirm append-only evidence dirs are committed and none were overwritten.
- [ ] Personally re-run one `processResponse` from the published `{provider, chatID}` as a judge would, and confirm `true`.

## 7. Live product + distribution
- [ ] Confirm the live URL loads for a stranger with no setup (test in an incognito window / borrowed device).
- [ ] Consider a custom domain (winners used `0gents.shop`, `agentallowance-console.onrender.com`) — a real domain reads as a real product.
- [ ] Post the mandatory X update with the clip + required tags; keep a thread (post 2 = transfer money-shot, post 3 = verify-in-30s) to seed Wave 4–5 social proof early.

## 8. Security + secrets (do not skip)
- [ ] Grep the built frontend bundle for any `PRIVATE_KEY` / signer leakage before deploying the site (`L-09`). Server-only keys must never ship to the browser.
- [ ] Run Slither on the contracts; triage every high/medium before mainnet.
- [ ] Rotate any key that ever touched a screen recording or a shared `.env`.
- [ ] Set sane escrow min/max bounds on mainnet so a fat-finger can't lock large funds.

## 9. Known operational gotchas (from the repo audit)
- [ ] **Port conflict:** a `next-server` may already hold `:3000` → run dev on an alt port (`npx next dev -p 3005`).
- [ ] **Broker deposit minimum:** some nodes require the 3 0G ledger minimum even if the code requests less — keep the operator wallet ≥ ~3.2 0G or switch to router mode with an API key.
- [ ] **Storage propagation:** don't test retrieval immediately after upload — wait 3–5 min or the fetch legitimately fails.
- [ ] **Chain-id drift in docs:** 0G's own docs disagree on the testnet id (16601 vs 16602); your testnet is empirically 16602 (you have live txs) — keep it, but always probe `eth_chainId`.

## 10. Before you hit submit
- [ ] `forge test` green (39/39+), `pnpm verify:proofs` green.
- [ ] All 5 mainnet contracts verified; `PROOFS.md` regenerated and every link opens.
- [ ] Demo video + X post live; README quick-start works from a clean clone.
- [ ] Trust model stated in the demo and the README — say exactly where guarantees start and stop.
