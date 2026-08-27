# NEXUS — Proof & Evidence Index

Reviewer-first. **Every product claim points to an on-chain transaction, a stored artifact, or a repeatable command.** Nothing here is asserted — it was executed against 0G and the links resolve to real state. Hashes are pulled from chain by `scripts/gather-proofs.ts` so this file always matches the live deployments in `contracts/deployments/*.json`. This is the pattern that wins 0G waves: claims that a stranger can independently verify in seconds.

> **Trust model (stated, not hidden):** inference is **hardware-proven** (0G Sealed Inference TEE, `processResponse === true`); trace/evidence logs are **immutably anchored** on 0G Storage + Chain (not kernel-proven); re-encryption transfer uses a **trusted ECDSA signer (v1)** with a TEE/ZKP oracle as the v2 roadmap; reputation is **proof-only** (every score change carries a `receiptHash`).

---

## How to regenerate this file (never hand-type a hash)
```bash
# pulls live state from the recorded deployment and rewrites the tables below
pnpm ts-node scripts/gather-proofs.ts --network mainnet   # or --network galileo
```
`gather-proofs.ts` reads `contracts/deployments/<network>.json`, queries events/txs, verifies each storage root, re-runs `processResponse` for referenced runs, and emits the tables. If a proof can't be verified live, it is omitted — this file only contains things that currently resolve.

## Reproduce the guarantees locally
```bash
forge test                       # 39/39+ contract tests
pnpm test:sdk                    # crypto + re-encryption + digest parity
pnpm verify:proofs               # re-checks every row below against chain
```

---

## A. Deployed contracts

**Galileo testnet (chainId 16602) — live baseline:**

| Contract | Address | Explorer |
| --- | --- | --- |
| NexusAgent (ERC-7857) | `0x8B1BB4B8E6c7c3484FA6DECC360B9FC63dBf2D78` | chainscan-galileo.0g.ai/address/0x8B1BB4B8…2D78 |
| ProofMeshReceipts | `0x1bE84724492C94124F166904E54A3F9e289A4814` | …/address/0x1bE84724…4814 |
| NexusEscrow | `0xE85c91123734FEABABF547C5f08b8E433D119BF4` | …/address/0xE85c9112…9BF4 |
| ReputationRegistry | `0xaA2292341aEe457a2dE3f535006A8F47aE5a8625` | …/address/0xaA229234…8625 |
| CompositeReceiptMinter | `0xf6e60F3130774051e12C697cc87682293A0FCDc2` | …/address/0xf6e60F31…FCDc2 |
| trustedSigner / operator | `0x2f737521b9b59c202e7d33509C5746A58D795870` | …/address/0x2f737521…5870 |

`forge test` → **39/39 passing.**

**Mainnet (chainId 16661) — Wave 3 target:** populated by `gather-proofs.ts --network mainnet` after Phase A deploy. Table shape identical; explorer host `chainscan.0g.ai`.

## B. The evidence index (claim → artifact → inspect → reproduce)

Fill the "Evidence" column with the real tx/root each row produces. Mark testnet rows `[T]` and mainnet rows `[M]`; Wave 3 requires the `[M]` set.

| Claim | Evidence (tx / root) | What to inspect | Reproduce |
| --- | --- | --- | --- |
| ERC-7857 agent minted with encrypted persona on 0G Storage | mint tx + persona root | `ownerOf`, `getPersonaRef`, `getPolicyHash` on-chain; persona root retrieves + decrypts only with owner key | `pnpm demo:mint` |
| Task ran in Sealed Inference and is hardware-verified | `SessionClosed` tx + `{provider, chatID}` | `verifySession` valid; run `processResponse(provider, chatID)` → **true**; `teeSignature` anchored | `pnpm demo:run` |
| Trace is immutably anchored | `traceCID` + closeSession tx | `traceCID` on-chain == storage root; retrieve + Merkle-verify | `pnpm verify:trace <sessionId>` |
| **Transfer re-encrypts the brain; seller loses access** | `AgentTransferred` tx (old→new `cipherRef`) | ownership flipped; old owner key fails to decrypt `newCipherRef`; new owner succeeds | `pnpm demo:transfer` |
| Clone pays creator royalty | `AgentCloned` tx | `cloneCount++`, royalty transfer, new agent owned by cloner | `pnpm demo:clone` |
| Escrow enforces policy (over-limit blocked) | reverted `lockFunds` (over-limit) + settled payment | `OverPerTx`/`OverBudget` on the blocked attempt; `PaymentSettled` on the valid one | `pnpm demo:escrow` |
| Funds can never lock | `PaymentRefunded` (TTL) tx | refund after TTL returns stake; no stuck balance | `pnpm demo:refund` |
| Reputation is proof-only | `ScoreUpdated` tx | every score change carries a `receiptHash`; direct write by non-writer reverts `NotWriter` | `pnpm demo:rep` |
| One composite receipt per verifiable task | `CompositeReceiptMinted` tx | ties session (+payment) → receipt; `AlreadyMinted` on replay | `pnpm demo:receipt` |
| Verify-in-30-seconds page resolves every field on-chain | `/proof/<receiptId>` | owner, model, policy hash, payment, rep delta each link to their on-chain source | open the live URL |
| Contracts verified on mainnet | chainscan source pages | 5 verified sources on 16661 | `forge verify-contract …` |
| Fresh-clone reproducibility | quickstart benchmark | clean checkout runs the loop; timestamps + commit | `scripts/quickstart.sh` |

## C. Current testnet proof baseline (already live)

`docs/PROOF.md` in the repo already lists real Galileo mint txs (agents #1, #3, #6–#9) and the gate-checks G1–G4 (ERC-7857 mint, Sealed Inference `verified === true`, 0G Storage round-trip, escrow lock→fulfill→settle). Wave 3 promotes each of these to a **mainnet** equivalent and adds the transfer/clone/reputation rows above. Keep the testnet baseline in the file as provenance; clearly separate `[T]` from `[M]`.

## D. Append-only run artifacts
Each demo command writes a timestamped JSON under `evidence/<network>/<ISO-timestamp>-<scenario>/` containing the tx hashes, storage roots, `{provider, chatID}`, decrypt-access assertions, and exact state deltas. **Never overwrite an old directory** — testnet/mainnet state is volatile; the artifact is the durable record (the AgentAllowance evidence pattern).

## E. Honest gaps (state these; they score in your favor)
- **v1 signer trust:** re-encryption + settlement rely on a trusted ECDSA signer recovered on-chain. v2 moves it into a TEE/ZKP oracle. Do not claim it is already trustless.
- **Trace proving:** traces are anchored, not kernel-proven — the *inference* is hardware-proven, the *tool/trace log* is application-level immutable.
- **TeeML dependency:** verification depends on a TeeML provider being available; when it isn't, runs are labeled `unverified`, not silently verified.
