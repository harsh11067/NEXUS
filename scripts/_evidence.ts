/**
 * Append-only evidence artifacts (PROOFS.md §D). Every demo scenario writes a
 * timestamped JSON under evidence/<network>/<ISO-ts>-<scenario>/result.json
 * containing tx hashes, storage roots, and the exact assertions that were
 * checked live. Directories are never overwritten — the artifact is the
 * durable record even after testnet/mainnet state moves on.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { id } from "ethers";
import { networkName, config } from "0g-nexus-sdk";
import { ok } from "./_common.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface Assertion {
  claim: string;
  pass: boolean;
  detail?: string;
}

export class Evidence {
  readonly scenario: string;
  readonly startedAt: string;
  private data: Record<string, unknown> = {};
  private assertions: Assertion[] = [];

  constructor(scenario: string) {
    this.scenario = scenario;
    this.startedAt = new Date().toISOString();
  }

  set(key: string, value: unknown) {
    this.data[key] = value;
  }

  assert(claim: string, pass: boolean, detail?: string) {
    this.assertions.push({ claim, pass, detail });
    if (!pass) throw new Error(`ASSERTION FAILED: ${claim}${detail ? ` — ${detail}` : ""}`);
  }

  /** Record an expected revert: fn must throw with the given custom error.
   *  Matches by name when ethers decodes it, else by the 4-byte selector
   *  (public RPCs often return the raw selector only). */
  async expectRevert(claim: string, fn: () => Promise<unknown>, errorName: string) {
    const selector = id(`${errorName}()`).slice(0, 10);
    try {
      await fn();
      this.assert(claim, false, "call unexpectedly succeeded");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const matched = msg.includes(errorName) || msg.includes(selector);
      this.assert(claim, matched, matched ? `reverted ${errorName} (${selector})` : `wrong error: ${msg.slice(0, 160)}`);
    }
  }

  write(): string {
    const net = networkName();
    const ts = this.startedAt.replace(/[:.]/g, "-");
    const dir = resolve(ROOT, "evidence", net, `${ts}-${this.scenario}`);
    if (existsSync(dir)) throw new Error(`evidence dir already exists (append-only!): ${dir}`);
    mkdirSync(dir, { recursive: true });
    const artifact = {
      scenario: this.scenario,
      network: net,
      chainId: config.chainId(),
      explorer: config.explorerUrl(),
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      assertions: this.assertions,
      ...this.data,
    };
    const p = resolve(dir, "result.json");
    writeFileSync(p, JSON.stringify(artifact, null, 2));
    ok(`evidence written: ${p.replace(ROOT + "/", "")}`);
    return p;
  }
}
