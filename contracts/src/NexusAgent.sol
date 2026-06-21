// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title NexusAgent  (ERC-7857 — Agentic ID)
/// @notice ERC-721 base + three agent-specific mechanisms:
///         (1) encrypted ownership: the token holds a 0G Storage reference to the
///             owner-encrypted persona, never the plaintext;
///         (2) trustless transfer: ownership only moves through `finalizeTransfer`,
///             after an off-chain re-encryption oracle re-wraps the persona key for
///             the buyer and signs the result (v1 = trusted ECDSA signer);
///         (3) clone with royalty: copy an agent into a new independent token,
///             paying a flat royalty to the original creator.
///
///         Vanilla transferFrom / safeTransferFrom are DISABLED so that "you own the
///         intelligence" is true rather than marketing — a buyer can only receive the
///         token together with a freshly re-encrypted persona blob.
contract NexusAgent is ERC721, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct PendingTransfer {
        address buyer;
        bytes32 buyerPubKeyHash;
        uint256 nonce;
        bool    active;
    }

    uint256 private _nextId = 1;

    mapping(uint256 => bytes)    private _personaCipherRef; // 0G Storage root hash / CID of encrypted persona
    mapping(uint256 => bytes32)  public  policyHash;        // hash of the policy, locked at mint
    mapping(uint256 => address)  public  creator;           // royalty recipient for clones
    mapping(uint256 => bytes)    private _ownerPubKey;      // current owner's public key (for re-encryption)
    mapping(uint256 => uint256)  public  parentOf;          // 0 if original, else the agentId it was cloned from
    mapping(uint256 => uint256)  public  cloneCount;        // number of clones taken of this agent
    mapping(uint256 => uint256)  public  transferNonce;     // per-agent nonce, prevents oracle replay
    mapping(uint256 => PendingTransfer) public pendingTransfer;

    // authorizeUsage: executor may RUN the agent but never transfer/clone it
    mapping(uint256 => mapping(address => bytes)) public usagePermissions;
    mapping(uint256 => mapping(address => bool))  public isAuthorizedExecutor;

    address public trustedSigner;   // re-encryption oracle signer (v1 trust assumption)
    uint256 public cloneRoyalty;    // flat royalty (wei of native 0G) paid to creator on clone

    event AgentMinted(uint256 indexed agentId, address indexed owner, bytes encryptedPersonaCID);
    event ReEncryptionRequest(uint256 indexed agentId, bytes oldCipherRef, bytes buyerPubKey, uint256 nonce);
    event AgentTransferred(uint256 indexed agentId, address indexed from, address indexed to, bytes newCipherRef);
    event AgentCloned(uint256 indexed parentId, uint256 indexed newAgentId, address indexed cloner);
    event UsageAuthorized(uint256 indexed agentId, address indexed executor);
    event SignerUpdated(address indexed signer);
    event CloneRoyaltyUpdated(uint256 royalty);

    error TransfersDisabled();
    error NotAgentOwner();
    error NoPendingTransfer();
    error BadSignature();
    error NonexistentAgent();
    error RoyaltyTooLow();

    constructor(address signer, uint256 royalty)
        ERC721("NEXUS Agent", "NEXUS")
        Ownable(msg.sender)
    {
        trustedSigner = signer == address(0) ? msg.sender : signer;
        cloneRoyalty = royalty;
        emit SignerUpdated(trustedSigner);
    }

    // ----------------------------------------------------------------- admin
    function setSigner(address signer) external onlyOwner {
        trustedSigner = signer;
        emit SignerUpdated(signer);
    }

    function setCloneRoyalty(uint256 royalty) external onlyOwner {
        cloneRoyalty = royalty;
        emit CloneRoyaltyUpdated(royalty);
    }

    // ------------------------------------------------------------------ mint
    /// @notice Mint an agent. Persona is already AES-256-GCM encrypted and
    ///         uploaded to 0G Storage off-chain; `encryptedPersonaCID` is its
    ///         storage reference (root hash). `_policyHash` locks the rules.
    function mint(
        bytes calldata encryptedPersonaCID,
        bytes32 _policyHash,
        address owner_,
        bytes calldata ownerPubKey
    ) external returns (uint256 agentId) {
        agentId = _nextId++;
        _safeMint(owner_, agentId);
        _personaCipherRef[agentId] = encryptedPersonaCID;
        policyHash[agentId] = _policyHash;
        creator[agentId] = owner_;
        _ownerPubKey[agentId] = ownerPubKey;
        emit AgentMinted(agentId, owner_, encryptedPersonaCID);
    }

    // -------------------------------------------------------------- transfer
    /// @notice Step 1 of a trustless transfer. The owner declares the buyer and
    ///         the buyer's public key; the oracle listens for this event.
    function requestTransfer(uint256 agentId, address buyer, bytes calldata buyerPubKey) external {
        if (_ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        uint256 nonce = transferNonce[agentId];
        pendingTransfer[agentId] = PendingTransfer({
            buyer: buyer,
            buyerPubKeyHash: keccak256(buyerPubKey),
            nonce: nonce,
            active: true
        });
        emit ReEncryptionRequest(agentId, _personaCipherRef[agentId], buyerPubKey, nonce);
    }

    /// @notice Step 2. The oracle has re-wrapped the persona key under the buyer's
    ///         pubkey, stored the new blob, and signed (agentId, newCipherRef,
    ///         keccak(buyerPubKey), nonce). On a valid signature ownership flips and
    ///         the cipher reference updates — the seller's old blob is now
    ///         undecryptable by them, so they provably lost access.
    function finalizeTransfer(
        uint256 agentId,
        bytes calldata newCipherRef,
        bytes calldata signature
    ) external {
        PendingTransfer memory p = pendingTransfer[agentId];
        if (!p.active) revert NoPendingTransfer();

        bytes32 digest = transferDigest(agentId, newCipherRef, p.buyerPubKeyHash, p.nonce);
        address rec = digest.toEthSignedMessageHash().recover(signature);
        if (rec != trustedSigner) revert BadSignature();

        address from = _ownerOf(agentId);
        address to = p.buyer;

        // move ownership without the usual approval checks (transferFrom is disabled)
        _update(to, agentId, address(0));

        _personaCipherRef[agentId] = newCipherRef;
        // buyer pubkey hash is known; the full buyer pubkey is supplied off-chain on next request
        delete pendingTransfer[agentId];
        transferNonce[agentId] = p.nonce + 1;

        emit AgentTransferred(agentId, from, to, newCipherRef);
    }

    /// @notice Deterministic digest the oracle must sign. Bound to this contract
    ///         and chain id so a signature cannot be replayed elsewhere.
    function transferDigest(
        uint256 agentId,
        bytes memory newCipherRef,
        bytes32 buyerPubKeyHash,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(address(this), block.chainid, agentId, keccak256(newCipherRef), buyerPubKeyHash, nonce)
        );
    }

    // ----------------------------------------------------------------- clone
    /// @notice Clone an agent into a NEW independent token re-encrypted for `to`.
    ///         A flat royalty (native 0G) is paid to the original creator. The
    ///         oracle signs (newAgentId is unknown pre-mint, so we bind to the
    ///         parent agentId + the cloner + nonce instead).
    function clone(
        uint256 agentId,
        address to,
        bytes calldata sealedKey,     // new persona cipher ref, re-encrypted for `to`
        bytes calldata signature
    ) external payable returns (uint256 newAgentId) {
        if (_ownerOf(agentId) == address(0)) revert NonexistentAgent();
        if (msg.value < cloneRoyalty) revert RoyaltyTooLow();

        uint256 nonce = transferNonce[agentId];
        bytes32 digest = cloneDigest(agentId, to, keccak256(sealedKey), nonce);
        address rec = digest.toEthSignedMessageHash().recover(signature);
        if (rec != trustedSigner) revert BadSignature();
        transferNonce[agentId] = nonce + 1;

        newAgentId = _nextId++;
        _safeMint(to, newAgentId);
        _personaCipherRef[newAgentId] = sealedKey;
        policyHash[newAgentId] = policyHash[agentId];
        creator[newAgentId] = creator[agentId]; // royalties keep flowing to the origin creator
        _ownerPubKey[newAgentId] = bytes("");    // buyer supplies pubkey on next interaction
        parentOf[newAgentId] = agentId;
        cloneCount[agentId] += 1;

        address royaltyTo = creator[agentId];
        if (cloneRoyalty > 0 && royaltyTo != address(0)) {
            (bool ok, ) = payable(royaltyTo).call{value: cloneRoyalty}("");
            require(ok, "royalty xfer failed");
        }
        // refund any overpayment
        uint256 excess = msg.value - cloneRoyalty;
        if (excess > 0) {
            (bool ok2, ) = payable(msg.sender).call{value: excess}("");
            require(ok2, "refund failed");
        }

        emit AgentCloned(agentId, newAgentId, msg.sender);
    }

    function cloneDigest(uint256 agentId, address to, bytes32 sealedKeyHash, uint256 nonce)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(address(this), block.chainid, "CLONE", agentId, to, sealedKeyHash, nonce));
    }

    // ------------------------------------------------------- authorize usage
    function authorizeUsage(uint256 agentId, address executor, bytes calldata permissions) external {
        if (_ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        usagePermissions[agentId][executor] = permissions;
        isAuthorizedExecutor[agentId][executor] = true;
        emit UsageAuthorized(agentId, executor);
    }

    function revokeUsage(uint256 agentId, address executor) external {
        if (_ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        isAuthorizedExecutor[agentId][executor] = false;
        delete usagePermissions[agentId][executor];
    }

    // ----------------------------------------------------------------- views
    function getPersonaRef(uint256 agentId) external view returns (bytes memory) {
        return _personaCipherRef[agentId];
    }

    function getPolicyHash(uint256 agentId) external view returns (bytes32) {
        return policyHash[agentId];
    }

    function ownerPubKeyOf(uint256 agentId) external view returns (bytes memory) {
        return _ownerPubKey[agentId];
    }

    function creatorOf(uint256 agentId) external view returns (address) {
        return creator[agentId];
    }

    function cloneCountOf(uint256 agentId) external view returns (uint256) {
        return cloneCount[agentId];
    }

    function exists(uint256 agentId) external view returns (bool) {
        return _ownerOf(agentId) != address(0);
    }

    function totalMinted() external view returns (uint256) {
        return _nextId - 1;
    }

    // ----------------------------------------- disable vanilla ERC721 moves
    function transferFrom(address, address, uint256) public pure override {
        revert TransfersDisabled();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert TransfersDisabled();
    }
}
