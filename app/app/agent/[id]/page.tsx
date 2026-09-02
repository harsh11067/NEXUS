"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../lib/client-net";
import { NetworkSwitch } from "../../lib/NetworkSwitch";

type NexusCard = {
  agentId: string; owner: string; creator: string; policyHash: string;
  cloneCount: number; parentOf: string; score: number; tier: string;
  taskCount: number; personaRootHash: string;
};
type Validation = { requestHash: string; response: number; responseHash: string; hasResponse: boolean; lastUpdate: number };
type Erc8004 = {
  erc8004AgentId: string; identityRegistry: string; identityRegistryUrl: string; agentURI: string;
  cardCheck: { hashMatches: boolean; contentHash: string; agentURI: string; name: string } | null;
  validations: Validation[]; validationRegistry: string | null; validator: string | null;
};
type Ancestor = { agentId: string; owner: string; creator: string; score: number; tier: string };
type CardResponse = {
  network: string; chainId: number; explorerUrl: string; agentUrl: string;
  nexus: NexusCard; erc8004: Erc8004 | null; lineage: Ancestor[]; cardJson: unknown; error?: string;
};

const C = {
  bg: "#04060e", panel: "#0b1020", border: "#1b2540", text: "#dce6ff",
  muted: "#8092b8", faint: "#56648a", accent: "#4aa3ff", good: "#3ad07a", warn: "#ffc23a",
};

