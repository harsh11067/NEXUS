// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {NexusAgent} from "../src/NexusAgent.sol";
import {ProofMeshReceipts} from "../src/ProofMeshReceipts.sol";
import {NexusEscrow} from "../src/NexusEscrow.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {CompositeReceiptMinter} from "../src/CompositeReceiptMinter.sol";

contract NexusBase is Test {
    NexusAgent agent;
    ProofMeshReceipts proof;
    NexusEscrow escrow;
    ReputationRegistry rep;
    CompositeReceiptMinter minter;

    uint256 signerPk = 0xA11CE;
    address signer;
    address deployer = address(this);
    address alice = address(0xA1);
    address bob   = address(0xB0B);
    address merchant = address(0xC0FFEE);

    bytes ownerPubKey = hex"0401020304";
    bytes buyerPubKey = hex"04AABBCCDD";
    bytes32 policyHash = keccak256("policy-v1");

    function setUp() public virtual {
        signer = vm.addr(signerPk);

        rep = new ReputationRegistry();
        agent = new NexusAgent(signer, 0.01 ether);
        proof = new ProofMeshReceipts(address(agent), address(rep));
        escrow = new NexusEscrow(address(agent));
        minter = new CompositeReceiptMinter(address(proof), address(escrow), address(rep));

        rep.setWriter(address(proof), true);
        rep.setWriter(address(minter), true);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _mint(address to) internal returns (uint256 id) {
        vm.prank(to);
        id = agent.mint(bytes("og://persona-cid"), policyHash, to, ownerPubKey);
    }

    function _sign(bytes32 digest) internal view returns (bytes memory) {
        bytes32 eth = MessageHashUtils.toEthSignedMessageHash(digest);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, eth);
        return abi.encodePacked(r, s, v);
    }
}

contract NexusAgentTest is NexusBase {
    function test_Mint() public {
        uint256 id = _mint(alice);
        assertEq(id, 1);
        assertEq(agent.ownerOf(id), alice);
        assertEq(agent.getPolicyHash(id), policyHash);
        assertEq(agent.creatorOf(id), alice);
        assertEq(agent.getPersonaRef(id), bytes("og://persona-cid"));
        assertEq(agent.totalMinted(), 1);
    }

    function test_MintIncrementsId() public {
        uint256 a = _mint(alice);
        uint256 b = _mint(bob);
        assertEq(a, 1);
        assertEq(b, 2);
    }

    function test_TransferFromReverts() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(NexusAgent.TransfersDisabled.selector);
        agent.transferFrom(alice, bob, id);
    }

    function test_SafeTransferFromReverts() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(NexusAgent.TransfersDisabled.selector);
        agent.safeTransferFrom(alice, bob, id, "");
    }

    function test_RequestTransferEmitsWithNonce() public {
        uint256 id = _mint(alice);
        vm.expectEmit(true, false, false, true);
        emit NexusAgent.ReEncryptionRequest(id, bytes("og://persona-cid"), buyerPubKey, 0);
        vm.prank(alice);
        agent.requestTransfer(id, bob, buyerPubKey);
    }

    function test_RequestTransfer_OnlyOwner() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(NexusAgent.NotAgentOwner.selector);
        agent.requestTransfer(id, bob, buyerPubKey);
    }

    function test_FinalizeTransfer_RejectsBadSignature() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        agent.requestTransfer(id, bob, buyerPubKey);

        bytes memory badSig = _signWith(0xBAD, agent.transferDigest(id, bytes("new-cid"), keccak256(buyerPubKey), 0));
        vm.expectRevert(NexusAgent.BadSignature.selector);
        agent.finalizeTransfer(id, bytes("new-cid"), badSig);
    }

    function test_FinalizeTransfer_FlipsOwnerAndCipher() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        agent.requestTransfer(id, bob, buyerPubKey);

        bytes memory newCid = bytes("og://reencrypted-for-bob");
        bytes memory sig = _sign(agent.transferDigest(id, newCid, keccak256(buyerPubKey), 0));

        vm.expectEmit(true, true, true, true);
        emit NexusAgent.AgentTransferred(id, alice, bob, newCid);
        agent.finalizeTransfer(id, newCid, sig);

        assertEq(agent.ownerOf(id), bob);
        assertEq(agent.getPersonaRef(id), newCid); // seller's old blob ref is gone
        assertEq(agent.transferNonce(id), 1);       // nonce advanced -> old sig can't replay
    }

    function test_FinalizeTransfer_NoPending() public {
        uint256 id = _mint(alice);
        bytes memory sig = _sign(agent.transferDigest(id, bytes("x"), keccak256(buyerPubKey), 0));
        vm.expectRevert(NexusAgent.NoPendingTransfer.selector);
        agent.finalizeTransfer(id, bytes("x"), sig);
    }

    function test_Clone_PaysRoyaltyAndIsIndependent() public {
        uint256 id = _mint(alice);
        uint256 creatorBefore = alice.balance;

        bytes memory sealedRef = bytes("og://clone-for-bob");
        bytes memory sig = _sign(agent.cloneDigest(id, bob, keccak256(sealedRef), 0));

        vm.prank(bob);
        uint256 newId = agent.clone{value: 0.01 ether}(id, bob, sealedRef, sig);

        assertEq(newId, 2);
        assertEq(agent.ownerOf(newId), bob);
        assertEq(agent.parentOf(newId), id);
        assertEq(agent.creatorOf(newId), alice);            // royalties keep flowing to origin
        assertEq(agent.cloneCount(id), 1);
        assertEq(agent.getPersonaRef(newId), sealedRef);
        assertEq(alice.balance, creatorBefore + 0.01 ether); // royalty paid
    }

    function test_Clone_RefundsOverpayment() public {
        uint256 id = _mint(alice);
        bytes memory sealedRef = bytes("og://clone");
        bytes memory sig = _sign(agent.cloneDigest(id, bob, keccak256(sealedRef), 0));
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        agent.clone{value: 1 ether}(id, bob, sealedRef, sig);
        // bob paid only the 0.01 royalty, rest refunded
        assertEq(bob.balance, bobBefore - 0.01 ether);
    }

    function test_Clone_RevertsLowRoyalty() public {
        uint256 id = _mint(alice);
        bytes memory sealedRef = bytes("og://clone");
        bytes memory sig = _sign(agent.cloneDigest(id, bob, keccak256(sealedRef), 0));
        vm.prank(bob);
        vm.expectRevert(NexusAgent.RoyaltyTooLow.selector);
        agent.clone{value: 0.001 ether}(id, bob, sealedRef, sig);
    }

    function test_AuthorizeUsage() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        agent.authorizeUsage(id, bob, bytes("budget:1"));
        assertTrue(agent.isAuthorizedExecutor(id, bob));
        // executor cannot transfer
        vm.prank(bob);
        vm.expectRevert(NexusAgent.NotAgentOwner.selector);
        agent.requestTransfer(id, bob, buyerPubKey);
    }

    function _signWith(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        bytes32 eth = MessageHashUtils.toEthSignedMessageHash(digest);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, eth);
        return abi.encodePacked(r, s, v);
    }
}

