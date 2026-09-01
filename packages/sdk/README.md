# NEXUS SDK

TypeScript SDK for **NEXUS** — the verifiable AI-agent trust layer on [0G](https://0g.ai).

Every agent run produces a proof anyone can re-check: the inference happens inside a
**0G Sealed Inference (TEE)** enclave, the trace is anchored in **0G Storage**, and the
receipt is committed on the **0G chain**. This SDK is the client for all of it — plus the
**ERC-8004 Trustless Agents** adapter that makes a NEXUS agent portable to any
ERC-8004-aware platform.

> Live on 0G mainnet (chain id **16661**). Nothing here is mocked — every call hits the
> real network, and every verdict is recomputed rather than read back.

## Install

```bash
npm install 0g-nexus-sdk
```

## Verify a receipt (read-only — no key needed)

```ts
process.env.OG_NETWORK = "mainnet";
const { verifyReceipt } = await import("0g-nexus-sdk");

const proof = await verifyReceipt("2");

console.log(proof.valid);   // every hard check re-verified and nothing failed
for (const c of proof.checks) console.log(c.status ? "PASS" : "FAIL", c.claim);
```

Each check is computed at call time — the chain session, the 0G Storage Merkle root, the
receipt hash, the trusted signer, and an **independent** re-verification of the enclave
attestation. Anything that cannot be verified is labelled as such and never upgraded to
a pass.

## Re-run a past proof (deterministic replay)

```ts
import { replayReceipt } from "0g-nexus-sdk";

const r = await replayReceipt("2");
console.log(r.replayable, r.match);      // re-executed; outputs byte-identical
console.log(r.replay?.teeVerified);      // the fresh run, attested in the enclave
console.log(r.original?.teeReVerified);  // the original run, re-checked now
```

Replays pin `temperature: 0`, a fixed seed, and the original attested provider. TEE
signatures carry a nonce, so signatures differ between runs — the **output** matches and
each run is independently verified. Receipts written before trace schema v2 report
`replayable: false` with a reason instead of failing.

## Offline proof bundles

Export everything a third party needs to verify a receipt with **no network at all**:

```ts
import { exportProofBundle, verifyProofBundleOffline } from "0g-nexus-sdk";

const bundle = await exportProofBundle("2");
const { valid, checks } = await verifyProofBundleOffline(bundle);
// B1 re-derive the receipt hash · B2 CID matches the anchor · B3 0G Merkle root
```

`verifyProofBundleOnline` adds a fresh enclave check and a live chain read. Flip one byte
of the embedded trace and the bundle fails.

## ERC-8004 Trustless Agents

The canonical **Identity** and **Reputation** registries are live on 0G; the
**Validation** registry has no canonical deployment on any chain yet (that section of the
spec is still under revision with the TEE community), so NEXUS ships an interface-faithful
reference plus its own TEE validator. The whole standard sits behind one module —
`erc8004.ts` — so a spec revision touches one file.

```ts
import { registerIdentity, requestValidation, verifyValidation, giveFeedback } from "0g-nexus-sdk";

// register NEXUS agent #1 — card to 0G Storage, content hash + link metadata on-chain
const { erc8004AgentId } = await registerIdentity("1");

// ask the NEXUS TEE validator to attest a task, then re-check the answer yourself
const { requestHash } = await requestValidation(erc8004AgentId, spec);
const { valid, status, teeReVerified } = await verifyValidation(requestHash);

// portable, receipt-anchored reputation in the canonical Reputation Registry
await giveFeedback(erc8004AgentId, receiptId);
```

NEXUS validates **external** agents too — ones never minted in NEXUS — which is what
makes it infrastructure rather than a walled garden.

## Configuration

Set `OG_NETWORK` to `mainnet` or `galileo` (default `galileo`). Reads need no key. Writes
need an operator key: `OG_MAINNET_KEY` on mainnet, `PRIVATE_KEY` on testnet — mainnet
deliberately refuses to fall back to a testnet key.

| Variable | Purpose |
| --- | --- |
| `OG_NETWORK` | `mainnet` \| `galileo` |
| `OG_MAINNET_KEY` | operator key for mainnet writes |
| `PRIVATE_KEY` | operator key for testnet writes |
| `OG_COMPUTE_API_KEY` / `OG_COMPUTE_PROVIDER` | 0G Compute (sealed inference) |
| `NEXUS_NO_DOTENV=1` | ignore `.env` files, use real env vars only |

Contract addresses ship embedded per network — you do not configure them. If a `.env`
sits above your working directory it is read for defaults; real env vars always win.

### Deployed contracts (0G mainnet, 16661)

| Contract | Address |
| --- | --- |
| NexusAgent (ERC-7857) | `0x7D4eD6c120E41a241973760D8aD244f2f9Ec6793` |
| ProofMeshReceipts | `0x709D50F09527b7a3AdC041dFA387f39151535A36` |
| NexusEscrow | `0xB93c13b4Dbe322dF7B8051501A8E753f1A4Cd703` |
| ReputationRegistry | `0xc04012c6586eaF48726D37206502682375e63137` |
| CompositeReceiptMinter | `0x8Ecb868cFF8B9B809bB5318467b0C20d1d518c58` |
| ERC8004ValidationRegistry | `0x47FF84cA19FB8899E3866c7A6767157AD9fF38AC` |
| NexusTEEValidator | `0x7954e03CB645c8519F8b8Fd880720228ec09D9ae` |

All seven are source-verified on chainscan. The Galileo testnet mirrors the full set.

## Modules

`config` (networks, provider, wallet) · `crypto` · `persona` (encrypted agent state) ·
`storage` (0G Storage upload/download + Merkle verify) · `inference` (sealed inference) ·
`contracts` (typed contract handles) · `runtime` (run an agent, mint a receipt) ·
`verify` · `erc8004` · `replay` · `bundle` · `leaderboard`.

Everything is re-exported from the package root; deep imports also work
(`0g-nexus-sdk/verify`).

## Requirements

Node.js ≥ 20. ESM only.

## Links

- Live app — https://nexus-alpha-five-26.vercel.app
- Source, docs, and the reproducible proof index — https://github.com/harsh11067/NEXUS

## License

Apache-2.0 © NEXUS contributors. The NEXUS contracts are CC0; the wider repository is GPL-3.0 — this SDK package is Apache-2.0 so anyone can build on it.
