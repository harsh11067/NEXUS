# NEXUS — Complete Technical Idea Document
### The first verifiable AI agent marketplace: own, train, audit, pay, rate, and trade agents you can provably trust

> **Version:** 0G Bridge Buildathon — Wave 1 Submission Brief  
> **Stack:** ERC-7857 · TEE (0G Compute) · x402 / 0G Pay · eBPF · 0G Storage · 0G Chain · 0G DA  
> **One sentence:** NEXUS is the trust primitive that the agent economy is missing — identity you own, actions you can prove, payments you can verify, reputation you can trust.

---

## Table of Contents

1. [The Four Technologies — From First Principles](#1-the-four-technologies)
2. [How an AI Agent Gets Trained and Loaded](#2-how-an-ai-agent-gets-trained-and-loaded)
3. [The Full Idea: NEXUS Architecture](#3-the-full-idea-nexus-architecture)
4. [The Three Layers Explained](#4-the-three-layers)
5. [Agent Rating System — the Soul of the Marketplace](#5-agent-rating-system)
6. [Complete Data Flow: One Task, All Layers](#6-complete-data-flow)
7. [Smart Contract Architecture](#7-smart-contract-architecture)
8. [Wave-by-Wave Build Plan](#8-wave-by-wave-build-plan)
9. [What Makes This Unbeatable](#9-moats)
10. [Tech Stack Summary](#10-tech-stack)

---

## 1. The Four Technologies

### 1A — ERC-7857: Identity that IS the intelligence

**What normal NFTs (ERC-721) do wrong for agents:**

| Problem | Why it breaks agents |
|---|---|
| Metadata is a URL pointer | Anyone can copy-paste the URL. You "own" a receipt, not the agent. |
| Transfer moves the token, not the data | Buyer gets the NFT shell. Seller's server still runs the model. |
| No encryption of intelligence | System prompt, memory, training — all public. Zero IP protection. |
| No re-encryption on transfer | No cryptographic proof seller lost access. Trust requires a middleman. |

**What ERC-7857 adds (the three capabilities no other standard has):**

```
┌─────────────────────────────────────────────────────────────────┐
│  ERC-7857 = ERC-721 base  +  3 new mechanisms                  │
│                                                                  │
│  1. ENCRYPTED OWNERSHIP                                          │
│     Agent's brain (prompt, memory, weights) encrypted with      │
│     owner's public key. Stored on 0G Storage as cipher blob.    │
│     The token on-chain holds only the storage reference CID.    │
│                                                                  │
│  2. TRUSTLESS TRANSFER (oracle re-encryption)                    │
│     On transfer: oracle re-wraps the cipher key for buyer's     │
│     pubkey WITHOUT ever seeing the plaintext. Seller's key      │
│     is invalidated. Cryptographically proven, no middleman.     │
│                                                                  │
│  3. CLONE (with royalty)                                         │
│     Create a copy of the agent with a new encrypted blob.       │
│     Original creator earns royalty on every clone.              │
│     Clone is independent — has its own agentId, own memory.     │
└─────────────────────────────────────────────────────────────────┘
```

**The ERC-7857 interface (actual Solidity):**

```solidity
interface IERC7857 is IERC721 {
    // Transfer agent with re-encryption of its intelligence
    function transfer(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata sealedKey,   // buyer's pubkey-encrypted session key
        bytes calldata proof        // oracle proof of valid re-encryption
    ) external;

    // Clone agent — new tokenId, same encrypted intelligence, royalty to creator
    function clone(
        address to,
        uint256 tokenId,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external returns (uint256 newTokenId);

    // Authorize another contract/executor to USE the agent (not own it)
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions   // JSON policy: budget, tools, TTL
    ) external;
}
```

**Re-encryption oracle — the hard part most teams skip:**

The re-encryption oracle is a TEE-based service that:
1. Receives the current cipher blob reference + buyer's public key
2. Fetches the cipher blob from 0G Storage
3. Re-wraps the symmetric encryption key under the buyer's public key
4. Returns `newCipherRef` (new blob stored to 0G Storage) + a ZKP/TEE proof
5. Never sees the plaintext — mathematically impossible even for the oracle operator

The 0G chain contract verifies the oracle's proof on-chain before updating token ownership. No proof = no transfer.

**Transfer sequence:**

```
Seller calls transfer(agentId, buyerAddr, buyerPubKey)
     │
     ▼
0G Chain emits ReEncryptionRequest(agentId, oldCipherRef, buyerPubKey)
     │
     ▼
Oracle TEE picks up request:
  - Fetches cipher blob from 0G Storage
  - Re-wraps key for buyerPubKey (never decrypts plaintext)
  - Stores newCipherBlob to 0G Storage → newCipherRef
  - Signs proof with enclave key
     │
     ▼
Oracle calls finalizeTransfer(agentId, newCipherRef, proof) on-chain
     │
     ▼
Contract verifies proof → updates ownerOf(agentId) = buyer
                        → updates cipherRef(agentId) = newCipherRef
                        → OLD key invalidated permanently
     │
     ▼
Buyer decrypts newCipherBlob with their private key
→ Full agent intelligence received
→ Seller provably has NO access
```

---

### 1B — TEE (Trusted Execution Environment): The hardware truth machine

**What a TEE actually is:**

A TEE is a physically isolated region of the CPU that even the OS, hypervisor, and cloud operator cannot read. Think of it as a vault inside the chip with these properties:

| Property | What it means |
|---|---|
| **Confidentiality** | Code and data inside are encrypted by CPU hardware. Host OS sees only ciphertext. |
| **Integrity** | Nobody can modify what's running inside. Tampering is physically detectable. |
| **Attestation** | The enclave can SIGN its own output with a key burned into the chip. Verifier checks against Intel/AMD's public key. |
| **Isolation** | Separate from every other process. No shared memory, no side-channel by default. |

**How 0G uses it (Sealed Inference):**

```
User prompt (encrypted) ──→ [ Intel TDX enclave + NVIDIA H100/H200 in TEE mode ]
                                    │
                          Model loads inside enclave
                          Prompt decrypted INSIDE enclave
                          Inference runs — no host can observe
                          Output generated
                          Output SIGNED with enclave-born key
                                    │
                                    ▼
                         Signed output + TEE attestation quote
                         (verifiable by anyone with Intel's public key)
```

**The attestation quote contains:**
- Hash of the model that ran (proves WHICH model was used)
- Hash of the input (proves WHAT was sent)
- Hash of the output (proves WHAT came back)
- Timestamp
- Signature by the enclave's hardware-bound key

**Why this matters for NEXUS:**

When an agent runs a task in 0G's TEE, we get a signed receipt that proves:
- The specific agent (identified by its ERC-7857 agentId) ran the task
- The exact model was used (not a cheaper/different one)
- The output was not modified after generation
- The policy rules were the ones declared at session open

This is what makes ProofMesh audits trustless — the proof is hardware-issued, not just a log file someone could edit.

**TEE vs the alternatives:**

```
┌──────────────────┬──────────────┬───────────────┬──────────────────┐
│ Method           │ Overhead     │ Trust model   │ Proof type       │
├──────────────────┼──────────────┼───────────────┼──────────────────┤
│ TEE (TDX/SGX)    │ 2–15%        │ Hardware      │ Attestation sig  │
│ ZK proofs        │ 100–10,000x  │ Math          │ ZK proof         │
│ MPC              │ 100–1,000x   │ Threshold     │ Secret sharing   │
│ "Trust us" log   │ 0%           │ Human         │ Nothing          │
└──────────────────┴──────────────┴───────────────┴──────────────────┘
```

TEE wins for inference: fast enough for real-time, hardware-guaranteed, and 0G already runs it on TDX+H100.

---

### 1C — x402: HTTP payments for machines

**The 30-year dormant status code:**

HTTP 402 "Payment Required" was reserved in 1991 and never used. In 2025, Coinbase and Cloudflare finally activated it as the x402 protocol. As of April 2026, it's backed by 22 founding organizations including Google, Microsoft, AWS, Visa, Mastercard, Stripe, and is under the Linux Foundation.

**How it works (4 steps, under 2 seconds):**

```
Step 1 — Agent sends normal HTTP request
  GET https://api.research-service.com/report/defi-tvl
  Authorization: Bearer <agent_token>

Step 2 — Server returns 402 with payment terms
  HTTP/1.1 402 Payment Required
  X-PAYMENT-REQUIRED: {
    "amount": "0.12",
    "currency": "USDC",
    "network": "base",
    "recipient": "0xMerchant...",
    "ttl": 300
  }

Step 3 — Agent signs and retries with payment header
  GET https://api.research-service.com/report/defi-tvl
  X-PAYMENT: {
    "transaction": "0xSignedEIP3009Auth...",
    "network": "base"
  }

Step 4 — Server verifies on-chain, returns the resource
  HTTP/1.1 200 OK
  Content-Type: application/json
  { "report": "..." }
```

**Key properties for NEXUS:**

| Property | Value |
|---|---|
| No accounts needed | Agent pays directly, no signup, no OAuth |
| Per-call billing | $0.001 per query — impossible with cards |
| On-chain settlement | USDC on Base/Solana/Ethereum/Polygon |
| Budget-enforceable | Agent policy can cap daily/per-task spending |
| Receipt-emitting | Every payment produces a signed receipt |
| Attack surface | Replay attacks, double-spend, policy bypass — ReceiptGuard fixes all of these |

**What ReceiptGuard adds on top of x402:**

x402 handles the payment negotiation. ReceiptGuard handles the TRUST layer around it:
- Escrow: funds locked before merchant delivers
- Fulfillment verification: TEE checks merchant actually delivered
- Intent binding: payment policy declared at session open, enforced on every spend
- Auto-refund: if merchant ghosts, escrow releases back after TTL
- Dispute evidence: all proof stored on 0G Storage, anchored on 0G Chain

---

### 1D — eBPF: The kernel-level surveillance layer

**What eBPF is:**

eBPF (extended Berkeley Packet Filter) is a virtual machine INSIDE the Linux kernel. You write a tiny program, compile it to eBPF bytecode, and load it into the kernel. It attaches to kernel events (syscalls, network packets, file operations) and runs on every event — with zero application code changes required.

```
Normal monitoring:  App → logs → log aggregator → alert (delay: seconds)
eBPF monitoring:    Kernel event → eBPF hook → alert (delay: microseconds)
```

**What eBPF sees that nothing else can:**

```
Every syscall an agent process makes:
  - open(), read(), write() — file access
  - connect(), send(), recv() — network calls
  - execve() — new process spawns
  - clone() — thread creation
  - mmap() — memory allocation

Every network packet (before TLS):
  - DNS queries (what domains is the agent resolving?)
  - TCP connections (what IPs is it talking to?)
  - HTTP requests (what APIs is it hitting?)

CPU and memory patterns:
  - Sudden crypto mining behavior
  - Unusual memory allocation spikes
  - Exfiltration via DNS (data encoded in DNS queries)
```

**Why this matters for NEXUS agent fraud detection:**

An agent claiming to "research DeFi protocols" but actually:
- Making 1,000 DNS queries to an unknown domain = data exfiltration attempt
- Spawning 20 child processes = resource abuse
- Connecting to IPs not in its allowed tools list = policy violation
- Reading files outside its declared scope = privilege escalation

eBPF catches all of this at the kernel level, before the agent's own code can hide it. No agent can fake what eBPF sees — it hooks below the application layer.

**In NEXUS:** eBPF runs on the 0G Compute node alongside the TEE. It generates the syscall + network trace that becomes part of the ProofMesh trace bundle. An agent with a clean eBPF log gets a higher fraud score. Anomalies flag for human review and update the reputation registry.

---

## 2. How an AI Agent Gets Trained and Loaded

This is what "training an agent" actually means in NEXUS — and it's NOT model fine-tuning (that's testnet-only on 0G). It's persona definition + memory loading + policy setting:

```
┌────────────────────────────────────────────────────────┐
│  AGENT PERSONA (what you "train" in Wave 1–3)         │
│                                                        │
│  1. System Prompt (the agent's character)              │
│     "You are a DeFi research analyst. Your job is     │
│      to summarize protocol TVL data. Never share      │
│      wallet private keys. Always cite sources."       │
│                                                        │
│  2. Memory (episodic + semantic)                       │
│     - Past conversations (episodic)                   │
│     - Domain knowledge injected as context            │
│     - User preferences and history                    │
│                                                        │
│  3. Policy Rules (the agent's constraints)            │
│     - dailyBudget: 5 USDC                            │
│     - allowedTools: [CoinGecko API, DefiLlama API]   │
│     - bannedActions: [sendTransaction, transferFunds] │
│     - maxTaskDuration: 300 seconds                    │
│                                                        │
│  4. Optional: LoRA weights (fine-tune, Wave 4+)       │
│     Small adapter trained on domain-specific data     │
└────────────────────────────────────────────────────────┘
```

**How it gets stored and protected:**

```
User defines persona → NEXUS SDK serializes to JSON
                            │
                            ▼
                 AgentPersona {
                   systemPrompt: "...",
                   memory: [...],
                   rules: PolicyRule[],
                   dailyBudget: 5_000_000,  // 5 USDC in 6 decimals
                   allowedTools: [keccak256("coingecko.com"), ...]
                 }
                            │
                            ▼
              Encrypted with owner's public key
              (AES-256-GCM, key wrapped with owner pubkey)
                            │
                            ▼
              Stored on 0G Storage → returns CID (content ID)
                            │
                            ▼
              ERC-7857.mint(CID, ownerAddr, ownerPubKey)
              → tokenId = agentId (now lives on 0G Chain forever)
```

**Loading for inference:**

```
nexus.runTask(agentId, prompt, budget)
     │
     ▼
SDK fetches cipherRef from NexusAgent.sol.getPersonaRef(agentId)
     │
     ▼
Fetches cipher blob from 0G Storage
     │
     ▼
Decrypts with owner's private key → AgentPersona JSON
     │
     ▼
Sends to 0G Compute TEE:
  - persona (as system prompt + context)
  - user task (as user message)
  - policy (enforced inside enclave)
     │
     ▼
TEE runs inference → signs output → returns (result, attestation)
```

---

## 3. The Full Idea: NEXUS Architecture

**One product. Three load-bearing layers. One composite receipt.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEXUS PRODUCT                                 │
│                                                                         │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────────┐ │
│  │   LAYER 1        │  │    LAYER 2        │  │     LAYER 3          │ │
│  │   SoulMint       │  │    ProofMesh      │  │   ReceiptGuard       │ │
│  │   (Identity)     │  │    (Audit)        │  │   (Payments)         │ │
│  │                  │  │                   │  │                      │ │
│  │  ERC-7857 token  │  │  TEE-signed trace │  │  x402 + escrow       │ │
│  │  Encrypted brain │  │  eBPF syscall log │  │  Fulfillment verify  │ │
│  │  Re-encryption   │  │  Policy checker   │  │  Auto-refund         │ │
│  │  Transfer/Clone  │  │  Session receipts │  │  Dispute resolution  │ │
│  └──────────────────┘  └───────────────────┘  └──────────────────────┘ │
│           │                     │                        │              │
│           └─────────────────────┼────────────────────────┘              │
│                                 ▼                                       │
│                    COMPOSITE RECEIPT (agentId + sessionId + paymentId)  │
│                    Published to 0G DA, anchored on 0G Chain             │
│                                 │                                       │
│                                 ▼                                       │
│                    REPUTATION REGISTRY (on 0G Chain)                    │
│                    Score visible in marketplace. Cannot be faked.       │
└─────────────────────────────────────────────────────────────────────────┘
```

**What each 0G primitive does:**

| 0G Primitive | Layer | What it stores/runs |
|---|---|---|
| 0G Chain | L1 + L2 + L3 | ERC-7857 contract, receipts contract, escrow contract, reputation registry |
| 0G Storage | L1 + L2 + L3 | Encrypted agent persona, trace bundles, fulfillment proofs |
| 0G Compute (TEE) | L2 + L3 | Agent inference (Sealed Inference), fulfillment verifier |
| 0G Pay | L3 | Escrow, settlement, dispute refunds |
| 0G DA | Shared | Append-only public audit log of all composite receipts |
| ERC-7857 | L1 | The token standard wrapping all identity logic |

---

## 4. The Three Layers

### Layer 1 — SoulMint (Identity)

**Core contract: NexusAgent.sol**

```solidity
contract NexusAgent is ERC7857 {
    
    // agentId → encrypted persona reference on 0G Storage
    mapping(uint256 => bytes) public personaCipherRef;
    
    // agentId → policy hash (hash of the rules, locked at mint)
    mapping(uint256 => bytes32) public policyHash;
    
    // agentId → creator address (for clone royalties)
    mapping(uint256 => address) public creator;
    
    function mint(
        bytes calldata encryptedPersonaCID,
        bytes32 _policyHash,
        address owner,
        bytes calldata ownerPubKey
    ) external returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _mint(owner, agentId);
        personaCipherRef[agentId] = encryptedPersonaCID;
        policyHash[agentId] = _policyHash;
        creator[agentId] = owner;
        emit AgentMinted(agentId, owner, encryptedPersonaCID);
    }
    
    function transfer(
        address from, address to, uint256 tokenId,
        bytes calldata sealedKey, bytes calldata oracleProof
    ) external {
        require(_verifyOracleProof(tokenId, sealedKey, oracleProof));
        // Update cipher ref to buyer's version
        personaCipherRef[tokenId] = sealedKey;
        _transfer(from, to, tokenId);
        emit AgentTransferred(tokenId, from, to, sealedKey);
    }
}
```

**What the reputation registry tracks per agentId:**

```
ReputationScore {
    taskCount:        uint256   // total tasks run
    successCount:     uint256   // tasks completed cleanly
    policyViolations: uint256   // times agent broke its own rules
    disputesLost:     uint256   // payments where merchant won dispute
    disputesWon:      uint256   // payments where agent won dispute
    fraudFlags:       uint256   // eBPF anomalies flagged
    score:            int256    // computed: -1000 to +1000
    lastUpdated:      uint256   // block timestamp
}
```

---

### Layer 2 — ProofMesh (Audit)

**What gets recorded for every task:**

```
TraceBundle {
    sessionId:         bytes32       // unique per task run
    agentId:           uint256       // links to L1
    policyHashAtRun:   bytes32       // must match NexusAgent.policyHash
    
    // What the TEE saw
    teeAttestation:    bytes         // Intel TDX quote (hardware signed)
    modelHash:         bytes32       // which model ran
    inputHash:         bytes32       // keccak256 of the prompt
    outputHash:        bytes32       // keccak256 of the response
    inferenceTokens:   uint256       // token count (for billing audit)
    
    // What eBPF saw
    syscallLog:        SyscallEntry[] // every syscall the agent made
    networkLog:        NetworkEntry[] // every DNS/TCP/HTTP call
    anomalyFlags:      uint8         // bitmask: 0 = clean
    
    // Tool calls (every external API hit)
    toolCalls:         ToolCall[]    // {url, inputHash, outputHash, costUSDC}
    
    // Storage reference
    traceCID:          bytes         // encrypted bundle on 0G Storage
}
```

**Policy violation detection (automatic):**

```
Agent rule: allowedTools = [keccak256("api.coingecko.com")]

eBPF sees: agent DNS-resolved "unknown-exfil-domain.xyz"
                  │
                  ▼
Policy checker: keccak256("unknown-exfil-domain.xyz") NOT IN allowedTools
                  │
                  ▼
anomalyFlag[0] = 1  (unauthorized domain)
Session closes with VIOLATION status
Reputation registry: policyViolations += 1, score -= 50
Task marked FAILED in composite receipt
```

---

### Layer 3 — ReceiptGuard (Payments)

**The payment state machine:**

```
        lockFunds()
IDLE ──────────────→ LOCKED
                        │
           submitFulfillment() (merchant)
                        ▼
                   FULFILLED
                        │
          TEE verifier checks fulfillment
                   ┌────┴────┐
         PASS      │         │    FAIL
                   ▼         ▼
              SETTLED    DISPUTED
              (release)  (evidence stored)
                              │
                         arbitration
                         ┌────┴────┐
                  REFUND  │         │  SETTLE_MERCHANT
                         ▼         ▼
                     refund()   release()
```

**Intent-bound payment policy (what makes it "trustworthy market"):**

When the agent's session opens (L2), the payment policy is declared and hashed:

```json
{
  "sessionId": "0xABC...",
  "agentId": 42,
  "maxSpend": "2.00 USDC",
  "allowedMerchants": ["0xCoinGecko...", "0xDefiLlama..."],
  "maxPerTx": "0.50 USDC",
  "ttl": 300
}
```

This hash is written to 0G Chain at session open. Every payment the agent makes is checked against it. If the agent tries to pay an unlisted merchant, or exceed per-tx limit, the escrow contract REJECTS it even if the agent signed the x402 header.

**Merchant attestation (why merchants can't lie):**

```
Merchant calls submitFulfillment(paymentId, evidenceCID)
     │
     ▼
TEE verifier fetches evidenceCID from 0G Storage
Checks: does the evidence match what was requested in the original payment?
     │
     ├── Yes: sign fulfillment proof → escrow releases
     └── No:  mark DISPUTED → auto-refund after TTL
```

The evidence is stored on 0G Storage and its hash is anchored on 0G Chain. Nobody can retroactively change what they claimed to deliver.

---

## 5. Agent Rating System

This is the soul of the marketplace — why someone pays 10 USDC instead of 2 USDC for an agent.

### The five fraud vectors NEXUS catches:

```
┌──────────────────────────────────────────────────────────────────┐
│  FRAUD VECTOR         │ HOW CAUGHT              │ EVIDENCE ON   │
├──────────────────────────────────────────────────────────────────┤
│  Fake task completion │ TEE outputHash mismatch │ 0G Storage    │
│  Budget theft         │ L3 spend vs policy      │ 0G Chain      │
│  Tool spoofing        │ eBPF network log        │ Trace bundle  │
│  Policy violation     │ L2 policy hash diff     │ 0G Chain      │
│  Identity fraud       │ ERC-7857 ownerOf()      │ 0G Chain      │
└──────────────────────────────────────────────────────────────────┘
```

### How the reputation score is computed:

```
score = base(1000)
      - policyViolations × 50
      - disputesLost × 100
      - fraudFlags × 200
      - failedTasks × 10
      + successfulTasks × 5
      + merchantPositiveRatings × 20
      + userRatings × (weight by rater's own score)

Score range: -1000 (banned from marketplace) to +1000 (verified elite)
```

### Score tiers visible in marketplace:

| Tier | Score range | Badge | What it means |
|---|---|---|---|
| Unverified | No tasks | Gray | Never run. No history. |
| Emerging | 0–200 | White | Few tasks, no violations. |
| Trusted | 200–500 | Blue | Consistent clean record. |
| Verified | 500–800 | Gold | High volume, zero fraud flags. |
| Elite | 800–1000 | Purple | Battle-tested, top performer. |
| Flagged | Any negative | Red | Active violation under review. |
| Banned | < -500 | Black | Fraud confirmed. Token burned. |

### Why the rating can't be gamed:

1. Score updates come from contract calls (L2 session close, L3 settlement) — not user votes
2. Every score change has a `receiptHash` proving WHICH task caused it
3. The entire history is public on 0G Chain — auditable by anyone
4. eBPF logs are generated at the kernel level — the agent cannot fake them
5. TEE attestation proves which model ran — can't swap to a better model for reviews

### What a buyer sees before purchasing an agent:

```
Agent: "DeFi Research Pro v2.1"
Price: 45 USDC
Creator: 0xHarsh...
Clones sold: 127

━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPUTATION SCORE: 847/1000 [ELITE]

Tasks completed:     1,204
Policy violations:   0
Disputes lost:       1  (appealed, overturned)
Fraud flags:         0
Avg task cost:       0.34 USDC
Avg task time:       42 seconds

PROOF TRAIL:
Last 5 sessions → click to verify on 0G explorer
Each session: TEE attestation + eBPF log + payment receipt

POLICY DECLARED:
Budget: 2 USDC/task
Allowed tools: CoinGecko, DefiLlama, Etherscan
Banned: wallet operations, file writes outside /tmp
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 6. Complete Data Flow: One Task, All Layers

```
USER calls nexus.runTask(agentId=42, prompt="Research top 3 DeFi protocols by TVL", budget=2_USDC)

STEP 1 — L1 identity check
  NexusAgent.ownerOf(42) == msg.sender ✓
  NexusAgent.getPersonaRef(42) → cipherRef
  SDK fetches cipher blob from 0G Storage
  SDK decrypts with owner private key → AgentPersona JSON

STEP 2 — L2 session open
  ProofMeshReceipts.openSession(agentId=42, policyHash, taskHash)
  → sessionId = 0xSESSION...
  Policy hash written to 0G Chain ✓

STEP 3 — Task execution (TEE)
  AgentPersona + prompt sent to 0G Compute (Sealed Inference)
  Inside TEE:
    Model loads, prompt decrypted, inference runs
    Agent decides: need CoinGecko data
    → calls nexus.pay(merchant=CoinGecko, amount=0.12 USDC)

STEP 4 — L3 payment intercepted
  ReceiptGuardEscrow.lockFunds(agentId=42, sessionId, merchant=CoinGecko, amount=0.12)
  Policy check: CoinGecko in allowedTools ✓, 0.12 < maxPerTx ✓
  Funds locked in escrow on 0G Chain
  Agent sends x402 payment header to CoinGecko API
  CoinGecko returns data
  CoinGecko calls submitFulfillment(paymentId, evidenceCID)
  TEE verifier: response matches what was requested ✓
  Escrow released → CoinGecko paid

STEP 5 — eBPF audit
  During entire task, eBPF hook on 0G Compute node recorded:
    - 3 DNS queries: api.coingecko.com, api.llama.fi, api.etherscan.io
    - All in allowedTools → anomalyFlags = 0b00000000 (clean)
    - 1 TCP connection per domain
    - 0 unexpected process spawns

STEP 6 — L2 session close
  ProofMeshReceipts.closeSession(sessionId, traceCID, teeSignature)
  traceCID = 0g_storage_CID_of_encrypted_trace_bundle
  teeSignature = Intel TDX attestation quote
  Written to 0G Chain ✓

STEP 7 — Composite receipt minted
  CompositeReceipt {
    agentId: 42,
    sessionId: 0xSESSION...,
    paymentId: 0xPAYMENT...,
    traceCID: "0g://abc123",
    teeSignature: "0xINTEL...",
    totalCost: 0.12 USDC,
    timestamp: 1750300000
  }
  Published to 0G DA (append-only)
  Reputation registry: successCount += 1, score += 5

STEP 8 — User receives result
  Agent output (research report)
  + Link to composite receipt on 0G explorer
  + "This task is cryptographically proven. Click to verify."
```

---

## 7. Smart Contract Architecture

```
NexusAgent.sol (ERC-7857)
  ├── mint(encryptedCID, policyHash, owner, pubKey) → agentId
  ├── transfer(from, to, tokenId, sealedKey, oracleProof)
  ├── clone(to, tokenId, sealedKey, proof) → newTokenId
  ├── authorizeUsage(tokenId, executor, permissions)
  ├── getPersonaRef(tokenId) → cipherRef
  ├── getPolicyHash(tokenId) → bytes32
  └── event AgentTransferred(agentId, from, to, newCipherRef)

ProofMeshReceipts.sol
  ├── openSession(agentId, policyHash, taskHash) → sessionId
  ├── closeSession(sessionId, traceCID, teeSignature)
  ├── flagViolation(sessionId, violationType, evidence)
  ├── verifySession(sessionId) → (bool valid, bytes32 traceCID)
  └── event SessionClosed(sessionId, agentId, traceCID, teeSignature)

ReceiptGuardEscrow.sol
  ├── lockFunds(agentId, sessionId, merchant, amount) → paymentId
  ├── submitFulfillment(paymentId, fulfillmentCID)
  ├── settlePayment(paymentId, teeVerifierSig)
  ├── openDispute(paymentId, disputeEvidence)
  ├── resolveDispute(paymentId, refund, arbitrationProof)
  └── event PaymentSettled(paymentId, agentId, sessionId, amount, receiptCID)

ReputationRegistry.sol (shared, written by L2 + L3)
  ├── updateScore(agentId, delta, receiptHash)
  ├── getScore(agentId) → (score, tier, taskCount)
  ├── flagAgent(agentId, evidence)
  └── banAgent(agentId, proof)

CompositeReceiptMinter.sol
  ├── listens to: SessionClosed + PaymentSettled
  ├── mint(agentId, sessionId, paymentId, traceCID, fulfillmentCID)
  └── publishes to 0G DA
```

---

## 8. Wave-by-Wave Build Plan

| Wave | Deadline | Deliverable | Success benchmark |
|---|---|---|---|
| Wave 1 | June 26 | Scope doc, X post, testnet gate-check | ERC-7857 mint works on 0G testnet. TEE API responds. |
| Wave 2 | ~July 10 | Working testnet demo — full 5-primitive loop | Stranger can mint agent, run task, see receipt. |
| Wave 3 | ~July 25 | Mainnet — all contracts verified, all 6 primitives | Real txs on chainscan.0g.ai. TEE attestation verifiable. |
| Wave 4 | ~Aug 8 | Social layer — clone loop, public feed, X auto-post | DAUs growing. Clone count tracked. Organic X posts. |
| Wave 5 | ~Aug 15 | Demo Day — 3-min video, README, proof page, Apollo app | 3-min demo hits all judge axes. Explorer links all live. |

**Wave 1 gate checks (run these before building anything else):**

```bash
# Test 1: ERC-7857 on 0G testnet
npx hardhat run scripts/test-erc7857-mint.js --network 0g-testnet
# Expected: tokenId returned, personaCipherRef stored, ownerOf correct

# Test 2: 0G Sealed Inference
curl -X POST https://router-api.0g.ai/v1/chat/completions \
  -H "Authorization: Bearer $OG_API_KEY" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"test"}]}'
# Expected: response with attestation field

# Test 3: 0G Storage
node scripts/test-0g-storage-write-read.js
# Expected: CID returned on write, same bytes on read

# Test 4: 0G Pay escrow
npx hardhat run scripts/test-escrow-cycle.js --network 0g-testnet
# Expected: lockFunds → submitFulfillment → settle, all txs on explorer
```

**Hard scope limits (do not cross these in Wave 2–3):**

- No secondary royalties engine
- No multi-agent orchestration  
- No full model fine-tuning (inference only)
- No token bonding curve or tokenomics
- No multi-chain bridge
- No staking/slashing for payments
- Marketplace = 3 listings max in Wave 3

---

## 9. What Makes This Unbeatable

### vs. other buildathon teams:

| What they'll build | What NEXUS has that they don't |
|---|---|
| "AI chatbot on 0G Compute" | ERC-7857 identity (hardest primitive) |
| "Store files on 0G Storage" | ProofMesh TEE-signed audit trail |
| "AI oracle" (Negravis-style) | ReceiptGuard intent-bound payments |
| "Agent marketplace (ERC-721)" | Re-encryption on transfer (truly own) |
| Any single-primitive project | 6 load-bearing primitives, all required |

### The 6-primitive integration depth argument:

Remove any one primitive and the product breaks:

```
Remove ERC-7857    → agents have no verifiable identity. L2 has no subject. L3 has no verified payer.
Remove 0G Compute  → no TEE inference. Audits have no hardware proof. Just logs.
Remove 0G Storage  → no encrypted personas. No trace bundles. No fulfillment evidence.
Remove 0G Chain    → no ownership registry. No escrow state machine. No reputation.
Remove 0G Pay      → no escrow. No settlement. No budget enforcement.
Remove 0G DA       → no public audit log. Composite receipts can't be verified by judges.
```

All 6 are genuinely required. This is the strongest possible answer to "0G integration depth" (50% of Wave 3 score).

### The timing moat:

All four primitives that make NEXUS possible became production-ready in the last 6 months:
- ERC-7857: introduced by 0G Labs, live on testnet 2025
- 0G Sealed Inference: production March 6, 2026
- x402: 165M+ transactions, Linux Foundation April 2026
- ERC-8004: live on Ethereum mainnet January 29, 2026

12 months later, every team will be building this. Right now, almost nobody has shipped a working ERC-7857 product with real re-encryption on transfer. That is the moat.

---

## 10. Tech Stack Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  NEXUS TECH STACK                                               │
│                                                                  │
│  Frontend                                                        │
│  ├── Next.js 15 (App Router)                                    │
│  ├── wagmi v2 + viem (0G Chain connection)                      │
│  ├── 0G Storage SDK (@0glabs/0g-ts-sdk)                        │
│  └── ProofMesh viewer (React component)                         │
│                                                                  │
│  Smart Contracts (Solidity 0.8.25)                              │
│  ├── NexusAgent.sol (ERC-7857 + our extensions)                │
│  ├── ProofMeshReceipts.sol                                       │
│  ├── ReceiptGuardEscrow.sol                                      │
│  ├── ReputationRegistry.sol                                      │
│  └── CompositeReceiptMinter.sol                                  │
│  Deploy target: 0G Aristotle Mainnet (chain ID: 16600)          │
│                                                                  │
│  Agent Runtime                                                   │
│  ├── 0G Compute SDK (Sealed Inference, OpenAI-compatible)       │
│  ├── Model: GLM-5 or DeepSeek via router-api.0g.ai/v1          │
│  ├── eBPF probe: Tetragon TracingPolicy (kernel-level audit)    │
│  └── x402 client: @coinbase/x402                                │
│                                                                  │
│  Storage                                                         │
│  ├── 0G Storage: encrypted personas, trace bundles, proofs      │
│  └── 0G DA: composite receipt append-only log                   │
│                                                                  │
│  Oracle                                                          │
│  └── Re-encryption oracle: 0G TEE service (or mock in Wave 2)  │
│                                                                  │
│  Key external integrations                                       │
│  ├── ERC-8004 registry (Ethereum mainnet) for cross-chain ID    │
│  └── x402 Foundation facilitator (Coinbase Base)               │
└─────────────────────────────────────────────────────────────────┘
```

### The one-sentence pitch per judge axis:

| Axis | Sentence |
|---|---|
| Wave 3 integration depth (50%) | Six 0G primitives, all load-bearing — removing any one breaks the product. |
| Working demo | Mint an agent, run a task, watch the TEE proof + payment receipt appear live on mainnet. |
| Innovation | First product to combine ERC-7857 identity, TEE execution, and x402 payment escrow into a verifiable agent marketplace. |
| Real use case | Any marketplace where you hire an agent needs exactly this — today it doesn't exist anywhere. |
| Vision | NEXUS is the trust primitive for the agent economy — the same role HTTPS plays for the web. |
| Apollo fit | Hits four of Apollo's six stated verticals: AI agents, Trust & Safety, Finance, Developer tooling. |

---

*This document was prepared for the 0G Bridge Buildathon, Wave 1 submission. Build starts June 21, 2026.*

