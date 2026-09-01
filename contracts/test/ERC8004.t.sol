// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {ERC8004ValidationRegistry} from "../src/ERC8004ValidationRegistry.sol";
import {NexusTEEValidator} from "../src/NexusTEEValidator.sol";

/// Minimal stand-in for the canonical ERC-8004 Identity Registry (only the
/// three views the Validation Registry consults). Unit tier only — Tier 2
/// hits the real canonical registry on 0G.
contract MockIdentity {
    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public approvals;
    mapping(address => mapping(address => bool)) public operatorApprovals;

    function mint(uint256 id, address to) external { owners[id] = to; }
    function approve(uint256 id, address to) external { approvals[id] = to; }
    function setApprovalForAll(address owner, address op, bool ok) external { operatorApprovals[owner][op] = ok; }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = owners[tokenId];
        require(o != address(0), "nonexistent");
        return o;
    }
    function getApproved(uint256 tokenId) external view returns (address) { return approvals[tokenId]; }
    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return operatorApprovals[owner][operator];
    }
}

contract ERC8004Test is Test {
    using MessageHashUtils for bytes32;

    MockIdentity identity;
    ERC8004ValidationRegistry registry;
    NexusTEEValidator validator;

    uint256 signerPk = 0xA11CE;
    address signer;
    address agentOwner = address(0xA1);
    address stranger = address(0xBAD);

    uint256 agentId = 7;
    bytes32 requestHash = keccak256("request-1");
    bytes32 reportHash = keccak256("validation-report-1");

    function setUp() public {
        signer = vm.addr(signerPk);
        identity = new MockIdentity();
        registry = new ERC8004ValidationRegistry(address(identity));
        validator = new NexusTEEValidator(address(registry), signer);
        identity.mint(agentId, agentOwner);
    }

    function _sign(bytes32 reqHash, uint256 aid, uint8 response, bytes32 respHash) internal view returns (bytes memory) {
        bytes32 digest = validator.responseDigest(reqHash, aid, response, respHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest.toEthSignedMessageHash());
        return abi.encodePacked(r, s, v);
    }

    function _request() internal {
        vm.prank(agentOwner);
        registry.validationRequest(address(validator), agentId, "0g://storage/req", requestHash);
    }

    // N-C01: request by non-owner/operator reverts
    function test_requestByStrangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(ERC8004ValidationRegistry.NotAuthorized.selector);
        registry.validationRequest(address(validator), agentId, "uri", requestHash);
    }

    function test_requestByApprovedOperatorWorks() public {
        identity.setApprovalForAll(agentOwner, stranger, true);
        vm.prank(stranger);
        registry.validationRequest(address(validator), agentId, "uri", requestHash);
        (address v,,,,,, ) = registry.getValidationStatus(requestHash);
        assertEq(v, address(validator));
    }

    // N-C02: valid trusted-signer attestation => response recorded + events
    function test_respondWithValidSignature() public {
        _request();
        bytes memory sig = _sign(requestHash, agentId, 100, reportHash);
        validator.respond(requestHash, agentId, 100, "0g://storage/report", reportHash, sig);

        (, uint256 aid, uint8 response, bytes32 rh,,, bool has) = registry.getValidationStatus(requestHash);
        assertEq(aid, agentId);
        assertEq(response, 100);
        assertEq(rh, reportHash);
        assertTrue(has);
        assertEq(validator.evidenceOf(requestHash), reportHash);
    }

    // N-C03: forged attestation rejected
    function test_respondWithForgedSignatureReverts() public {
        _request();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            0xE71E, // any key that is not the trusted signer
            validator.responseDigest(requestHash, agentId, 100, reportHash).toEthSignedMessageHash()
        );
        vm.expectRevert(NexusTEEValidator.BadSignature.selector);
        validator.respond(requestHash, agentId, 100, "uri", reportHash, abi.encodePacked(r, s, v));
    }

    // N-C04: response binds agentId + requestHash — mismatches revert
    function test_respondAgentMismatchReverts() public {
        _request();
        // signature made for a DIFFERENT agentId
        bytes memory sig = _sign(requestHash, agentId + 1, 100, reportHash);
        vm.expectRevert(NexusTEEValidator.BadSignature.selector);
        validator.respond(requestHash, agentId + 1, 100, "uri", reportHash, sig);
    }

    function test_respondRequestMismatchReverts() public {
        _request();
        bytes32 otherReq = keccak256("request-2");
        bytes memory sig = _sign(otherReq, agentId, 100, reportHash);
        // otherReq was never requested -> registry has no entry -> agent binding check fails
        vm.expectRevert(NexusTEEValidator.BadSignature.selector);
        validator.respond(otherReq, agentId, 100, "uri", reportHash, sig);
    }

    // N-C05: replay/idempotence — same request cannot be re-answered, same
    //        requestHash cannot be re-requested
    function test_doubleRespondReverts() public {
        _request();
        bytes memory sig = _sign(requestHash, agentId, 100, reportHash);
        validator.respond(requestHash, agentId, 100, "uri", reportHash, sig);
        vm.expectRevert(NexusTEEValidator.AlreadyResponded.selector);
        validator.respond(requestHash, agentId, 100, "uri", reportHash, sig);
    }

    function test_duplicateRequestReverts() public {
        _request();
        vm.prank(agentOwner);
        vm.expectRevert(ERC8004ValidationRegistry.RequestExists.selector);
        registry.validationRequest(address(validator), agentId, "uri", requestHash);
    }

    // registry accepts responses only from the requested validator
    function test_directResponseByStrangerReverts() public {
        _request();
        vm.prank(stranger);
        vm.expectRevert(ERC8004ValidationRegistry.NotValidator.selector);
        registry.validationResponse(requestHash, 100, "uri", reportHash, "tag");
    }

    function test_responseOver100Reverts() public {
        _request();
        bytes memory sig = _sign(requestHash, agentId, 101, reportHash);
        vm.expectRevert(ERC8004ValidationRegistry.ResponseTooLarge.selector);
        validator.respond(requestHash, agentId, 101, "uri", reportHash, sig);
    }

    // chain-id binding: a signature for another chain must not verify
    function test_signatureBoundToChain() public {
        _request();
        bytes memory sig = _sign(requestHash, agentId, 100, reportHash);
        vm.chainId(999);
        vm.expectRevert(NexusTEEValidator.BadSignature.selector);
        validator.respond(requestHash, agentId, 100, "uri", reportHash, sig);
    }

    function test_summaryAverages() public {
        _request();
        bytes memory sig = _sign(requestHash, agentId, 80, reportHash);
        validator.respond(requestHash, agentId, 80, "uri", reportHash, sig);

        bytes32 req2 = keccak256("request-2");
        vm.prank(agentOwner);
        registry.validationRequest(address(validator), agentId, "uri2", req2);
        bytes memory sig2 = _sign(req2, agentId, 100, reportHash);
        validator.respond(req2, agentId, 100, "uri2", reportHash, sig2);

        (uint64 count, uint8 avg) = registry.getSummary(agentId, address(validator));
        assertEq(count, 2);
        assertEq(avg, 90);
    }
}
