// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {INexusAgent} from "./interfaces/INexus.sol";

/// @title NexusEscrow
/// @notice Native 0G-Chain escrow with intent-bound spend policy. The payment
///         policy is bound to a session up-front (allowed merchants, per-tx cap,
///         daily budget, TTL). Every spend is checked against it on chain — even a
///         validly-signed payment is REJECTED if it breaks the policy. Settlement is
///         in native 0G (msg.value), so funds visibly lock and settle on 0G Chain.
///
///         Fulfillment verification is intentionally SCOPED to structural checks
///         (evidence is present / non-empty), not general semantics — that boundary
///         is stated openly in ARCHITECTURE.md.
contract NexusEscrow is Ownable {
    enum PStatus { NONE, LOCKED, FULFILLED, SETTLED, REFUNDED, DISPUTED }

    struct SpendPolicy {
        bool    exists;
        uint256 agentId;
        address opener;
        uint256 maxPerTx;
        uint256 dailyBudget;
        uint256 spent;
        uint64  ttl;       // seconds; payments older than this may be refunded
    }

    struct Payment {
        uint256 agentId;
        bytes32 sessionId;
        address payer;
        address merchant;
        uint256 amount;
        uint64  lockedAt;
        PStatus status;
        bytes32 evidenceHash;
    }

    INexusAgent public immutable agentRegistry;

    mapping(bytes32 => SpendPolicy) public policies;                 // sessionId => policy
    mapping(bytes32 => mapping(address => bool)) public allowedMerchant; // sessionId => merchant => ok
    mapping(bytes32 => Payment) public payments;                     // paymentId => payment
    mapping(bytes32 => bytes)   private _evidenceCID;
    uint256 private _payNonce;

    event PolicyBound(bytes32 indexed sessionId, uint256 indexed agentId, uint256 maxPerTx, uint256 dailyBudget);
    event FundsLocked(bytes32 indexed paymentId, uint256 indexed agentId, address merchant, uint256 amount);
    event FulfillmentSubmitted(bytes32 indexed paymentId, bytes evidenceCID);
    event PaymentSettled(bytes32 indexed paymentId, uint256 indexed agentId, bytes receiptCID);
    event PaymentRefunded(bytes32 indexed paymentId);
    event DisputeOpened(bytes32 indexed paymentId);
    event DisputeResolved(bytes32 indexed paymentId, bool refundedBuyer);

    error PolicyExists();
    error NoPolicy();
    error NotOpener();
    error MerchantNotAllowed();
    error OverPerTx();
    error OverBudget();
    error BadValue();
    error NotMerchant();
    error WrongStatus();
    error NotFulfilled();
    error TtlNotElapsed();
    error NotAgentOwner();

    constructor(address agentRegistry_) Ownable(msg.sender) {
        agentRegistry = INexusAgent(agentRegistry_);
    }

    /// @notice Bind the spend policy for a session. Caller must own the agent.
    function bindPolicy(
        bytes32 sessionId,
        uint256 agentId,
        address[] calldata merchants,
        uint256 maxPerTx,
        uint256 dailyBudget,
        uint64  ttl
    ) external {
        if (policies[sessionId].exists) revert PolicyExists();
        if (
            agentRegistry.ownerOf(agentId) != msg.sender
                && !agentRegistry.isAuthorizedExecutor(agentId, msg.sender)
        ) revert NotAgentOwner();

        policies[sessionId] = SpendPolicy({
            exists: true,
            agentId: agentId,
            opener: msg.sender,
            maxPerTx: maxPerTx,
            dailyBudget: dailyBudget,
            spent: 0,
            ttl: ttl
        });
        for (uint256 i = 0; i < merchants.length; i++) {
            allowedMerchant[sessionId][merchants[i]] = true;
        }
        emit PolicyBound(sessionId, agentId, maxPerTx, dailyBudget);
    }

    /// @notice Lock native 0G into escrow for a merchant. Enforces the bound policy.
    function lockFunds(uint256 agentId, bytes32 sessionId, address merchant, uint256 amount)
        external
        payable
        returns (bytes32 paymentId)
    {
        SpendPolicy storage p = policies[sessionId];
        if (!p.exists) revert NoPolicy();
        if (msg.value != amount) revert BadValue();
        if (!allowedMerchant[sessionId][merchant]) revert MerchantNotAllowed();
        if (amount > p.maxPerTx) revert OverPerTx();
        if (p.spent + amount > p.dailyBudget) revert OverBudget();

        p.spent += amount;
        paymentId = keccak256(abi.encode(sessionId, merchant, amount, _payNonce++, block.timestamp));
        payments[paymentId] = Payment({
            agentId: agentId,
            sessionId: sessionId,
            payer: msg.sender,
            merchant: merchant,
            amount: amount,
            lockedAt: uint64(block.timestamp),
            status: PStatus.LOCKED,
            evidenceHash: bytes32(0)
        });
        emit FundsLocked(paymentId, agentId, merchant, amount);
    }

    /// @notice Merchant submits delivery evidence (0G Storage reference).
    function submitFulfillment(bytes32 paymentId, bytes calldata evidenceCID) external {
        Payment storage pay = payments[paymentId];
        if (pay.status != PStatus.LOCKED) revert WrongStatus();
        if (msg.sender != pay.merchant) revert NotMerchant();
        pay.status = PStatus.FULFILLED;
        pay.evidenceHash = keccak256(evidenceCID);
        _evidenceCID[paymentId] = evidenceCID;
        emit FulfillmentSubmitted(paymentId, evidenceCID);
    }

    /// @notice Settle a fulfilled payment: structural check (evidence present) then
    ///         release escrow to the merchant. Callable by payer or contract owner
    ///         (the runtime/verifier).
    function settlePayment(bytes32 paymentId) external {
        Payment storage pay = payments[paymentId];
        if (pay.status != PStatus.FULFILLED) revert NotFulfilled();
        if (msg.sender != pay.payer && msg.sender != owner()) revert NotOpener();
        if (pay.evidenceHash == bytes32(0)) revert NotFulfilled(); // structural fulfillment check

        pay.status = PStatus.SETTLED;
        (bool ok, ) = payable(pay.merchant).call{value: pay.amount}("");
        require(ok, "settle xfer failed");
        emit PaymentSettled(paymentId, pay.agentId, _evidenceCID[paymentId]);
    }

    /// @notice Refund a locked-but-unfulfilled payment after its TTL elapses.
    function refund(bytes32 paymentId) external {
        Payment storage pay = payments[paymentId];
        if (pay.status != PStatus.LOCKED) revert WrongStatus();
        SpendPolicy storage p = policies[pay.sessionId];
        if (block.timestamp < pay.lockedAt + p.ttl) revert TtlNotElapsed();

        pay.status = PStatus.REFUNDED;
        if (p.spent >= pay.amount) p.spent -= pay.amount; // free up the budget again
        (bool ok, ) = payable(pay.payer).call{value: pay.amount}("");
        require(ok, "refund xfer failed");
        emit PaymentRefunded(paymentId);
    }

    function openDispute(bytes32 paymentId, bytes calldata /*evidence*/) external {
        Payment storage pay = payments[paymentId];
        if (pay.status != PStatus.FULFILLED && pay.status != PStatus.LOCKED) revert WrongStatus();
        if (msg.sender != pay.payer && msg.sender != owner()) revert NotOpener();
        pay.status = PStatus.DISPUTED;
        emit DisputeOpened(paymentId);
    }

    /// @notice Arbiter (contract owner) resolves a dispute either way.
    function resolveDispute(bytes32 paymentId, bool refundBuyer, bytes calldata /*arbitrationProof*/)
        external
        onlyOwner
    {
        Payment storage pay = payments[paymentId];
        if (pay.status != PStatus.DISPUTED) revert WrongStatus();
        if (refundBuyer) {
            pay.status = PStatus.REFUNDED;
            (bool ok, ) = payable(pay.payer).call{value: pay.amount}("");
            require(ok, "refund failed");
        } else {
            pay.status = PStatus.SETTLED;
            (bool ok, ) = payable(pay.merchant).call{value: pay.amount}("");
            require(ok, "settle failed");
        }
        emit DisputeResolved(paymentId, refundBuyer);
    }

    // ----------------------------------------------------------------- views
    function isSettled(bytes32 paymentId) external view returns (bool) {
        return payments[paymentId].status == PStatus.SETTLED;
    }

    function agentOf(bytes32 paymentId) external view returns (uint256) {
        return payments[paymentId].agentId;
    }

    function getEvidenceCID(bytes32 paymentId) external view returns (bytes memory) {
        return _evidenceCID[paymentId];
    }

    function statusOf(bytes32 paymentId) external view returns (PStatus) {
        return payments[paymentId].status;
    }
}
