"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/client-net";
import { NetworkSwitch } from "../lib/NetworkSwitch";

export default function ProofEntry() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    fetch(api("/api/receipts")).then((r) => r.json()).then((d) => setRecent(d.receipts ?? [])).catch(() => {});
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#04060e", color: "#dce6ff", fontFamily: "ui-sans-serif,system-ui,Inter,sans-serif", padding: "60px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Verify a NEXUS receipt</h1>
          <NetworkSwitch />
        </div>
        <p style={{ color: "#8092b8", fontSize: 14 }}>Enter a composite receipt id to see its five on-chain proofs.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (id.trim()) router.push(`/proof/${id.trim()}`); }} style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="receipt id, e.g. 1"
            style={{ flex: 1, background: "#060a14", border: "1px solid #26324f", color: "#dce6ff", borderRadius: 9, padding: "10px 12px", fontSize: 14 }} />
          <button style={{ background: "linear-gradient(180deg,#4aa3ff,#2f7bff)", color: "#02060f", border: "none", borderRadius: 9, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>Verify</button>
        </form>
        {recent.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ color: "#56648a", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Recent receipts</div>
            {recent.map((r) => (
              <a key={r.receiptId} href={`/proof/${r.receiptId}`} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", border: "1px solid #1b2540", borderRadius: 9, marginBottom: 8, color: "#dce6ff", textDecoration: "none", fontSize: 13 }}>
                <span>Receipt #{r.receiptId} · agent #{r.agentId}</span>
                <span style={{ color: "#4aa3ff" }}>verify ↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
