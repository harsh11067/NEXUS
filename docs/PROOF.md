# NEXUS — Proof of Work (on-chain)

Every claim below is a transaction you can open in a block explorer. Nothing here
is asserted — it was executed against **0G Galileo testnet (chainId 16602)** and
the links resolve to real state. Proofs were pulled straight from the chain with
[`scripts/gather-proofs.ts`](scripts/gather-proofs.ts), so they always match the
live deployment recorded in [`contracts/deployments/galileo.json`](contracts/deployments/galileo.json).

> Trust model (stated honestly, no overclaim): inference is **hardware-proven**
> (0G Sealed Inference TEE). The tool/trace log is **application-level, immutably
> anchored** on 0G Storage + Chain (not kernel-proven). Re-encryption transfer
> uses a **trusted ECDSA signer (v1)** → TEE/ZKP oracle is v2. On-chain
> attestation is **anchored on-chain, verified off-chain**.

---

## Deployed contracts (0G Galileo, chainId 16602)

| Contract | Address | Role |
|---|---|---|
| **NexusAgent** (ERC-7857) | [`0x8B1BB4B8E6c7c3484FA6DECC360B9FC63dBf2D78`](https://chainscan-galileo.0g.ai/address/0x8B1BB4B8E6c7c3484FA6DECC360B9FC63dBf2D78) | mint · encrypted persona ref · re-encryption transfer · clone w/ royalty · authorizeUsage; `transferFrom` disabled |
| **ProofMeshReceipts** | [`0x1bE84724492C94124F166904E54A3F9e289A4814`](https://chainscan-galileo.0g.ai/address/0x1bE84724492C94124F166904E54A3F9e289A4814) | open/close session · lock policy hash · anchor traceCID + TEE attestation |
| **NexusEscrow** | [`0xE85c91123734FEABABF547C5f08b8E433D119BF4`](https://chainscan-galileo.0g.ai/address/0xE85c91123734FEABABF547C5f08b8E433D119BF4) | native-0G escrow · policy-bound spend · lock→fulfill→settle · TTL refund |
| **ReputationRegistry** | [`0xaA2292341aEe457a2dE3f535006A8F47aE5a8625`](https://chainscan-galileo.0g.ai/address/0xaA2292341aEe457a2dE3f535006A8F47aE5a8625) | proof-only score writes; every change carries a receiptHash |
| **CompositeReceiptMinter** | [`0xf6e60F3130774051e12C697cc87682293A0FCDc2`](https://chainscan-galileo.0g.ai/address/0xf6e60F3130774051e12C697cc87682293A0FCDc2) | ties session (+optional payment) into one receipt; bumps reputation |
| Operator / trusted signer | [`0x2f737521b9b59c202e7d33509C5746A58D795870`](https://chainscan-galileo.0g.ai/address/0x2f737521b9b59c202e7d33509C5746A58D795870) | server signer + re-encryption oracle |

`forge test` → **39/39 passing.**

---

## Level 0 — Foundations (gate-checks G1–G4)

- **G1 · ERC-7857 mint** — see Level 1 mints below; `ownerOf` / `policyHash` / `cipherRef` verified on-chain.
- **G2 · Sealed Inference (TEE)** — `verified === true` from `broker.inference.processResponse()`; the attestation is anchored in each `SessionClosed` below. **Hardware-proven.**
- **G3 · 0G Storage** — every persona + trace is an encrypted blob round-tripped through 0G Storage (`storagescan-galileo.0g.ai`); referenced by `cipherRef` / `traceCID` on each token and receipt.
- **G4 · Escrow lock→fulfill→settle** — see Level 3 escrow proofs below.

## Level 1 — Identity + Sealed Inference (mint → run)

ERC-7857 agents minted (encrypted persona on 0G Storage, owner = on-chain):

| Agent | Mint tx |
|---|---|
| #1 | [`0x6b07f989…1011ce`](https://chainscan-galileo.0g.ai/tx/0x6b07f9890ef3a9aea9e1d0d77db3d49ecdf5b2d96b2acd9519600e0a0b1011ce) |
| #3 | [`0x42aa4b18…04b7f`](https://chainscan-galileo.0g.ai/tx/0x42aa4b18f2edff01026dae297f9dafe86955756b708b889abfc0312b82e04b7f) |
| #6 | [`0xccaf21c6…696a72`](https://chainscan-galileo.0g.ai/tx/0xccaf21c61b2a55c7d017abbea22397e950cbe1d794692802a62ea81eb2696a72) |
| #7 | [`0x54f00db2…f3f2c85`](https://chainscan-galileo.0g.ai/tx/0x54f00db2bc3a4291e9c9961f56cfb7408a447c3c0171c77d09146a11df3f2c85) |
| #8 | [`0x767bfa72…7c8124b`](https://chainscan-galileo.0g.ai/tx/0x767bfa7220b77968a7952af269c821bda4d4c957bc9776732cd0e4aff7c8124b) |
| #9 | [`0xcda0173d…51bdc64`](https://chainscan-galileo.0g.ai/tx/0xcda0173dc9fdc268b1ddf63cf4fa35229609899f5898051eb500c44bc51bdc64) |

## Level 2 — Proof loop (session → trace → composite receipt → reputation)

Each task opens a session (locks the policy hash), runs Sealed Inference, encrypts
the trace to 0G Storage, closes the session with the **traceCID + TEE attestation**,
then mints a composite receipt that ticks reputation — traced to the receiptHash.

**Sessions closed (trace + TEE attestation anchored):**
- [`0xce3e9f55…d05ade9`](https://chainscan-galileo.0g.ai/tx/0xce3e9f55e9697ca3eab989f845492d1010818bc773edef8cf5882e448d05ade9)
- [`0x20adb33e…00db3bd`](https://chainscan-galileo.0g.ai/tx/0x20adb33e190909dbabdaad977f0ca13079dc87ef5cf15e76ff804b51b00db3bd)
- [`0x908c043e…b70d5c`](https://chainscan-galileo.0g.ai/tx/0x908c043e04365424151449015fbfa2e016a6f06e5591c63a8c254081c4b70d5c)
- [`0xc692a607…8a2058`](https://chainscan-galileo.0g.ai/tx/0xc692a607eda5e73bceffc566b72edd457bfb671cfeecbe9e86a9613f1f8a2058)

**Composite receipts minted (reputation derived from proofs):**

| Receipt | Agent | Mint tx |
|---|---|---|
| #1 | #1 | [`0xf1ae7df1…1ace37d`](https://chainscan-galileo.0g.ai/tx/0xf1ae7df145d83b06aaa7ec34c70017526d912edf680f51bec1b74b7621ace37d) |
| #2 | #1 | [`0xca3af42a…659ea17`](https://chainscan-galileo.0g.ai/tx/0xca3af42a778a2dd5170fa70b5a2f628f8fe8a1f7f3fb9ffc1c04433d4659ea17) |
| #3 | #2 | [`0x48f8eeb3…459e7c`](https://chainscan-galileo.0g.ai/tx/0x48f8eeb3dedd1bcdce441429489e688c7cc196a53a095f90088cd74d44459e7c) |
| #4 | #9 | [`0xabc354bd…76677b`](https://chainscan-galileo.0g.ai/tx/0xabc354bddf3d096df4b431acc39cf0cc554b7be72eade1e711022d6b4576677b) |

Each receipt is independently inspectable as a 5-fact proof bundle at `/proof/<receiptId>`
(identity · session · TEE · payment · reputation), every fact linking to chainscan.

## Level 3 — Ownership economy (clone · transfer · escrow-paid task)

**Clones with royalty + re-encryption** (clone owns an independent encrypted brain;
parent's clone count increments):

| Clone | Tx |
|---|---|
| #1 → #2 | [`0xde13271a…3ce37be`](https://chainscan-galileo.0g.ai/tx/0xde13271a1ecbef0286b823876b3300192a7d41f342019445aa2b028aa3ce37be) |
| #3 → #4 | [`0x0863975d…f512e84`](https://chainscan-galileo.0g.ai/tx/0x0863975dffe6cf8c7ae850549fef19c9524fe4c528ca60ee3be805c74f512e84) |
| #3 → #5 | [`0x9bba24a4…8b19ad8d`](https://chainscan-galileo.0g.ai/tx/0x9bba24a462e53f2885361ed4a4a9a0e95842074942af1129a1e19f808b19ad8d) |

**Ownership transfer via re-encryption** — agent #1 transferred to a **different
wallet** `0xa78a4961…`; the persona was re-encrypted for the buyer's pubkey and
the old owner provably loses access (ERC-7857 `finalizeTransfer`, trusted-signer v1):

- [`0x8e5d9468…5756f75`](https://chainscan-galileo.0g.ai/tx/0x8e5d94689a2032a9f521124b44f516079f30ecf83baf8e93e56c3a73b5756f75) → new owner [`0xa78a4961…`](https://chainscan-galileo.0g.ai/address/0xa78a496142b9E8ea4432D00778817353D7831534)

**Escrow-paid task (policy-bound, native 0G)** — funds locked under the agent's
policy, merchant submits fulfillment, structural check passes, settled to merchant:

- Lock: [`0x24a1778d…45ad82db`](https://chainscan-galileo.0g.ai/tx/0x24a1778dafe4b8fd0ef32af0034c36561956e6a08be3a3bea905178245ad82db)
- Settle: [`0x1115d3b0…65bb3a91fa`](https://chainscan-galileo.0g.ai/tx/0x1115d3b051ac8f729b0ce5a06845adea59586e5a25de6cfad6bbf765bb3a91fa)

---

## Reproduce these proofs yourself

```bash
# 1. read state straight from chain (no key needed for reads)
npx tsx scripts/gather-proofs.ts

# 2. or hit the running app
pnpm dev      # http://localhost:3000
curl localhost:3000/api/network        # agent + receipt counts, head block
curl localhost:3000/api/agents         # live cards: tier, score, clones, owner
curl localhost:3000/api/receipts/1     # 5-fact proof bundle for receipt #1
```

All addresses, RPC, and explorer URLs are in `.env.example` / `SETUP.md`.
