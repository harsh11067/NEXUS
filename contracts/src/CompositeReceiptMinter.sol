// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IProofMeshReceipts, INexusEscrow, IReputationRegistry} from "./interfaces/INexus.sol";

/// @title CompositeReceiptMinter
/// @notice Ties an L2 session and an optional L3 payment into a single composite
///         receipt — the artifact a judge clicks to verify the whole task in 30
///         seconds. Minting requires the session to be CLOSED (and the payment, if
///         any, SETTLED). On mint it applies the success reputation delta, every
///         change carrying a receiptHash tracing back to this receipt.
contract CompositeReceiptMinter is Ownable {
    struct CompositeReceipt {
        uint256 agentId;
        bytes32 sessionId;
        bytes32 paymentId;
        bytes32 traceCIDHash;
        bytes32 receiptHash;
        uint64  timestamp;
        address mintedBy;
    }

    IProofMeshReceipts public immutable proofMesh;
    INexusEscrow public immutable escrow;
    IReputationRegistry public immutable reputation;

    uint256 public nextReceiptId = 1;
    mapping(uint256 => CompositeReceipt) public receipts;
    mapping(bytes32 => bytes) private _traceCID;
    mapping(bytes32 => bytes) private _fulfillmentCID;
    mapping(bytes32 => uint256) public receiptOfSession; // sessionId => receiptId (0 if none)

    int256 public constant SUCCESS_DELTA = 5;

    event CompositeReceiptMinted(
        uint256 indexed receiptId,
        uint256 indexed agentId,
        bytes32 sessionId,
        bytes32 paymentId,
        bytes traceCID
    );

    error SessionNotValid();
    error PaymentNotSettled();
    error AlreadyMinted();
    error NotAuthorized();
    error AgentMismatch();

    constructor(address proofMesh_, address escrow_, address reputation_) Ownable(msg.sender) {
        proofMesh = IProofMeshReceipts(proofMesh_);
        escrow = INexusEscrow(escrow_);
        reputation = IReputationRegistry(reputation_);
    }

    /// @notice Mint the composite receipt for a completed task. `paymentId` may be
    ///         bytes32(0) for a task with no spend.
    function mint(
        uint256 agentId,
        bytes32 sessionId,
        bytes32 paymentId,
        bytes calldata traceCID,
        bytes calldata fulfillmentCID
    ) external returns (uint256 receiptId) {
        // only the session opener or the contract owner may mint (anti-spam)
        if (msg.sender != proofMesh.openerOf(sessionId) && msg.sender != owner()) revert NotAuthorized();
        if (receiptOfSession[sessionId] != 0) revert AlreadyMinted();
        if (proofMesh.agentOf(sessionId) != agentId) revert AgentMismatch();

        (bool valid, bytes32 traceCIDHash) = proofMesh.verifySession(sessionId);
        if (!valid) revert SessionNotValid();

        if (paymentId != bytes32(0)) {
            if (!escrow.isSettled(paymentId)) revert PaymentNotSettled();
            if (escrow.agentOf(paymentId) != agentId) revert AgentMismatch();
        }

        receiptId = nextReceiptId++;
        bytes32 receiptHash = keccak256(
            abi.encode(agentId, sessionId, paymentId, traceCIDHash, block.chainid)
        );

        receipts[receiptId] = CompositeReceipt({
            agentId: agentId,
            sessionId: sessionId,
            paymentId: paymentId,
            traceCIDHash: traceCIDHash,
            receiptHash: receiptHash,
            timestamp: uint64(block.timestamp),
            mintedBy: msg.sender
        });
        receiptOfSession[sessionId] = receiptId;
        _traceCID[bytes32(receiptId)] = traceCID;
        _fulfillmentCID[bytes32(receiptId)] = fulfillmentCID;

        // reputation increment, traced to this receipt
        reputation.updateScore(agentId, SUCCESS_DELTA, receiptHash);

        emit CompositeReceiptMinted(receiptId, agentId, sessionId, paymentId, traceCID);
    }

    function getReceipt(uint256 receiptId)
        external
        view
        returns (CompositeReceipt memory receipt, bytes memory traceCID, bytes memory fulfillmentCID)
    {
        receipt = receipts[receiptId];
        traceCID = _traceCID[bytes32(receiptId)];
        fulfillmentCID = _fulfillmentCID[bytes32(receiptId)];
    }

    function totalReceipts() external view returns (uint256) {
        return nextReceiptId - 1;
    }
}