function short(s: string, h = 10, t = 6) { return s && s.length > h + t + 2 ? `${s.slice(0, h)}…${s.slice(-t)}` : s; }

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<CardResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(api(`/api/agentcard/${id}`)).then((r) => r.json()).then((res) => {
      if (res.error) setErr(res.error); else setD(res);
    }).catch((e) => setErr(String(e)));
  }, [id]);

  function copyBadge() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(
      `<a href="${origin}/agent/${id}"><img src="${origin}/api/badge/agent/${id}" alt="NEXUS agent #${id}" /></a>`,
    ).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  }

  const n = d?.nexus;
  const e8 = d?.erc8004;
  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "ui-sans-serif,system-ui,Inter,sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ textDecoration: "none", fontSize: 22, fontWeight: 800, letterSpacing: ".04em", background: "linear-gradient(90deg,#cfe2ff,#4aa3ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>NEXUS</a>
          <span style={{ color: C.faint, fontSize: 12, fontFamily: "monospace" }}>public agent card</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {d && <span style={{ color: C.faint, fontSize: 12, fontFamily: "monospace" }}>chainId {d.chainId}</span>}
            <NetworkSwitch active={d?.network} />
          </span>
        </div>
        <h1 style={{ fontSize: 26, margin: "14px 0 4px" }}>Agent #{id}</h1>
        <p style={{ color: C.muted, margin: 0, fontSize: 14 }}>
          Own the intelligence (ERC-7857) · prove every task in hardware (0G TEE) · portable identity (ERC-8004).
        </p>

        {err && <div style={{ marginTop: 24, color: "#ff6b7a", background: "rgba(255,90,106,.08)", border: "1px solid rgba(255,90,106,.3)", borderRadius: 10, padding: 14 }}>Agent not found: {err}</div>}
        {!d && !err && <div style={{ marginTop: 24, color: C.faint }}>Reading chain…</div>}

        {d && n && (
          <>
            {/* trust summary + QR */}
            <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 340px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: n.taskCount > 0 ? C.good : C.warn }}>{n.tier}</span>
                  <span style={{ color: C.muted, fontFamily: "monospace", fontSize: 13 }}>score {n.score} · {n.taskCount} proven task{n.taskCount === 1 ? "" : "s"}</span>
                </div>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "110px 1fr", rowGap: 6, fontSize: 13, fontFamily: "monospace" }}>
                  <span style={{ color: C.faint }}>owner</span><span style={{ color: C.muted }}>{short(n.owner)}</span>
                  <span style={{ color: C.faint }}>creator</span><span style={{ color: C.muted }}>{short(n.creator)}</span>
                  <span style={{ color: C.faint }}>policy hash</span><span style={{ color: C.muted }}>{short(n.policyHash, 12, 8)}</span>
                  <span style={{ color: C.faint }}>persona CID</span><span style={{ color: C.muted }}>{short(n.personaRootHash, 12, 8)}</span>
                  <span style={{ color: C.faint }}>clones</span><span style={{ color: C.muted }}>{n.cloneCount}{n.parentOf !== "0" ? ` · cloned from #${n.parentOf}` : ""}</span>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a href={d.agentUrl} target="_blank" style={{ color: C.accent, fontSize: 12, fontFamily: "monospace" }}>NexusAgent on chainscan ↗</a>
                  <a href="/leaderboard" style={{ color: C.accent, fontSize: 12, fontFamily: "monospace" }}>leaderboard ↗</a>
                </div>
              </div>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, textAlign: "center" }}>
                <img src={`/api/qr?path=/agent/${id}`} width={140} height={140} alt={`QR to agent #${id}`} style={{ borderRadius: 8 }} />
                <div style={{ color: C.faint, fontSize: 11, marginTop: 6, fontFamily: "monospace" }}>scan → this card</div>
              </div>
            </div>

            {/* ERC-8004 portable identity */}
            <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>ERC-8004 portable identity</span>
                {e8
                  ? <span style={{ color: C.good, fontFamily: "monospace", fontSize: 12, border: `1px solid ${C.good}`, borderRadius: 20, padding: "2px 10px" }}>REGISTERED · #{e8.erc8004AgentId}</span>
                  : <span style={{ color: C.faint, fontFamily: "monospace", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 20, padding: "2px 10px" }}>not registered</span>}
              </div>
              {e8 ? (
                <>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "130px 1fr", rowGap: 6, fontSize: 13, fontFamily: "monospace" }}>
                    <span style={{ color: C.faint }}>registry</span>
                    <a href={e8.identityRegistryUrl} target="_blank" style={{ color: C.accent }}>{short(e8.identityRegistry)} ↗ (canonical)</a>
                    <span style={{ color: C.faint }}>agent card</span>
                    <a href={e8.agentURI} target="_blank" style={{ color: C.accent }}>0G Storage ↗</a>
                    <span style={{ color: C.faint }}>card integrity</span>
                    <span style={{ color: e8.cardCheck?.hashMatches ? C.good : C.warn }}>
                      {e8.cardCheck ? (e8.cardCheck.hashMatches ? "keccak matches on-chain hash ✓" : "HASH MISMATCH ✗") : "not re-checkable right now (stated, not hidden)"}
                    </span>
                  </div>
                  <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                    <div style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>TEE validations (NEXUS validator)</div>
                    {e8.validations.length === 0 && <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>none yet</div>}
                    {e8.validations.map((v) => (
                      <div key={v.requestHash} style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, fontFamily: "monospace", alignItems: "center" }}>
                        <span style={{ color: v.hasResponse ? (v.response === 100 ? C.good : C.warn) : C.faint, fontWeight: 700 }}>
                          {v.hasResponse ? `${v.response}/100` : "pending"}
                        </span>
                        <span style={{ color: C.muted }}>{short(v.requestHash, 12, 8)}</span>
                        {v.lastUpdate > 0 && <span style={{ color: C.faint }}>{new Date(v.lastUpdate * 1000).toISOString().slice(0, 16)}Z</span>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: C.faint, fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                  Register with <code style={{ color: C.muted }}>pnpm demo:erc8004-register {id}</code> — the agent becomes discoverable by any ERC-8004 platform, card hosted on 0G Storage, content-hashed on-chain.
                </p>
              )}
            </div>

            {/* lineage */}
            {d.lineage.length > 1 && (
              <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Lineage <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}>(recomputed from clone events — unfakeable)</span></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontFamily: "monospace", fontSize: 13 }}>
                  {d.lineage.map((a, i) => (
                    <span key={a.agentId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {i > 0 && <span style={{ color: C.faint }}>⑂</span>}
                      <a href={`/agent/${a.agentId}`} style={{ color: a.agentId === id ? C.text : C.accent, textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px" }}>
                        #{a.agentId} · {a.tier}
                      </a>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* embed */}
            <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <img src={`/api/badge/agent/${id}`} alt={`NEXUS agent #${id} badge`} height={24} />
                <button onClick={copyBadge} style={{ background: "transparent", color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 12 }}>
                  {copied ? "copied ✓" : "copy embed snippet"}
                </button>
                <span style={{ color: C.faint, fontSize: 12 }}>the badge re-derives from chain on every render — embed it anywhere</span>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
