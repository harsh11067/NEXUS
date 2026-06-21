# NEXUS — Setup & Run

One repo, one server. The cinematic districts and the on-chain API run from the
same Next.js process. Everything talks to **live 0G Galileo testnet** — no mocks.

---

## 0. Prerequisites (already present on this machine)

- Node 20+ · pnpm 10 · Foundry (`forge`) — for contracts
- `pnpm install` at the repo root

## 1. Configure `.env`

```bash
cp .env.example .env
```

Fill in the one required value:

| Var | What | Required |
|---|---|---|
| `PRIVATE_KEY` | a 0G Galileo key funded at https://faucet.0g.ai | **yes** |

Everything else has correct Galileo defaults. **Compute** is broker mode (`OG_COMPUTE_MODE=broker`):
no API key, the wallet pays a one-time **3 0G** to open the inference ledger — so keep
the wallet at **≥ ~3.2 0G** if you want to run tasks (mint/transfer/clone work with much less).

## 2. Contracts: test + deploy

```bash
pnpm test:contracts          # 39 unit tests, all green (no network)
pnpm deploy:testnet          # deploys to Galileo, writes contracts/deployments/galileo.json, regenerates ABIs
```

> Deployment uses `scripts/deploy.ts` (ethers), because Foundry's broadcaster doesn't
> recognise chain 16602. Same result, fully on-chain.

Current live deployment (executor-enabled, already done):

| Contract | Address |
|---|---|
| NexusAgent (ERC-7857) | `0x8B1BB4B8E6c7c3484FA6DECC360B9FC63dBf2D78` |
| ProofMeshReceipts | `0x1bE84724492C94124F166904E54A3F9e289A4814` |
| NexusEscrow | `0xE85c91123734FEABABF547C5f08b8E433D119BF4` |
| ReputationRegistry | `0xaA2292341aEe457a2dE3f535006A8F47aE5a8625` |
| CompositeReceiptMinter | `0xf6e60F3130774051e12C697cc87682293A0FCDc2` |

### Wallet (MetaMask) — the user owns their agents

Every district shows a **Connect Wallet** pill (top-right). On connect it switches MetaMask to
0G Galileo (`0x40DA`) and asks for one free `personal_sign` (proves key ownership + derives the
encryption pubkey). After that, **mint / clone / transfer are signed by the user's wallet**, so
`ownerOf(agentId)` is the user on chainscan. The server still does encryption / 0G Storage / the
re-encryption oracle / inference (the persona is wrapped to both the user and the oracle). Right
after mint the user signs one `authorizeUsage` so the server can run proven tasks for them.

### The 30-second proof page

`/proof/<receiptId>` (e.g. `/proof/1`) — a public page showing five independently-verifiable rows
(identity, session, TEE attestation, payment, reputation), each linking straight to chainscan / 0G
Storage. `/proof` lists recent receipts. This is the judge artifact: they verify without talking to you.

## 3. Run the whole thing (one command)

```bash
pnpm dev          # dev server  → http://localhost:3000
# or production:
pnpm build && pnpm start
```

Open **http://localhost:3000** → you land in the **NEXUS World** district. Navigate via
the left dock. The districts are now live:

- **SoulMint (Identity)** — fill the persona, advance the forge; the final step runs the
  **real ERC-7857 mint** (encrypt → 0G Storage → mint) and reveals the agentId + chainscan link.
- **Marketplace** — real on-chain agents, tiers and scores. **Hire** runs a proven task;
  **Clone** and **Transfer** execute the real Level-3 flows (royalty, re-encryption, ownership flip).
- **Audit (ProofMesh)** — the real composite receipts / sessions, with a chainscan link.
- **Network / World** — live agent count, receipts, block height from chain.
- **Execution / Treasury** — live feeds derived from real escrow/receipt/clone activity.

The operator console (the plain dashboard) is still available at **/console**.

## 4. Command-line proofs (optional)

```bash
pnpm gate:g3   # 0G Storage round-trip
pnpm gate:g2   # Sealed Inference + TEE attestation
pnpm gate:g1   # ERC-7857 mint
pnpm gate:g4   # escrow lock→fulfill→settle
pnpm demo:level1   # create + run
pnpm demo:level2   # create + run + prove (composite receipt + reputation)
```

## Troubleshooting

- **SoulMint mint says "API client not loaded"** — hard refresh; `nexus-api.js` loads from `/d/`.
- **Inference fails with "open compute ledger … 3 0G"** — fund the wallet past ~3.2 0G.
- **Districts show placeholder numbers** — the API isn't reachable; confirm the server is up and
  you opened the districts via `http://localhost:3000/d/...` (not `file://`).
