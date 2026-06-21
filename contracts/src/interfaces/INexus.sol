// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @dev Minimal cross-contract interfaces used inside the NEXUS system.
///      Kept small on purpose so each contract only depends on what it calls.

interface INexusAgent {
    function ownerOf(uint256 agentId) external view returns (address);
    function getPolicyHash(uint256 agentId) external view returns (bytes32);
    function creatorOf(uint256 agentId) external view returns (address);
    function exists(uint256 agentId) external view returns (bool);
    function isAuthorizedExecutor(uint256 agentId, address who) external view returns (bool);
}

interface IReputationRegistry {
    function updateScore(uint256 agentId, int256 delta, bytes32 receiptHash) external;
    function flagAgent(uint256 agentId, bytes calldata evidence) external;
    function getScore(uint256 agentId) external view returns (int256 score, uint8 tier, uint256 taskCount);
}

interface IProofMeshReceipts {
    function verifySession(bytes32 sessionId) external view returns (bool valid, bytes32 traceCIDHash);
    function agentOf(bytes32 sessionId) external view returns (uint256);
    function openerOf(bytes32 sessionId) external view returns (address);
}

interface INexusEscrow {
    function isSettled(bytes32 paymentId) external view returns (bool);
    function agentOf(bytes32 paymentId) external view returns (uint256);
}
