// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.25;

interface IERC8004Identity {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/// @title ERC8004ValidationRegistry
/// @notice Interface-faithful, non-upgradeable deployment of the ERC-8004
///         (Trustless Agents, Draft) Validation Registry, pointed at the
///         CANONICAL ERC-8004 Identity Registry on this chain.
///
///         Why NEXUS deploys it: the erc-8004 team's canonical Identity and
///         Reputation registries are live on 0G (0x8004A...432 / 0x8004B...b63
///         on mainnet), but the Validation Registry portion of the spec is
///         still "under active update and discussion with the TEE community"
///         and has NO canonical deployment on any chain yet. NEXUS pins the
///         current reference interface (functions + events byte-identical to
///         erc-8004/erc-8004-contracts ValidationRegistryUpgradeable) so that
///         when the canonical registry lands, only the address changes.
///         Honest status: interface-canonical, deployment-interim.
contract ERC8004ValidationRegistry {
    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );

    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    struct ValidationStatus {
        address validatorAddress;
        uint256 agentId;
        uint8 response; // 0..100
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool hasResponse;
    }

    error BadValidator();
    error RequestExists();
    error NotAuthorized();
    error UnknownRequest();
    error NotValidator();
    error ResponseTooLarge();

    address public immutable identityRegistry;

    mapping(bytes32 => ValidationStatus) private _validations;
    mapping(uint256 => bytes32[]) private _agentValidations;
    mapping(address => bytes32[]) private _validatorRequests;

    constructor(address identityRegistry_) {
        require(identityRegistry_ != address(0), "bad identity");
        identityRegistry = identityRegistry_;
    }

    function getIdentityRegistry() external view returns (address) {
        return identityRegistry;
    }

    /// @notice Ask `validatorAddress` to validate agent `agentId`.
    ///         Caller must be the agent's owner or an approved operator in the
    ///         canonical ERC-8004 Identity Registry (spec MUST).
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        if (validatorAddress == address(0)) revert BadValidator();
        if (_validations[requestHash].validatorAddress != address(0)) revert RequestExists();

        IERC8004Identity registry = IERC8004Identity(identityRegistry);
        address owner = registry.ownerOf(agentId);
        if (
            msg.sender != owner &&
            !registry.isApprovedForAll(owner, msg.sender) &&
            registry.getApproved(agentId) != msg.sender
        ) revert NotAuthorized();

        _validations[requestHash] = ValidationStatus({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp,
            hasResponse: false
        });
        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    /// @notice The requested validator posts (or updates) its response, 0..100.
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        ValidationStatus storage s = _validations[requestHash];
        if (s.validatorAddress == address(0)) revert UnknownRequest();
        if (msg.sender != s.validatorAddress) revert NotValidator();
        if (response > 100) revert ResponseTooLarge();
        s.response = response;
        s.responseHash = responseHash;
        s.tag = tag;
        s.lastUpdate = block.timestamp;
        s.hasResponse = true;
        emit ValidationResponse(s.validatorAddress, s.agentId, requestHash, response, responseURI, responseHash, tag);
    }

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
        )
    {
        ValidationStatus storage s = _validations[requestHash];
        return (s.validatorAddress, s.agentId, s.response, s.responseHash, s.tag, s.lastUpdate, s.hasResponse);
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentValidations[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    /// @notice Average response over an agent's answered validations
    ///         (optionally filtered to one validator). Mirrors the reference
    ///         getSummary shape: (count, averageResponse).
    function getSummary(uint256 agentId, address validatorAddress)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        bytes32[] storage hashes = _agentValidations[agentId];
        uint256 sum;
        for (uint256 i; i < hashes.length; i++) {
            ValidationStatus storage s = _validations[hashes[i]];
            if (!s.hasResponse) continue;
            if (validatorAddress != address(0) && s.validatorAddress != validatorAddress) continue;
            sum += s.response;
            count++;
        }
        averageResponse = count == 0 ? 0 : uint8(sum / count);
    }
}
