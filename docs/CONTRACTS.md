# NEXUS — Contract Specs

> **SPEC ONLY — interfaces, state, and events. Not implementation.** Function bodies are described, not written. Build these in Hardhat/Foundry against 0G testnet first (see TEST_PLAN gate-checks).

Solidity ^0.8.25 · target chain: 0G Aristotle Mainnet · audit before mainnet (ERC-7857 is pre-audit upstream).

---

## Contract map

```
NexusAgent.sol           (ERC-7857)   identity, encrypted transfer, clone
ProofMeshReceipts.sol                 session open/close, trace anchoring
NexusEscrow.sol                       native 0G-Chain escrow, policy-bound spend
ReputationRegistry.sol                proof-derived scores (written by L2 + L3)
CompositeReceiptMinter.sol            listens to L2+L3, mints receipt, publishes to DA
```

Dependency direction: `NexusAgent` is the root subject. `ProofMeshReceipts` and `NexusEscrow` reference `agentId`. `ReputationRegistry` is written only by the other contracts (no direct user writes). `CompositeReceiptMinter` reads events and is the only DA publisher.

---

## 1. NexusAgent.sol (ERC-7857)

```solidity
interface INexusAgent /* is IERC7857, IERC721 */ {
    // --- state (conceptual) ---
    // mapping(uint256 => bytes)    personaCipherRef;  // 0G Storage CID of encrypted persona
    // mapping(uint256 => bytes32)  policyHash;        // hash of policy, locked at mint
    // mapping(uint256 => address)  creator;           // for clone royalty
    // address trustedSigner;                          // re-encryption oracle signer (v1)

    // Mint: persona already encrypted + uploaded to 0G Storage off-chain
    function mint(
        bytes calldata encryptedPersonaCID,
        bytes32 _policyHash,
        address owner,
        bytes calldata ownerPubKey
    ) external returns (uint256 agentId);

    // Step 1 of transfer — emits the re-encryption request for the oracle
    function requestTransfer(uint256 agentId, address buyer, bytes calldata buyerPubKey) external;

    // Step 2 — oracle calls back with new cipher ref + signature; contract verifies + flips ownership
    function finalizeTransfer(
        uint256 agentId,
        bytes calldata newCipherRef,
        bytes calldata signature   // ecrecover must == trustedSigner
    ) external;

    // Clone — new independent agent, royalty to original creator
    function clone(
        uint256 agentId,
        address to,
        bytes calldata sealedKey,
        bytes calldata signature
    ) external payable returns (uint256 newAgentId);

    // Authorize USE without OWNERSHIP (powers the Wave 4-5 "hire" path)
    function authorizeUsage(uint256 agentId, address executor, bytes calldata permissions) external;

    // Views
    function getPersonaRef(uint256 agentId) external view returns (bytes memory);
    function getPolicyHash(uint256 agentId) external view returns (bytes32);

    // transferFrom / safeTransferFrom are DISABLED (revert) — ownership only via finalizeTransfer

    event AgentMinted(uint256 indexed agentId, address indexed owner, bytes encryptedPersonaCID);
    event ReEncryptionRequest(uint256 indexed agentId, bytes oldCipherRef, bytes buyerPubKey, uint256 nonce);
    event AgentTransferred(uint256 indexed agentId, address indexed from, address indexed to, bytes newCipherRef);
    event AgentCloned(uint256 indexed parentId, uint256 indexed newAgentId, address indexed cloner);
}
```

**Trust note for the spec:** `trustedSigner` is the v1 assumption, set by `setSigner(address)` (owner-only). State it in the README and the demo. v2 replaces the ECDSA check with a TEE-attestation/ZKP verification. This is the Zero Arena pattern, openly acknowledged.

---

## 2. ProofMeshReceipts.sol

```solidity
interface IProofMeshReceipts {
    function openSession(uint256 agentId, bytes32 policyHash, bytes32 taskHash)
        external returns (bytes32 sessionId);

    function closeSession(bytes32 sessionId, bytes calldata traceCID, bytes calldata teeSignature)
        external;

    function flagViolation(bytes32 sessionId, uint8 violationType, bytes calldata evidence) external;

    function verifySession(bytes32 sessionId)
        external view returns (bool valid, bytes32 traceCIDHash);

    event SessionOpened(bytes32 indexed sessionId, uint256 indexed agentId, bytes32 policyHash);
    event SessionClosed(bytes32 indexed sessionId, uint256 indexed agentId, bytes traceCID, bytes teeSignature);
    event ViolationFlagged(bytes32 indexed sessionId, uint8 violationType);
}
```

