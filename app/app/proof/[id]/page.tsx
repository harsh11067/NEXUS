"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Proof = {
  receiptId: string;
  receiptHash: string;
  timestamp: number;
  agent: { id: string; owner: string; creator: string; personaRootHash: string; url: string; personaUrl: string };
  session: { id: string; traceCIDHash: string; url: string };
  tee: { provider: string; chatID?: string; model: string; verified: boolean | null; outputHash: string };
  payment: { id: string; hasPayment: boolean; settled: boolean; url: string };
  reputation: { score: number; tier: string; taskCount: number; url: string };
  error?: string;
};

type ProofCheck = { claim: string; status: boolean | null; detail: string; link?: string };
type ReplayResult = {
  replayable: boolean;
  reason?: string;
  match?: boolean;
  modelHashMatches?: boolean;
  original?: { output: string; teeReVerified: boolean | null; model: string };
  replay?: { output: string; teeVerified: boolean | null };
  error?: string;
  runYourself?: string;
};
type LiveVerdict = {
  valid: boolean;
  network: string;
  chainId: number;
  checks: ProofCheck[];
  tee: { provider: string; chatID: string; model: string; anchoredVerified: boolean | null; reVerified: boolean | null };
  error?: string;
};

const C = {
  bg: "#04060e", panel: "#0b1020", border: "#1b2540", text: "#dce6ff",
  muted: "#8092b8", faint: "#56648a", accent: "#4aa3ff", good: "#3ad07a", warn: "#ffc23a",
};

function short(s: string, h = 10, t = 8) {
  return s && s.length > h + t + 2 ? `${s.slice(0, h)}…${s.slice(-t)}` : s;
}

