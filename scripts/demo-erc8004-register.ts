/**
 * demo:erc8004-register — register a NEXUS agent in the CANONICAL ERC-8004
 * Identity Registry on this chain (N-R02), host its agent card on 0G Storage,
 * then retrieve + integrity-check the card against the on-chain content hash
 * (N-R03) and resolve the reverse link (NEXUS agent → portable identity).
 *
 *   pnpm demo:erc8004-register [nexusAgentId]
 *   OG_NETWORK=mainnet pnpm demo:erc8004-register 1
 */
import {
  registerIdentity,
  fetchAndVerifyCard,
  findIdentity,
  erc8004Identity,
  networkName,
  network,
  explorerTx,
  explorerAddress,
} from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

async function main() {
  banner(`demo:erc8004-register · ${networkName()} · portable identity`);
  const { wallet, provider } = await preflight({ needDeployments: true });
  const ev = new Evidence("erc8004-register");
  const nexusAgentId = process.argv[2] ?? "1";
  ev.set("nexusAgentId", nexusAgentId);
  ev.set("identityRegistry", network().erc8004.identity);

  // canonical registry must be real code on this chain (never trust a doc)
  const code = await provider.getCode(network().erc8004.identity);
  ev.assert("canonical ERC-8004 Identity Registry has live code on this chain", code !== "0x", `${(code.length - 2) / 2} bytes`);

  // idempotence: an agent already carrying a portable identity is re-verified,
  // not re-registered
  const existing = await findIdentity(nexusAgentId);
  if (existing) {
    ev.set("alreadyRegistered", existing);
    ok(`NEXUS agent #${nexusAgentId} already has ERC-8004 identity #${existing.erc8004AgentId} — re-verifying it`);
    const check = await fetchAndVerifyCard(existing.erc8004AgentId);
    ev.assert("existing agent card retrieves + hash matches on-chain", check.hashMatches, check.contentHash);
    const owner: string = await erc8004Identity(provider).ownerOf(existing.erc8004AgentId);
    ev.assert("existing identity owned by the NEXUS owner wallet", owner.toLowerCase() === wallet.address.toLowerCase());
    ev.write();
    ok("portable identity re-verified ✅");
    return;
  }

  console.log("  uploading agent card to 0G Storage + registering identity…");
  const reg = await registerIdentity(nexusAgentId, wallet);
  ev.set("registration", reg);
  info("erc8004AgentId", reg.erc8004AgentId);
  info("registerTx", reg.registerTx);
  info("agentURI", reg.agentURI);
  ok(`registered → ${explorerTx(reg.registerTx)}`);

  // N-R03: retrieve the card, Merkle-verified by the storage exchange, and
  // check its keccak against the on-chain metadata
  console.log("  retrieving card from 0G Storage + checking content hash…");
  const check = await fetchAndVerifyCard(reg.erc8004AgentId);
  ev.set("cardCheck", {
    agentURI: check.agentURI,
    contentHash: check.contentHash,
    onChainHash: check.onChainHash,
    hashMatches: check.hashMatches,
    cardName: check.card.name,
  });
  ev.assert("agent card retrieves from 0G Storage and parses", !!check.card.name);
  ev.assert("card keccak256 == on-chain agentCardHash metadata", check.hashMatches, check.contentHash);

  // the ERC-721 identity resolves
  const owner: string = await erc8004Identity(provider).ownerOf(reg.erc8004AgentId);
  ev.assert("ERC-8004 tokenId resolves on-chain to the NEXUS owner wallet", owner.toLowerCase() === wallet.address.toLowerCase(), owner);

  // reverse lookup from the NEXUS agent id via on-chain metadata
  console.log("  resolving NEXUS agent → portable identity from chain events…");
  const found = await findIdentity(nexusAgentId);
  ev.set("reverseLookup", found);
  ev.assert("reverse lookup (nexusAgent link metadata) finds the same identity", found?.erc8004AgentId === reg.erc8004AgentId);

  ev.set("registryExplorer", explorerAddress(network().erc8004.identity));
  ev.write();
  ok(`NEXUS agent #${nexusAgentId} is now ERC-8004 agent #${reg.erc8004AgentId} — portable, discoverable, integrity-checked ✅`);
}

main().catch((e) => fail(e?.stack ?? String(e)));
