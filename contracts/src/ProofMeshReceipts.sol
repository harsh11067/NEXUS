// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {INexusAgent, IReputationRegistry} from "./interfaces/INexus.sol";

/// @title ProofMeshReceipts
/// @notice Opens and closes per-task sessions. At open it LOCKS the agent's
///         declared policy hash on chain (the rules for this run); at close it
///         anchors the trace bundle reference (0G Storage) and the TEE attestation
///         signature. Full attestation verification happens off-chain against the
///         provider's enclave key — we anchor, we don't re-derive the TDX quote.
contract ProofMeshReceipts {
    enum Status { NONE, OPEN, CLOSED, VIOLATED }

    struct Session {
        uint256 agentId;
        bytes32 policyHash;
        bytes32 taskHash;
        address opener;
        uint64  openedAt;
        uint64  closedAt;
        Status  status;
        bytes32 traceCIDHash;
    }

    INexusAgent public immutable agentRegistry;
    IReputationRegistry public immutable reputation;

    mapping(bytes32 => Session) public sessions;
    mapping(bytes32 => bytes)   private _traceCID;
    mapping(bytes32 => bytes)   private _teeSignature;
    uint256 private _sessionNonce;

    int256 public constant VIOLATION_PENALTY = -50;

    event SessionOpened(bytes32 indexed sessionId, uint256 indexed agentId, bytes32 policyHash);
    event SessionClosed(bytes32 indexed sessionId, uint256 indexed agentId, bytes traceCID, bytes teeSignature);
    event ViolationFlagged(bytes32 indexed sessionId, uint8 violationType);

    error NotAgentOwner();
    error PolicyMismatch();
    error SessionNotOpen();
    error NotOpener();
    error UnknownSession();

    constructor(address agentRegistry_, address reputation_) {
        agentRegistry = INexusAgent(agentRegistry_);
        reputation = IReputationRegistry(reputation_);
    }

    /// @notice Open a session. Caller must own the agent; the supplied policyHash
    ///         must equal the agent's locked policy hash (so the rules can't be
    ///         swapped for this run).
    function openSession(uint256 agentId, bytes32 policyHash, bytes32 taskHash)
        external
        returns (bytes32 sessionId)
    {
        if (
            agentRegistry.ownerOf(agentId) != msg.sender
                && !agentRegistry.isAuthorizedExecutor(agentId, msg.sender)
        ) revert NotAgentOwner();
        if (agentRegistry.getPolicyHash(agentId) != policyHash) revert PolicyMismatch();

        sessionId = keccak256(
            abi.encode(agentId, taskHash, msg.sender, block.chainid, block.timestamp, _sessionNonce++)
        );

        sessions[sessionId] = Session({
            agentId: agentId,
            policyHash: policyHash,
            taskHash: taskHash,
            opener: msg.sender,
            openedAt: uint64(block.timestamp),
            closedAt: 0,
            status: Status.OPEN,
            traceCIDHash: bytes32(0)
        });

        emit SessionOpened(sessionId, agentId, policyHash);
    }

    /// @notice Close a session, anchoring the trace bundle reference and the TEE
    ///         attestation signature returned by Sealed Inference.
    function closeSession(bytes32 sessionId, bytes calldata traceCID, bytes calldata teeSignature) external {
        Session storage s = sessions[sessionId];
        if (s.status != Status.OPEN) revert SessionNotOpen();
        if (s.opener != msg.sender) revert NotOpener();

        s.status = Status.CLOSED;
        s.closedAt = uint64(block.timestamp);
        s.traceCIDHash = keccak256(traceCID);
        _traceCID[sessionId] = traceCID;
        _teeSignature[sessionId] = teeSignature;

        emit SessionClosed(sessionId, s.agentId, traceCID, teeSignature);
    }

    /// @notice Flag a policy violation on a session; applies a negative reputation
    ///         delta tied to this session as the receipt hash.
    function flagViolation(bytes32 sessionId, uint8 violationType, bytes calldata /*evidence*/) external {
        Session storage s = sessions[sessionId];
        if (s.status == Status.NONE) revert UnknownSession();
        if (s.opener != msg.sender) revert NotOpener();

        s.status = Status.VIOLATED;
        reputation.updateScore(s.agentId, VIOLATION_PENALTY, sessionId);
        emit ViolationFlagged(sessionId, violationType);
    }

    /// @notice A session is valid if it is CLOSED and the policy hash it locked
    ///         still equals the agent's current policy hash.
    function verifySession(bytes32 sessionId) external view returns (bool valid, bytes32 traceCIDHash) {
        Session storage s = sessions[sessionId];
        bool ok = s.status == Status.CLOSED
            && agentRegistry.getPolicyHash(s.agentId) == s.policyHash;
        return (ok, s.traceCIDHash);
    }

    // ----------------------------------------------------------------- views
    function agentOf(bytes32 sessionId) external view returns (uint256) {
        return sessions[sessionId].agentId;
    }

    function openerOf(bytes32 sessionId) external view returns (address) {
        return sessions[sessionId].opener;
    }

    function getTraceCID(bytes32 sessionId) external view returns (bytes memory) {
        return _traceCID[sessionId];
    }

    function getTeeSignature(bytes32 sessionId) external view returns (bytes memory) {
        return _teeSignature[sessionId];
    }
}
