// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {NexusAgent} from "../src/NexusAgent.sol";
import {ProofMeshReceipts} from "../src/ProofMeshReceipts.sol";
import {NexusEscrow} from "../src/NexusEscrow.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {CompositeReceiptMinter} from "../src/CompositeReceiptMinter.sol";

/// @notice Deploys the full NEXUS contract suite to 0G Galileo, wires the
///         reputation writers, and writes deployments/galileo.json.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $OG_RPC_URL --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        uint256 signerPk = vm.envOr("TRUSTED_SIGNER_KEY", deployerPk);
        address signer = vm.addr(signerPk);
        uint256 royalty = vm.envOr("CLONE_ROYALTY_WEI", uint256(0.001 ether));

        vm.startBroadcast(deployerPk);

        ReputationRegistry rep = new ReputationRegistry();
        NexusAgent agent = new NexusAgent(signer, royalty);
        ProofMeshReceipts proof = new ProofMeshReceipts(address(agent), address(rep));
        NexusEscrow escrow = new NexusEscrow(address(agent));
        CompositeReceiptMinter minter =
            new CompositeReceiptMinter(address(proof), address(escrow), address(rep));

        rep.setWriter(address(proof), true);
        rep.setWriter(address(minter), true);

        vm.stopBroadcast();

        console2.log("ReputationRegistry   ", address(rep));
        console2.log("NexusAgent           ", address(agent));
        console2.log("ProofMeshReceipts    ", address(proof));
        console2.log("NexusEscrow          ", address(escrow));
        console2.log("CompositeReceiptMinter", address(minter));
        console2.log("trustedSigner        ", signer);

        // write deployments/galileo.json (consumed by the SDK + frontend)
        string memory obj = "deployment";
        vm.serializeAddress(obj, "ReputationRegistry", address(rep));
        vm.serializeAddress(obj, "NexusAgent", address(agent));
        vm.serializeAddress(obj, "ProofMeshReceipts", address(proof));
        vm.serializeAddress(obj, "NexusEscrow", address(escrow));
        vm.serializeAddress(obj, "trustedSigner", signer);
        vm.serializeUint(obj, "chainId", block.chainid);
        string memory out = vm.serializeAddress(obj, "CompositeReceiptMinter", address(minter));

        vm.writeJson(out, "./deployments/galileo.json");
        console2.log("Wrote deployments/galileo.json");
    }
}
