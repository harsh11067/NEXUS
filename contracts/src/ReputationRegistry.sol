// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationRegistry
/// @notice Proof-derived reputation. Scores are written ONLY by authorized
///         NEXUS contracts (ProofMeshReceipts, NexusEscrow, CompositeReceiptMinter)
///         and every change carries a `receiptHash` tracing to an on-chain proof.
///         There are no user-vote inputs — that is what makes it ungameable.
contract ReputationRegistry is Ownable {
    // tier ids
    uint8 constant TIER_UNVERIFIED = 0;
    uint8 constant TIER_EMERGING   = 1;
    uint8 constant TIER_TRUSTED    = 2;
    uint8 constant TIER_VERIFIED   = 3;
    uint8 constant TIER_ELITE      = 4;
    uint8 constant TIER_FLAGGED    = 5;
    uint8 constant TIER_BANNED     = 6;

    struct Rep {
        int256  score;
        uint256 taskCount;
        uint256 successCount;
        uint256 violations;
        bool    flagged;
        bool    initialized;
        uint256 lastUpdated;
    }

    mapping(uint256 => Rep) private _rep;
    mapping(address => bool) public isWriter;

    event WriterSet(address indexed writer, bool allowed);
    event ScoreUpdated(uint256 indexed agentId, int256 newScore, bytes32 receiptHash);
    event AgentFlagged(uint256 indexed agentId, bytes evidence);

    error NotWriter();

    modifier onlyWriter() {
        if (!isWriter[msg.sender]) revert NotWriter();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setWriter(address writer, bool allowed) external onlyOwner {
        isWriter[writer] = allowed;
        emit WriterSet(writer, allowed);
    }

    /// @notice Apply a score delta. Positive deltas count as completed tasks,
    ///         negative deltas count as violations. Caller must be authorized.
    function updateScore(uint256 agentId, int256 delta, bytes32 receiptHash) external onlyWriter {
        Rep storage r = _rep[agentId];
        r.initialized = true;
        r.score += delta;
        if (delta > 0) {
            r.taskCount += 1;
            r.successCount += 1;
        } else if (delta < 0) {
            r.taskCount += 1;
            r.violations += 1;
        }
        r.lastUpdated = block.timestamp;
        emit ScoreUpdated(agentId, r.score, receiptHash);
    }

    function flagAgent(uint256 agentId, bytes calldata evidence) external onlyWriter {
        _rep[agentId].flagged = true;
        _rep[agentId].initialized = true;
        emit AgentFlagged(agentId, evidence);
    }

    function unflagAgent(uint256 agentId) external onlyOwner {
        _rep[agentId].flagged = false;
    }

    function getScore(uint256 agentId)
        external
        view
        returns (int256 score, uint8 tier, uint256 taskCount)
    {
        Rep storage r = _rep[agentId];
        return (r.score, _tier(r), r.taskCount);
    }

    function getRep(uint256 agentId)
        external
        view
        returns (
            int256 score,
            uint256 taskCount,
            uint256 successCount,
            uint256 violations,
            bool flagged,
            uint8 tier
        )
    {
        Rep storage r = _rep[agentId];
        return (r.score, r.taskCount, r.successCount, r.violations, r.flagged, _tier(r));
    }

    function _tier(Rep storage r) private view returns (uint8) {
        if (!r.initialized || r.taskCount == 0) return TIER_UNVERIFIED;
        if (r.flagged) return TIER_FLAGGED;
        if (r.score <= -500) return TIER_BANNED;
        if (r.score < 0) return TIER_FLAGGED;
        if (r.score >= 800) return TIER_ELITE;
        if (r.score >= 500) return TIER_VERIFIED;
        if (r.score >= 200) return TIER_TRUSTED;
        return TIER_EMERGING; // 0..200
    }
}