contract ProofMeshTest is NexusBase {
    function test_OpenSession_LocksPolicy() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        assertEq(proof.agentOf(sid), id);
        assertEq(proof.openerOf(sid), alice);
    }

    function test_OpenSession_PolicyMismatchReverts() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(ProofMeshReceipts.PolicyMismatch.selector);
        proof.openSession(id, keccak256("wrong"), keccak256("task"));
    }

    function test_OpenSession_NotOwnerReverts() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(ProofMeshReceipts.NotAgentOwner.selector);
        proof.openSession(id, policyHash, keccak256("task"));
    }

    function test_CloseAndVerifySession() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        proof.closeSession(sid, bytes("og://trace"), bytes("tee-sig"));
        vm.stopPrank();

        (bool valid, bytes32 traceHash) = proof.verifySession(sid);
        assertTrue(valid);
        assertEq(traceHash, keccak256(bytes("og://trace")));
        assertEq(proof.getTeeSignature(sid), bytes("tee-sig"));
    }

    function test_VerifySession_FalseWhenOpen() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        (bool valid,) = proof.verifySession(sid);
        assertFalse(valid);
    }

    function test_FlagViolation_AppliesNegativeRep() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        proof.flagViolation(sid, 1, bytes("evidence"));
        vm.stopPrank();
        (int256 score,, uint256 taskCount) = rep.getScore(id);
        assertEq(score, -50);
        assertEq(taskCount, 1);
    }
}

