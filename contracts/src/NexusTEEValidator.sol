// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IERC8004Validation {
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external;

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate,
            bool hasResponse
        );
}

/// @title NexusTEEValidator
/// @notice NEXUS's ERC-8004 validator: it answers Validation Registry requests
///         with results derived from 0G Sealed Inference (TEE) runs.
///
///         Flow: a client calls `validationRequest(thisValidator, agentId, ...)`
///         on the ERC-8004 Validation Registry. NEXUS re-executes/attests the
///         task inside 0G Sealed Inference, anchors the validation report on
///         0G Storage, and the NEXUS trusted signer (the same v1 oracle that
///         signs re-encryption transfers) signs the result. Anyone holding
///         that signature can then relay `respond` — the signature, not the
///         sender, is the authority. The registry only accepts the response
///         because THIS contract is the requested validatorAddress.
///
///         Trust model (v1, stated): the enclave proof for the underlying run
///         is independently checkable via 0G's processResponse(provider,
///         chatID); the binding of that run to this response is attested by
///         the trusted ECDSA signer, moving to a TEE/ZKP oracle in v2.
contract NexusTEEValidator is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    error BadSignature();
    error AlreadyResponded();
    error ZeroAddress();

    IERC8004Validation public immutable registry;
    address public trustedSigner;

    /// requestHash => the NEXUS evidence hash it was answered with
    mapping(bytes32 => bytes32) public evidenceOf;
    mapping(bytes32 => bool) public responded;

    event ValidationPosted(
        bytes32 indexed requestHash,
        uint256 indexed agentId,
        uint8 response,
        bytes32 responseHash,
        string responseURI
    );
    event SignerUpdated(address indexed signer);

    constructor(address registry_, address trustedSigner_) Ownable(msg.sender) {
        if (registry_ == address(0) || trustedSigner_ == address(0)) revert ZeroAddress();
        registry = IERC8004Validation(registry_);
        trustedSigner = trustedSigner_;
    }

    function setTrustedSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        trustedSigner = signer;
        emit SignerUpdated(signer);
    }

    /// @notice Digest the trusted signer must sign for a response. Binds this
    ///         validator, this chain, the request, the agent, the score and the
    ///         report hash — so a signature can never be replayed for another
    ///         request, agent, chain, or validator instance.
    function responseDigest(
        bytes32 requestHash,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode("NEXUS_TEE_VALIDATION", address(this), block.chainid, requestHash, agentId, response, responseHash)
        );
    }

    /// @notice Post a TEE-derived validation response into the ERC-8004
    ///         Validation Registry. Callable by anyone carrying a valid
    ///         trusted-signer signature (relay-friendly); each request is
    ///         answered exactly once (idempotence guard N-C05).
    /// @param requestHash  the ERC-8004 validation request being answered
    /// @param agentId      the ERC-8004 agentId the request targets (bound into the digest)
    /// @param response     score 0..100 (100 = fully TEE-verified)
    /// @param responseURI  0G Storage URI of the validation report JSON
    /// @param responseHash keccak256 of the validation report file
    /// @param signature    trusted-signer ECDSA over responseDigest(...)
    function respond(
        bytes32 requestHash,
        uint256 agentId,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        bytes calldata signature
    ) external {
        if (responded[requestHash]) revert AlreadyResponded();

        bytes32 digest = responseDigest(requestHash, agentId, response, responseHash);
        address rec = digest.toEthSignedMessageHash().recover(signature);
        if (rec != trustedSigner) revert BadSignature();

        // Registry-side checks bind the rest: it only accepts msg.sender ==
        // the validatorAddress named in the request, and knows the request's
        // agentId. Verify the agent binding here too (N-C04).
        (, uint256 reqAgentId,,,,,) = registry.getValidationStatus(requestHash);
        if (reqAgentId != agentId) revert BadSignature();

        responded[requestHash] = true;
        evidenceOf[requestHash] = responseHash;

        registry.validationResponse(requestHash, response, responseURI, responseHash, "tee-sealed-inference");
        emit ValidationPosted(requestHash, agentId, response, responseHash, responseURI);
    }
}
