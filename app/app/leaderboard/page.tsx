"use client";

import { useEffect, useState } from "react";

type Row = {
  agentId: string;
  owner: string;
  score: number;
  tier: string;
  taskCount: number;
  cloneCount: number;
  parentOf: string;
};

const C = {
  bg: "#04060e", panel: "#0b1020", border: "#1b2540", text: "#dce6ff",
  muted: "#8092b8", faint: "#56648a", accent: "#4aa3ff", good: "#3ad07a", warn: "#ffc23a",
};

const TIER_COLORS: Record<string, string> = {
  Elite: "#3ad07a", Verified: "#3ad07a", Trusted: "#4aa3ff",
  Emerging: "#ffc23a", Unverified: "#56648a", Flagged: "#ff5a6a", Banned: "#ff5a6a",
};

function short(s: string) { return s && s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s; }

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<{ network: string; chainId: number; explorerUrl: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard").then((r) => r.json()).then((d) => {
      if (d.error) setErr(d.error);
      else { setRows(d.rows); setMeta(d); }
    }).catch((e) => setErr(String(e)));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "ui-sans-serif,system-ui,Inter,sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ textDecoration: "none", fontSize: 22, fontWeight: 800, letterSpacing: ".04em", background: "linear-gradient(90deg,#cfe2ff,#4aa3ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>NEXUS</a>
          <span style={{ color: C.faint, fontSize: 12, fontFamily: "monospace" }}>trust leaderboard</span>
          {meta && <span style={{ marginLeft: "auto", color: C.faint, fontSize: 12, fontFamily: "monospace" }}>{meta.network} · chainId {meta.chainId}</span>}
        </div>
        <h1 style={{ fontSize: 26, margin: "14px 0 4px" }}>Agent Trust Leaderboard</h1>
        <p style={{ color: C.muted, margin: 0, fontSize: 14 }}>
          Ranked by proof-backed reputation, read straight from the on-chain registry — every score traces to receipts, not reviews.
        </p>

        {err && <div style={{ marginTop: 24, color: "#ff6b7a", background: "rgba(255,90,106,.08)", border: "1px solid rgba(255,90,106,.3)", borderRadius: 10, padding: 14 }}>{err}</div>}
        {!rows && !err && <div style={{ marginTop: 24, color: C.faint }}>Reading chain…</div>}

        {rows && (
          <div style={{ marginTop: 20, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "52px 90px 1fr 110px 90px 90px", gap: 0, padding: "10px 16px", color: C.faint, fontSize: 11, fontFamily: "monospace", borderBottom: `1px solid ${C.border}` }}>
              <span>#</span><span>AGENT</span><span>OWNER</span><span>TIER</span><span>SCORE</span><span>PROVEN</span>
            </div>
            {rows.map((r, i) => (
              <a key={r.agentId} href={`/agent/${r.agentId}`} style={{ display: "grid", gridTemplateColumns: "52px 90px 1fr 110px 90px 90px", padding: "12px 16px", textDecoration: "none", color: C.text, borderBottom: `1px solid ${C.border}`, fontSize: 13, alignItems: "center" }}>
                <span style={{ color: i < 3 ? C.accent : C.faint, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontFamily: "monospace" }}>#{r.agentId}{r.parentOf !== "0" && <span style={{ color: C.faint }} title={`clone of #${r.parentOf}`}> ⑂</span>}</span>
                <span style={{ fontFamily: "monospace", color: C.muted }}>{short(r.owner)}</span>
                <span style={{ color: TIER_COLORS[r.tier] ?? C.muted, fontWeight: 600 }}>{r.tier}</span>
                <span style={{ fontFamily: "monospace" }}>{r.score}</span>
                <span style={{ fontFamily: "monospace", color: r.taskCount > 0 ? C.good : C.faint }}>{r.taskCount} task{r.taskCount === 1 ? "" : "s"}</span>
              </a>
            ))}
            {rows.length === 0 && <div style={{ padding: 20, color: C.faint }}>No agents minted yet.</div>}
          </div>
        )}

        <p style={{ color: C.faint, fontSize: 12, marginTop: 14, fontFamily: "monospace" }}>
          every row → click through to its receipts · scores move only via receipt-anchored on-chain writes
        </p>
      </div>
    </main>
  );
}