contract NexusEscrowTest is NexusBase {
    bytes32 sid = keccak256("session-1");

    function _bind(uint256 id, uint256 maxPerTx, uint256 daily) internal {
        address[] memory m = new address[](1);
        m[0] = merchant;
        vm.prank(alice);
        escrow.bindPolicy(sid, id, m, maxPerTx, daily, 1 hours);
    }

    function test_LockFunds_Success() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        bytes32 pid = escrow.lockFunds{value: 0.5 ether}(id, sid, merchant, 0.5 ether);
        assertEq(uint8(escrow.statusOf(pid)), uint8(NexusEscrow.PStatus.LOCKED));
        assertEq(address(escrow).balance, 0.5 ether);
    }

    function test_LockFunds_MerchantNotAllowed() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        vm.expectRevert(NexusEscrow.MerchantNotAllowed.selector);
        escrow.lockFunds{value: 0.5 ether}(id, sid, address(0xDEAD), 0.5 ether);
    }

    function test_LockFunds_OverPerTx() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        vm.expectRevert(NexusEscrow.OverPerTx.selector);
        escrow.lockFunds{value: 2 ether}(id, sid, merchant, 2 ether);
    }

    function test_LockFunds_OverBudget() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 1.5 ether);
        vm.startPrank(alice);
        escrow.lockFunds{value: 1 ether}(id, sid, merchant, 1 ether);
        vm.expectRevert(NexusEscrow.OverBudget.selector);
        escrow.lockFunds{value: 1 ether}(id, sid, merchant, 1 ether);
        vm.stopPrank();
    }

    function test_FulfillAndSettle_ReleasesToMerchant() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        bytes32 pid = escrow.lockFunds{value: 0.5 ether}(id, sid, merchant, 0.5 ether);

        vm.prank(merchant);
        escrow.submitFulfillment(pid, bytes("og://evidence"));

        uint256 before = merchant.balance;
        vm.prank(alice);
        escrow.settlePayment(pid);
        assertTrue(escrow.isSettled(pid));
        assertEq(merchant.balance, before + 0.5 ether);
    }

    function test_Settle_RevertsIfNotFulfilled() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        bytes32 pid = escrow.lockFunds{value: 0.5 ether}(id, sid, merchant, 0.5 ether);
        vm.prank(alice);
        vm.expectRevert(NexusEscrow.NotFulfilled.selector);
        escrow.settlePayment(pid);
    }

    function test_Refund_AfterTtl() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        bytes32 pid = escrow.lockFunds{value: 0.5 ether}(id, sid, merchant, 0.5 ether);

        vm.warp(block.timestamp + 2 hours);
        uint256 before = alice.balance;
        escrow.refund(pid);
        assertEq(uint8(escrow.statusOf(pid)), uint8(NexusEscrow.PStatus.REFUNDED));
        assertEq(alice.balance, before + 0.5 ether);
    }

    function test_Refund_RevertsBeforeTtl() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        bytes32 pid = escrow.lockFunds{value: 0.5 ether}(id, sid, merchant, 0.5 ether);
        vm.expectRevert(NexusEscrow.TtlNotElapsed.selector);
        escrow.refund(pid);
    }

    function test_Dispute_RefundBranch() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        bytes32 pid = escrow.lockFunds{value: 0.5 ether}(id, sid, merchant, 0.5 ether);
        vm.prank(alice);
        escrow.openDispute(pid, bytes("bad"));
        uint256 before = alice.balance;
        escrow.resolveDispute(pid, true, bytes("arb")); // owner == this
        assertEq(alice.balance, before + 0.5 ether);
    }

    function test_Dispute_SettleBranch() public {
        uint256 id = _mint(alice);
        _bind(id, 1 ether, 5 ether);
        vm.prank(alice);
        bytes32 pid = escrow.lockFunds{value: 0.5 ether}(id, sid, merchant, 0.5 ether);
        vm.prank(alice);
        escrow.openDispute(pid, bytes("bad"));
        uint256 before = merchant.balance;
        escrow.resolveDispute(pid, false, bytes("arb"));
        assertEq(merchant.balance, before + 0.5 ether);
    }
}

contract ReputationTest is NexusBase {
    function test_UpdateScore_OnlyWriter() public {
        vm.prank(alice);
        vm.expectRevert(ReputationRegistry.NotWriter.selector);
        rep.updateScore(1, 5, bytes32("r"));
    }

    function test_TierBoundaries() public {
        // make this test a writer for direct manipulation
        rep.setWriter(address(this), true);
        uint256 id = 7;
        // first task -> Emerging
        rep.updateScore(id, 5, bytes32("r1"));
        (, uint8 t1,) = rep.getScore(id);
        assertEq(t1, 1); // Emerging

        rep.updateScore(id, 195, bytes32("r2")); // 200 -> Trusted
        (, uint8 t2,) = rep.getScore(id);
        assertEq(t2, 2);

        rep.updateScore(id, 300, bytes32("r3")); // 500 -> Verified
        (, uint8 t3,) = rep.getScore(id);
        assertEq(t3, 3);

        rep.updateScore(id, 300, bytes32("r4")); // 800 -> Elite
        (, uint8 t4,) = rep.getScore(id);
        assertEq(t4, 4);
    }

    function test_NegativeTiers() public {
        rep.setWriter(address(this), true);
        uint256 id = 9;
        rep.updateScore(id, -50, bytes32("r")); // <0 Flagged
        (, uint8 t,) = rep.getScore(id);
        assertEq(t, 5);
        rep.updateScore(id, -500, bytes32("r2")); // <=-500 Banned
        (, uint8 t2,) = rep.getScore(id);
        assertEq(t2, 6);
    }

    function test_Unverified_NoTasks() public view {
        (int256 s, uint8 t, uint256 c) = rep.getScore(999);
        assertEq(s, 0);
        assertEq(t, 0);
        assertEq(c, 0);
    }
}

