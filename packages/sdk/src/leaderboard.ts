/**
 * Agent Trust Leaderboard (N4) + verifiable lineage (FUTURE §1, read layer).
 * Everything here is re-derived from chain state — scores come from
 * ReputationRegistry.getScore (proof-only writes), never from a client-side
 * sort of self-reported numbers (N-L05). Lineage recomputes from parentOf,
 * which only clone() ever sets — fake ancestry is impossible.
 */
import { getProvider } from "./config.js";
import { nexusAgent, reputationRegistry, tierName } from "./contracts.js";

export interface LeaderboardRow {
  agentId: string;
  owner: string;
  score: number;
  tier: string;
  taskCount: number;
  cloneCount: number;
  parentOf: string;
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const provider = getProvider();
  const agent = nexusAgent(provider);
  const rep = reputationRegistry(provider);
  const total = Number(await agent.totalMinted());
  const ids = Array.from({ length: total }, (_, i) => String(i + 1));

  const rows = await Promise.all(
    ids.map(async (agentId): Promise<LeaderboardRow | null> => {
      try {
        const [owner, [score, tier, taskCount], clones, parent] = await Promise.all([
          agent.ownerOf(agentId),
          rep.getScore(agentId),
          agent.cloneCount(agentId),
          agent.parentOf(agentId),
        ]);
        return {
          agentId,
          owner,
          score: Number(score),
          tier: tierName(Number(tier)),
          taskCount: Number(taskCount),
          cloneCount: Number(clones),
          parentOf: parent.toString(),
        };
      } catch {
        return null; // burnt/nonexistent ids don't fake a rank
      }
    }),
  );

  return (rows.filter(Boolean) as LeaderboardRow[])
    .sort((a, b) => b.score - a.score || b.taskCount - a.taskCount || Number(a.agentId) - Number(b.agentId))
    .slice(0, limit);
}

/** Pure, unit-testable sort contract (N-U05). */
export function sortLeaderboard(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort(
    (a, b) => b.score - a.score || b.taskCount - a.taskCount || Number(a.agentId) - Number(b.agentId),
  );
}

export interface Ancestor {
  agentId: string;
  owner: string;
  creator: string;
  score: number;
  tier: string;
}

/** Walk an agent's ancestry (clone chain) up to the original. Recomputed from
 *  parentOf — the chain's own history, impossible to fabricate. */
export async function getLineage(agentId: string, maxDepth = 10): Promise<Ancestor[]> {
  const provider = getProvider();
  const agent = nexusAgent(provider);
  const rep = reputationRegistry(provider);
  const out: Ancestor[] = [];
  let current = agentId;
  for (let depth = 0; depth < maxDepth; depth++) {
    const [owner, creator, [score, tier]] = await Promise.all([
      agent.ownerOf(current),
      agent.creatorOf(current),
      rep.getScore(current),
    ]);
    out.push({ agentId: current, owner, creator, score: Number(score), tier: tierName(Number(tier)) });
    const parent: bigint = await agent.parentOf(current);
    if (parent === 0n) break;
    current = parent.toString();
  }
  return out;
}
