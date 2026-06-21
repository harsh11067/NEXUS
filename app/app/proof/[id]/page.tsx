"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Proof = {
  receiptId: string;
  receiptHash: string;
  timestamp: number;
  agent: { id: string; owner: string; creator: string; personaRootHash: string; url: string; personaUrl: string };
  session: { id: string; traceCIDHash: string; url: string };
  tee: { provider: string; model: string; verified: boolean | null; outputHash: string };
  payment: { id: string; hasPayment: boolean; settled: boolean; url: string };
  reputation: { score: number; tier: string; taskCount: number; url: string };
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

  useEffect(() => {
    fetch(`/api/receipts/${id}`).then((r) => r.json()).then((d) => {
      if (d.error) setErr(d.error); else setP(d);
    }).catch((e) => setErr(String(e)));
  }, [id]);

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
