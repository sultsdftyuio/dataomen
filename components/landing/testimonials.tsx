"use client";

import React from "react";
import { MessageSquare, ShieldCheck, TrendingUp } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function Testimonials() {
  const [ref, vis] = useVisible(0.1);
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section id="testimonials" style={{ padding: "100px 24px", background: "#FAFAFA", borderTop: surfaceBorder, fontFamily: sans }}>
      <div 
        style={{ maxWidth: 1000, margin: "0 auto" }} 
        ref={ref as React.RefObject<HTMLDivElement>}
        className={`fu ${vis ? "vis" : ""}`}
      >
        {/* ── Section Header ── */}
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", marginBottom: 14, textTransform: "uppercase" }}>
            <MessageSquare size={14} /> OPERATOR VERIFIED
          </div>
          <h2 className="pfd" style={{ fontSize: 36, color: C.navy, marginBottom: 16, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
            Built for founders who care about MRR.<br />Engineered for devs who care about safety.
          </h2>
        </div>

        {/* ── Cards Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 32 }}>
          
          {/* Testimonial 1: The Founder (Focus: MRR) */}
          <div style={{ position: "relative" }}>
            <div style={{ background: "#FFFFFF", padding: 32, borderRadius: 8, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: surfaceBorder }}>
                  <TrendingUp size={16} color="#10B981" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#10B981", letterSpacing: "0.02em" }}>+$2,450 MRR RECOVERED (30D)</span>
                </div>
                <p style={{ color: C.navy, fontSize: 16, lineHeight: 1.6, fontWeight: 500, marginBottom: 24 }}>
                  "We used to export Stripe data into a spreadsheet to guess who would churn. Arcli caught 14 at-risk accounts in week one and safely recovered 9 of them automatically. The attribution is exact."
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(59,154,232,0.1)", border: "1px solid rgba(59,154,232,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.blue, fontSize: 14 }}>
                  M
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Marcus V.</div>
                  <div style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>Founder, SyncNode</div>
                </div>
              </div>
            </div>
            {/* Offset Accent */}
            <div style={{ position: "absolute", top: 12, left: 12, right: -12, bottom: -12, background: "rgba(16,185,129,0.06)", borderRadius: 8, zIndex: 1, border: surfaceBorder }} />
          </div>

          {/* Testimonial 2: The Engineer (Focus: Idempotency) */}
          <div style={{ position: "relative" }}>
            <div style={{ background: "#FFFFFF", padding: 32, borderRadius: 8, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: surfaceBorder }}>
                  <ShieldCheck size={16} color={C.blue} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.blue, letterSpacing: "0.02em" }}>ZERO DEDUPLICATION FAILURES</span>
                </div>
                <p style={{ color: C.navy, fontSize: 16, lineHeight: 1.6, fontWeight: 500, marginBottom: 24 }}>
                  "Finally, a recovery tool that actually respects idempotency. I don't have to worry about our users getting spammed because a webhook fired twice or a queue stalled. The deterministic scoring just works."
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(15,23,42,0.05)", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.navy, fontSize: 14 }}>
                  S
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Sarah L.</div>
                  <div style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>Lead Backend Engineer, Altyx</div>
                </div>
              </div>
            </div>
            {/* Offset Accent */}
            <div style={{ position: "absolute", top: 12, left: -12, right: 12, bottom: -12, background: "rgba(59,154,232,0.06)", borderRadius: 8, zIndex: 1, border: surfaceBorder }} />
          </div>

        </div>
      </div>
    </section>
  );
}