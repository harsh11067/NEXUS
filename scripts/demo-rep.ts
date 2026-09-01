/**
 * demo:rep — reputation is PROOF-ONLY (E-07 / C-19). A direct updateScore from
 * a non-writer wallet REVERTS NotWriter; every real score change on chain
 * carries a receiptHash (shown from the latest ScoreUpdated events).
 *
 *   pnpm demo:rep [agentId]
 *   OG_NETWORK=mainnet pnpm demo:rep
 */
import { keccak256, toUtf8Bytes } from "ethers";
import { reputationRegistry, loadDeployments, getWallet, getProvider, networkName, explorerTx } from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";
import { Evidence } from "./_evidence.js";

async function main() {
  banner(`demo:rep · ${networkName()} · proof-only reputation`);
  const { wallet, provider } = await preflight({ needDeployments: true });
  const ev = new Evidence("rep");
  const agentId = process.argv[2] ?? "1";
  ev.set("agentId", agentId);

  const rep = reputationRegistry(wallet);
  const d = loadDeployments();

  // the operator wallet is NOT a whitelisted writer — only proof contracts are
  const isWriter: boolean = await rep.isWriter(wallet.address);
  ev.assert("operator wallet is not a reputation writer", !isWriter);

  console.log("  attempting a DIRECT score write from a non-writer (must revert)…");
  await ev.expectRevert(
    "direct updateScore by non-writer reverts NotWriter",
    () => rep.updateScore(agentId, 50, keccak256(toUtf8Bytes("fake-receipt"))),
    "NotWriter",
  );
  ok("un-proofed score write blocked on chain ✅");

  // show real, receipt-anchored score history
  console.log("  fetching real ScoreUpdated events (each carries a receiptHash)…");
  const head = await provider.getBlockNumber();
  const topic = rep.interface.getEvent("ScoreUpdated")!.topicHash;
  const logs = await getProvider().getLogs({
    address: d.ReputationRegistry,
    topics: [topic],
    fromBlock: Math.max(0, head - 9000),
    toBlock: head,
  }).catch(() => []);
  const history = logs.slice(-5).map((l) => {
    const p = rep.interface.parseLog({ topics: l.topics as string[], data: l.data })!;
    return {
      agentId: p.args.agentId.toString(),
      newScore: p.args.newScore.toString(),
      receiptHash: p.args.receiptHash,
      tx: l.transactionHash,
      txUrl: explorerTx(l.transactionHash),
    };
  });
  ev.set("recentScoreUpdates", history);
  for (const h of history) info(`agent #${h.agentId}`, `score ${h.newScore} · receipt ${h.receiptHash.slice(0, 14)}…`);
  ev.set("note", "every ScoreUpdated on chain carries a receiptHash; there is no reviews path");

  ev.write();
  ok("proof-only reputation proven live ✅");
}

main().catch((e) => fail(e?.stack ?? String(e)));