export default function ProofPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Proof | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState<LiveVerdict | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/receipts/${id}`).then((r) => r.json()).then((d) => {
      if (d.error) setErr(d.error); else setP(d);
    }).catch((e) => setErr(String(e)));
  }, [id]);

  async function reVerify() {
    setVerifying(true);
    setLive(null);
    try {
      const d = await fetch(`/api/verify/${id}`).then((r) => r.json());
      setLive(d.error ? { valid: false, network: "", chainId: 0, checks: [], tee: { provider: "", chatID: "", model: "", anchoredVerified: null, reVerified: null }, error: d.error } : d);
    } catch (e) {
      setLive({ valid: false, network: "", chainId: 0, checks: [], tee: { provider: "", chatID: "", model: "", anchoredVerified: null, reVerified: null }, error: String(e) });
    } finally {
      setVerifying(false);
    }
  }

  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replaying, setReplaying] = useState(false);

  async function reRun() {
    setReplaying(true);
    setReplay(null);
    try {
      const r = await fetch(`/api/replay/${id}`, { method: "POST" });
      setReplay(await r.json());
    } catch (e) {
      setReplay({ replayable: false, error: String(e) });
    } finally {
      setReplaying(false);
    }
  }

  function copyBadge() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(
      `<a href="${origin}/proof/${id}"><img src="${origin}/api/badge/${id}" alt="NEXUS-verified receipt #${id}" /></a>`,
    ).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "ui-sans-serif,system-ui,Inter,sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".04em", background: "linear-gradient(90deg,#cfe2ff,#4aa3ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>NEXUS</div>
          <span style={{ color: C.faint, fontSize: 12, fontFamily: "monospace" }}>verify-in-30s proof</span>
        </div>
        <h1 style={{ fontSize: 26, margin: "14px 0 4px" }}>Composite Receipt #{id}</h1>
        <p style={{ color: C.muted, margin: 0, fontSize: 14 }}>
          Five independently-verifiable facts. Click any link — you confirm the claim on-chain yourself, without trusting us.
        </p>

        {err && <div style={{ marginTop: 24, color: "#ff6b7a", background: "rgba(255,90,106,.08)", border: "1px solid rgba(255,90,106,.3)", borderRadius: 10, padding: 14 }}>Receipt not found: {err}</div>}
        {!p && !err && <div style={{ marginTop: 24, color: C.faint }}>Loading proof…</div>}

        {p && (
          <>
            <div style={{ marginTop: 16, fontFamily: "monospace", fontSize: 12, color: C.faint }}>
              receiptHash <span style={{ color: C.accent }}>{short(p.receiptHash, 14, 12)}</span>
              {p.timestamp ? <> · {new Date(p.timestamp * 1000).toUTCString()}</> : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
              <Row n={1} title="Identity is real" claim="An ERC-7857 agent with a real owner & encrypted persona reference."
                rows={[["agent", `#${p.agent.id}`], ["owner", short(p.agent.owner)], ["creator", short(p.agent.creator)], ["persona CID", short(p.agent.personaRootHash)]]}
                links={[["ownerOf / creator on chainscan ↗", p.agent.url], ["encrypted persona on 0G Storage ↗", p.agent.personaUrl]]} />

              <Row n={2} title="Rules were locked" claim="A session was opened that locked the policy hash and anchored the trace bundle."
                rows={[["sessionId", short(p.session.id)], ["traceCID hash", short(p.session.traceCIDHash)]]}
                links={[["ProofMesh session on chainscan ↗", p.session.url]]} />

              <Row n={3} title="The right model ran (TEE)" claim="0G Sealed Inference signed the output inside a TEE; verified against the enclave key."
                rows={[["model", p.tee.model || "—"], ["provider", short(p.tee.provider || "—")], ["output hash", short(p.tee.outputHash || "—")],
                  ["attestation", p.tee.verified === true ? "HARDWARE-VERIFIED ✓" : p.tee.verified === null ? "anchored (no TEE service)" : "FAILED"]]}
                tone={p.tee.verified === true ? C.good : C.warn} />

              <Row n={4} title={p.payment.hasPayment ? "Paid on 0G Chain" : "No payment (free task)"} claim={p.payment.hasPayment ? "Funds locked in escrow and settled to the merchant on 0G Chain." : "This task spent nothing; no escrow leg."}
                rows={p.payment.hasPayment ? [["paymentId", short(p.payment.id)], ["status", p.payment.settled ? "SETTLED ✓" : "not settled"]] : [["payment", "none"]]}
                links={p.payment.hasPayment ? [["NexusEscrow on chainscan ↗", p.payment.url]] : []}
                tone={p.payment.hasPayment && p.payment.settled ? C.good : C.faint} />

              <Row n={5} title="Reputation from proof" claim="The score moved only via this on-chain receipt — no reviews, no votes."
                rows={[["tier", p.reputation.tier], ["score", String(p.reputation.score)], ["tasks", String(p.reputation.taskCount)], ["traces to", short(p.receiptHash)]]}
                links={[["ReputationRegistry on chainscan ↗", p.reputation.url]]} />
            </div>

            {/* ProofPass — re-derive validity live, trusting no stored boolean */}
            <div style={{ marginTop: 20, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 15 }}>ProofPass · re-verify this receipt yourself</strong>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>
                    Re-derives every claim from chain, 0G Storage and the provider&apos;s enclave endpoint — nothing above is trusted, everything is re-checked.
                  </div>
                </div>
                <button onClick={reVerify} disabled={verifying}
                  style={{ background: verifying ? C.border : C.accent, color: "#04060e", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: verifying ? "wait" : "pointer" }}>
                  {verifying ? "re-deriving…" : "RE-VERIFY LIVE"}
                </button>
              </div>

              {live && live.error && (
                <div style={{ marginTop: 14, color: "#ff6b7a", fontSize: 13 }}>verification error: {live.error}</div>
              )}
              {live && !live.error && (
                <>
                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{
                      fontFamily: "monospace", fontWeight: 800, fontSize: 16, letterSpacing: ".06em",
                      color: live.valid ? C.good : "#ff6b7a",
                      border: `2px solid ${live.valid ? C.good : "#ff6b7a"}`, borderRadius: 8, padding: "6px 14px",
                    }}>
                      {live.valid ? "VALID ✓" : "INVALID ✗"}
                    </span>
                    <span style={{ color: C.faint, fontSize: 12, fontFamily: "monospace" }}>
                      re-derived just now on {live.network} (chainId {live.chainId})
                    </span>
                  </div>
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    {live.checks.map((c) => (
                      <div key={c.claim} style={{ display: "flex", gap: 10, fontSize: 12.5, alignItems: "baseline" }}>
                        <span style={{ fontFamily: "monospace", color: c.status === true ? C.good : c.status === false ? "#ff6b7a" : C.warn, minWidth: 18 }}>
                          {c.status === true ? "✓" : c.status === false ? "✗" : "◌"}
                        </span>
                        <span style={{ color: C.text }}>{c.claim}</span>
                        <span style={{ color: C.faint, fontFamily: "monospace", wordBreak: "break-all" }}>{c.detail}</span>
                        {c.link && <a href={c.link} target="_blank" rel="noreferrer" style={{ color: C.accent, whiteSpace: "nowrap" }}>↗</a>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/badge/${id}`} alt={`NEXUS badge for receipt #${id}`} height={24} />
                <button onClick={copyBadge}
                  style={{ background: "transparent", color: C.accent, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                  {copied ? "copied ✓" : "copy embed snippet"}
                </button>
                <span style={{ color: C.faint, fontSize: 11.5 }}>drop the badge next to this agent anywhere — it re-verifies live</span>
              </div>
            </div>

            {/* Replay + offline bundle — the receipt survives without us */}
            <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 15 }}>Re-run this proof · take it offline</strong>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>
                    Replay re-executes the sealed trace on the same attested provider (temp 0) and re-verifies in hardware.
                    The bundle is the receipt&apos;s primary evidence in one file — verifiable air-gapped, years from now.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={reRun} disabled={replaying}
                    style={{ background: replaying ? C.border : "transparent", color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: replaying ? "wait" : "pointer" }}>
                    {replaying ? "re-running sealed…" : "RE-RUN THIS PROOF"}
                  </button>
                  <a href={`/api/bundle/${id}`} download
                    style={{ display: "inline-block", color: "#04060e", background: C.accent, borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                    ⇩ offline bundle
                  </a>
                </div>
              </div>

              {replay && (replay.error || replay.runYourself) && (
                <div style={{ marginTop: 14, fontSize: 13, color: C.warn }}>
                  {replay.error}
                  {replay.runYourself && (
                    <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 12, color: C.muted }}>
                      run it yourself: <span style={{ color: C.accent }}>{replay.runYourself}</span>
                    </div>
                  )}
                </div>
              )}
              {replay && !replay.error && !replay.runYourself && !replay.replayable && (
                <div style={{ marginTop: 14, fontSize: 13, color: C.warn }}>{replay.reason}</div>
              )}
              {replay && replay.replayable && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontFamily: "monospace", color: replay.match ? C.good : "#ff6b7a" }}>{replay.match ? "✓" : "✗"}</span>
                    <span>replayed output {replay.match ? "matches the sealed original byte-for-byte" : "DIFFERS from the original"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontFamily: "monospace", color: replay.modelHashMatches ? C.good : "#ff6b7a" }}>{replay.modelHashMatches ? "✓" : "✗"}</span>
                    <span>same attested provider:model re-served the task {replay.original?.model && <em style={{ color: C.faint }}>({replay.original.model})</em>}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontFamily: "monospace", color: replay.replay?.teeVerified === true ? C.good : C.warn }}>{replay.replay?.teeVerified === true ? "✓" : "◌"}</span>
                    <span>replay run freshly enclave-verified (processResponse)</span>
                  </div>
                  <div style={{ color: C.faint, fontSize: 11.5, marginTop: 4 }}>
                    signatures differ per run (enclave nonces) — the claim is reproducible + re-verified, never identical-signature.
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12, color: C.faint, fontSize: 11.5, fontFamily: "monospace" }}>
                verify the bundle air-gapped: pnpm verify:bundle &lt;file&gt; · tamper one byte → FAIL
              </div>
            </div>

            <p style={{ marginTop: 24, color: C.faint, fontSize: 12 }}>
              Trust model: inference is hardware-proven (TEE); the tool/trace log is app-level, immutably anchored;
              re-encryption transfer uses a trusted signer (v1) → TEE/ZKP oracle (v2).
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ n, title, claim, rows, links = [], tone }: {
  n: number; title: string; claim: string; rows: [string, string][]; links?: [string, string][]; tone?: string;
}) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${tone || C.accent}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "monospace", color: C.faint, fontSize: 12 }}>{n}</span>
        <strong style={{ fontSize: 15 }}>{title}</strong>
      </div>
      <div style={{ color: C.muted, fontSize: 13, margin: "4px 0 10px 26px" }}>{claim}</div>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "3px 12px", marginLeft: 26, fontSize: 12.5, fontFamily: "monospace" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <span style={{ color: C.faint }}>{k}</span>
            <span style={{ color: tone || C.text, wordBreak: "break-all" }}>{v}</span>
          </div>
        ))}
      </div>
      {links.length > 0 && (
        <div style={{ marginLeft: 26, marginTop: 10, display: "flex", flexWrap: "wrap", gap: 14 }}>
          {links.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" style={{ color: C.accent, fontSize: 12.5, fontWeight: 600 }}>{label}</a>
          ))}
        </div>
      )}
    </div>
  );
}