contract CompositeMinterTest is NexusBase {
    function setUp() public override {
        super.setUp();
        rep.setWriter(address(minter), true);
    }

    function test_Mint_AfterCloseNoPayment() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        proof.closeSession(sid, bytes("og://trace"), bytes("tee"));
        uint256 rid = minter.mint(id, sid, bytes32(0), bytes("og://trace"), bytes(""));
        vm.stopPrank();

        assertEq(rid, 1);
        (int256 score,, uint256 taskCount) = rep.getScore(id);
        assertEq(score, 5);
        assertEq(taskCount, 1);
        assertEq(minter.receiptOfSession(sid), 1);
    }

    function test_Mint_RevertsIfSessionOpen() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        vm.expectRevert(CompositeReceiptMinter.SessionNotValid.selector);
        minter.mint(id, sid, bytes32(0), bytes("t"), bytes(""));
        vm.stopPrank();
    }

    function test_Mint_RevertsDoubleMint() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        proof.closeSession(sid, bytes("og://trace"), bytes("tee"));
        minter.mint(id, sid, bytes32(0), bytes("og://trace"), bytes(""));
        vm.expectRevert(CompositeReceiptMinter.AlreadyMinted.selector);
        minter.mint(id, sid, bytes32(0), bytes("og://trace"), bytes(""));
        vm.stopPrank();
    }

    function test_Mint_WithSettledPayment() public {
        uint256 id = _mint(alice);
        bytes32 sidHash;
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        sidHash = sid;
        // bind + pay
        address[] memory m = new address[](1);
        m[0] = merchant;
        escrow.bindPolicy(sid, id, m, 1 ether, 5 ether, 1 hours);
        bytes32 pid = escrow.lockFunds{value: 0.2 ether}(id, sid, merchant, 0.2 ether);
        vm.stopPrank();
        vm.prank(merchant);
        escrow.submitFulfillment(pid, bytes("og://evi"));
        vm.prank(alice);
        escrow.settlePayment(pid);

        vm.startPrank(alice);
        proof.closeSession(sid, bytes("og://trace"), bytes("tee"));
        uint256 rid = minter.mint(id, sid, pid, bytes("og://trace"), bytes("og://evi"));
        vm.stopPrank();
        assertEq(rid, 1);
        (int256 score,,) = rep.getScore(id);
        assertEq(score, 5);
    }

    function test_Mint_RevertsUnsettledPayment() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("task"));
        address[] memory m = new address[](1);
        m[0] = merchant;
        escrow.bindPolicy(sid, id, m, 1 ether, 5 ether, 1 hours);
        bytes32 pid = escrow.lockFunds{value: 0.2 ether}(id, sid, merchant, 0.2 ether);
        proof.closeSession(sid, bytes("og://trace"), bytes("tee"));
        vm.expectRevert(CompositeReceiptMinter.PaymentNotSettled.selector);
        minter.mint(id, sid, pid, bytes("og://trace"), bytes("og://evi"));
        vm.stopPrank();
    }
}

contract IntegrationTest is NexusBase {
    function test_FullFlow_CreateRunPayProveScore() public {
        // 1. create
        uint256 id = _mint(alice);

        // 2. open session (locks policy)
        vm.startPrank(alice);
        bytes32 sid = proof.openSession(id, policyHash, keccak256("research top defi"));

        // 3. one spend through escrow
        address[] memory m = new address[](1);
        m[0] = merchant;
        escrow.bindPolicy(sid, id, m, 1 ether, 2 ether, 5 minutes);
        bytes32 pid = escrow.lockFunds{value: 0.12 ether}(id, sid, merchant, 0.12 ether);
        vm.stopPrank();

        vm.prank(merchant);
        escrow.submitFulfillment(pid, bytes("og://coingecko-response"));
        vm.prank(alice);
        escrow.settlePayment(pid);

        // 4. close session with trace + tee sig
        vm.prank(alice);
        proof.closeSession(sid, bytes("og://trace-bundle"), bytes("0xINTEL-TDX-SIG"));

        // 5. mint composite receipt -> reputation up
        vm.prank(alice);
        uint256 rid = minter.mint(id, sid, pid, bytes("og://trace-bundle"), bytes("og://coingecko-response"));

        // assertions: receipt resolves, score increased, payment settled
        (CompositeReceiptMinter.CompositeReceipt memory r,,) = minter.getReceipt(rid);
        assertEq(r.agentId, id);
        assertEq(r.sessionId, sid);
        assertEq(r.paymentId, pid);
        assertTrue(escrow.isSettled(pid));

        (int256 score, uint8 tier, uint256 taskCount) = rep.getScore(id);
        assertEq(score, 5);
        assertEq(taskCount, 1);
        assertEq(tier, 1); // Emerging
    }
}
