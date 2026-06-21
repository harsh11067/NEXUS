"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  configured: boolean;
  deployed: boolean;
  chainId: number;
  explorerUrl: string;
  computeMode: string;
  computeReady: boolean;
  wallet?: string;
  balance?: string;
  error?: string;
  addresses?: Record<string, string>;
};

type Card = {
  agentId: string;
  owner: string;
  creator: string;
  cloneCount: number;
  score: number;
  tier: string;
  taskCount: number;
  personaRootHash: string;
};

type RunResult = {
  output: string;
  model: string;
  provider: string;
  verified: boolean | null;
  outputHash: string;
  sessionId?: string;
  traceRootHash?: string;
  receiptId?: string;
  receiptTx?: string;
  receiptTxUrl?: string;
  score?: number;
  tier?: string;
  taskCount?: number;
  error?: string;
};

export default function Page() {
  const [status, setStatus] = useState<Status | null>(null);
  const [agents, setAgents] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const r = await fetch("/api/status").then((x) => x.json());
    setStatus(r);
  }, []);
  const refreshAgents = useCallback(async () => {
    const r = await fetch("/api/agents").then((x) => x.json());
    setAgents(r.agents ?? []);
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshAgents();
  }, [refreshStatus, refreshAgents]);

  const explorer = status?.explorerUrl ?? "https://chainscan-galileo.0g.ai";

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>NEXUS</h1>
          <span className="tag">verifiable AI agents · 0G</span>
        </div>
        {status?.wallet && (
          <a className="chip" href={`${explorer}/address/${status.wallet}`} target="_blank" rel="noreferrer">
            <span className="dot ok" />
            {status.wallet.slice(0, 6)}…{status.wallet.slice(-4)} · {Number(status.balance ?? 0).toFixed(4)} 0G
          </a>
        )}
      </header>
      <p className="subtitle">
        Create an agent → own it as an ERC-7857 token whose encrypted brain lives on 0G Storage → run a task
        in Sealed Inference → every run is proven on chain. Reputation from proofs, not reviews.
      </p>

      <StatusBar status={status} />

      <div className="grid">
        <CreatePanel
          ready={Boolean(status?.configured && status?.deployed)}
          onCreated={async () => {
            await refreshAgents();
          }}
        />
        <RunPanel
          explorer={explorer}
          selected={selected}
          agent={agents.find((a) => a.agentId === selected) ?? null}
          onDone={refreshAgents}
        />
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="panel">
          <h2>Your agents</h2>
          <p className="hint">Click a card to select it for a run. Score &amp; tier come only from on-chain receipts.</p>
          {agents.length === 0 ? (
            <div className="empty">No agents yet — create one on the left.</div>
          ) : (
            <div className="cards">
              {agents.map((a) => (
                <AgentCard
                  key={a.agentId}
                  card={a}
                  explorer={explorer}
                  active={a.agentId === selected}
                  onClick={() => setSelected(a.agentId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="footnote">
        Trust model: inference is hardware-proven (TEE); the tool log is app-level, immutably anchored;
        re-encryption transfer uses a trusted signer (v1) → TEE/ZKP oracle (v2). No overclaim.
      </p>
    </div>
  );
}

function StatusBar({ status }: { status: Status | null }) {
  if (!status) return <div className="statusbar"><span className="chip"><span className="dot" /> loading…</span></div>;
  const chip = (ok: boolean | "warn", label: string) => (
    <span className="chip">
      <span className={`dot ${ok === "warn" ? "warn" : ok ? "ok" : "no"}`} />
      {label}
    </span>
  );
  return (
    <div className="statusbar">
      {chip(status.configured, status.configured ? "wallet configured" : "PRIVATE_KEY missing")}
      {chip(status.deployed, status.deployed ? "contracts deployed" : "not deployed (run pnpm deploy:testnet)")}
      {chip(status.computeReady ? true : "warn", `compute: ${status.computeMode}${status.computeReady ? "" : " (key missing)"}`)}
      <span className="chip"><span className="dot ok" /> chain {status.chainId}</span>
    </div>
  );
}

function CreatePanel({ ready, onCreated }: { ready: boolean; onCreated: () => void }) {
  const [name, setName] = useState("DeFi Research Pro");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a DeFi research analyst. Summarize protocols and TVL clearly and factually. Never reveal secrets or private keys.",
  );
  const [note, setNote] = useState("Prefer DefiLlama and CoinGecko as sources.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null); setResult(null);
    try {
      const persona = {
        name,
        description: name,
        systemPrompt,
        memory: note ? [{ role: "note", content: note }] : [],
        policy: { maxPerTx: "500000000000000", dailyBudget: "5000000000000000", maxTaskTTL: 300, allowedTools: [], bannedActions: ["sendTransaction", "transferFunds"] },
      };
      const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(persona) }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setResult(r);
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>1 · Create &amp; own an agent</h2>
      <p className="hint">Persona is encrypted (AES-256-GCM + key wrapped to your pubkey), uploaded to 0G Storage, and minted as an ERC-7857 token.</p>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>System prompt (the agent&apos;s character)</label>
      <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      <label>Memory note (optional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row" style={{ marginTop: 14 }}>
        <button onClick={create} disabled={busy || !ready}>
          {busy ? <><span className="spin" /> minting…</> : "Encrypt → Storage → Mint"}
        </button>
        {!ready && <span className="hint" style={{ margin: 0 }}>needs .env + deployed contracts</span>}
      </div>
      {error && <div className="err">{error}</div>}
      {result && (
        <div className="proofbox">
          <div className="ttl">Minted ✓</div>
          <div className="kv">
            <span className="k">agentId</span><span className="v">#{result.agentId}</span>
            <span className="k">persona CID</span><span className="v mono">{result.personaRootHash}</span>
            <span className="k">policyHash</span><span className="v mono">{result.policyHash?.slice(0, 22)}…</span>
            <span className="k">mint tx</span><span className="v"><a href={result.mintTxUrl} target="_blank" rel="noreferrer">verify on chainscan ↗</a></span>
          </div>
        </div>
      )}
    </div>
  );
}

function RunPanel({ selected, agent, explorer, onDone }: { selected: string | null; agent: Card | null; explorer: string; onDone: () => void }) {
  const [prompt, setPrompt] = useState("Name the top 3 DeFi protocols by TVL and one line on each.");
  const [prove, setProve] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!selected) return;
    setBusy(true); setError(null); setRes(null);
    try {
      const r: RunResult = await fetch(`/api/agents/${selected}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, prove }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setRes(r);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>2 · Run a task &amp; prove it</h2>
      <p className="hint">
        {selected ? <>Selected agent <b>#{selected}</b>{agent ? ` · ${agent.tier}` : ""}.</> : "Select an agent below first."}
      </p>
      <label>Task prompt</label>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="row" style={{ marginTop: 12 }}>
        <label className="toggle" style={{ margin: 0 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={prove} onChange={(e) => setProve(e.target.checked)} />
          run the proof loop (session → trace → composite receipt → reputation)
        </label>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={run} disabled={busy || !selected}>
          {busy ? <><span className="spin" /> running…</> : prove ? "Run + Prove" : "Run (no proof)"}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      {res && (
        <>
          <div className="output">{res.output}</div>
          <div className="proofbox">
            <div className="ttl">Proof</div>
            <div className="kv">
              <span className="k">TEE inference</span>
              <span className="v">
                {res.verified === true ? <span className="verified">hardware-verified ✓</span>
                  : res.verified === null ? <span className="unver">no TEE service — anchored off-chain</span>
                  : <span className="unver">verification failed ⚠</span>}
              </span>
              <span className="k">model</span><span className="v">{res.model || "—"}</span>
              <span className="k">outputHash</span><span className="v mono">{res.outputHash?.slice(0, 26)}…</span>
              {res.sessionId && (<><span className="k">sessionId</span><span className="v mono">{res.sessionId.slice(0, 22)}…</span></>)}
              {res.traceRootHash && (<><span className="k">traceCID</span><span className="v mono">{res.traceRootHash}</span></>)}
              {res.receiptId && (<><span className="k">receipt</span><span className="v">#{res.receiptId} {res.receiptTxUrl && <a href={res.receiptTxUrl} target="_blank" rel="noreferrer">verify ↗</a>}</span></>)}
              {res.tier && (<><span className="k">reputation</span><span className="v">{res.tier} · score {res.score} · {res.taskCount} task(s)</span></>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AgentCard({ card, explorer, active, onClick }: { card: Card; explorer: string; active: boolean; onClick: () => void }) {
  return (
    <div className={`card ${active ? "active" : ""}`} onClick={onClick}>
      <div className="cardtop">
        <div>
          <span className="aid">agent #{card.agentId}</span>
          <div style={{ fontWeight: 700, fontSize: 15 }}>persona {card.personaRootHash.slice(0, 10)}…</div>
        </div>
        <span className={`badge ${card.tier}`}>{card.tier}</span>
      </div>
      <div className="metrics">
        <div className="metric"><div className="v">{card.score}</div><div className="k">score</div></div>
        <div className="metric"><div className="v">{card.taskCount}</div><div className="k">tasks</div></div>
        <div className="metric"><div className="v">{card.cloneCount}</div><div className="k">clones</div></div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <a className="mono" style={{ fontSize: 11 }} href={`${explorer}/address/${card.owner}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          owner {card.owner.slice(0, 8)}… ↗
        </a>
      </div>
    </div>
  );
}