`teeSignature` is the Sealed Inference attestation reference. **On-chain we store it; verification of the full attestation is performed off-chain** by the SDK/verifier against the provider's enclave key (0G's own model). Do not attempt on-chain TDX quote verification.

---

## 3. NexusEscrow.sol (native 0G Chain — replaces x402-on-Base)

```solidity
interface INexusEscrow {
    // Policy is bound at session open and enforced on every spend
    function lockFunds(uint256 agentId, bytes32 sessionId, address merchant, uint256 amount)
        external returns (bytes32 paymentId);
        // reverts unless: merchant ∈ allowedTools && amount ≤ maxPerTx && cumulative ≤ dailyBudget

    function submitFulfillment(bytes32 paymentId, bytes calldata evidenceCID) external; // merchant

    function settlePayment(bytes32 paymentId) external;   // after structural fulfillment check passes
    function refund(bytes32 paymentId) external;          // auto-callable after TTL if unfulfilled
    function openDispute(bytes32 paymentId, bytes calldata evidence) external;
    function resolveDispute(bytes32 paymentId, bool refundBuyer, bytes calldata arbitrationProof) external;

    event FundsLocked(bytes32 indexed paymentId, uint256 indexed agentId, address merchant, uint256 amount);
    event PaymentSettled(bytes32 indexed paymentId, uint256 indexed agentId, bytes receiptCID);
    event PaymentRefunded(bytes32 indexed paymentId);
}
```

**Settlement asset:** one asset only for v1 (0G token or a single bridged USDC on 0G Chain — pick one in BUILD_PLAN). No multi-asset, no multi-chain. The point that scores: **funds lock and settle on 0G Chain**, visible on `chainscan.0g.ai`.

---

## 4. ReputationRegistry.sol

```solidity
interface IReputationRegistry {
    // Only callable by ProofMeshReceipts + NexusEscrow + CompositeReceiptMinter (access-controlled)
    function updateScore(uint256 agentId, int256 delta, bytes32 receiptHash) external;
    function flagAgent(uint256 agentId, bytes calldata evidence) external;

    function getScore(uint256 agentId)
        external view returns (int256 score, uint8 tier, uint256 taskCount);

    event ScoreUpdated(uint256 indexed agentId, int256 newScore, bytes32 receiptHash);
}
```

Score formula (compute off-chain, write deltas on-chain with receipt hashes):
```
score = 1000
      - policyViolations*50 - disputesLost*100 - fraudFlags*200 - failedTasks*10
      + successfulTasks*5 + merchantPositive*20
range: [-1000, +1000]
tiers: Unverified / Emerging(0-200) / Trusted(200-500) / Verified(500-800) / Elite(800-1000) / Flagged(<0) / Banned(<-500)
```
**Why it can't be gamed (the demo claim):** every `updateScore` carries a `receiptHash` tracing to an on-chain proof. No user-vote inputs. Auditable by anyone.

---

## 5. CompositeReceiptMinter.sol

```solidity
interface ICompositeReceiptMinter {
    // Mints once it sees both SessionClosed (L2) and (if any) PaymentSettled (L3)
    function mint(
        uint256 agentId, bytes32 sessionId, bytes32 paymentId,
        bytes calldata traceCID, bytes calldata fulfillmentCID
    ) external returns (uint256 receiptId);

    event CompositeReceiptMinted(
        uint256 indexed receiptId, uint256 indexed agentId,
        bytes32 sessionId, bytes32 paymentId, bytes traceCID
    );
}
```
Publishes the receipt to **0G DA** (append-only). This is the single artifact a judge clicks to verify the whole task in 30 seconds.

---

## Off-chain: re-encryption oracle service (you run this)

Not a contract — a small service. On `ReEncryptionRequest`:
1. fetch old cipher blob from 0G Storage
2. re-wrap the AES-256-GCM key under buyer's pubkey (proxy re-encryption or wrap-unwrap inside the service)
3. upload new blob → 0G Storage → `newCipherRef`
4. `sign(agentId, newCipherRef, keccak(buyerPubKey), nonce)` with the signer key
5. call `finalizeTransfer(...)`

v1 trust = "the signer behaves." v2 = run this inside a 0G Compute TEE and have the contract verify the enclave attestation instead of a bare ECDSA sig. **Ship v1. Roadmap v2.** Do not let v2 block Wave 3.
