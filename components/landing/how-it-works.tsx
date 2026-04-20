"use client";

import React from "react";
import { CheckCircle2, Database, ArrowRight, Sparkles, Bell } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function HowItWorks() {
  const [ref0, vis0] = useVisible(0.1);
  const [ref1, vis1] = useVisible(0.1);
  const [ref2, vis2] = useVisible(0.1);
  const [ref3, vis3] = useVisible(0.1);
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section id="pipeline" style={{ padding: "140px 24px", background: "#FFFFFF", borderTop: surfaceBorder, fontFamily: sans }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* ── Section Header ── */}
        <div 
          className={`fu ${vis0 ? "vis" : ""}`} 
          ref={ref0 as React.RefObject<HTMLDivElement>}
          style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 120px" }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 600, fontSize: 12, letterSpacing: "0.06em", marginBottom: 14 }}>
            <Database size={14} /> THE PIPELINE
          </div>
          <h2 style={{ fontSize: 40, color: C.navy, marginBottom: 20, lineHeight: 1.12, letterSpacing: "-0.02em", fontWeight: 700 }}>
            How DataOmen thinks.
          </h2>
          <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.55 }}>
            A seamless transition from raw, disjointed data to proactive business intelligence. Built for velocity, engineered for absolute precision.
          </p>
        </div>

        {/* ── Step 1: Connect & Harmonize ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.navy, fontWeight: 600, fontSize: 12, marginBottom: 14, letterSpacing: "0.05em" }}>
              STEP 01
            </div>
            <h2 style={{ fontSize: 36, color: C.navy, marginBottom: 20, lineHeight: 1.12, letterSpacing: "-0.02em", fontWeight: 700 }}>
              Connect & Harmonize
            </h2>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.55, marginBottom: 28 }}>
              Plug in your tools in seconds. DataOmen’s semantic engine automatically maps chaotic, disjointed API fields into a unified, strictly-typed business layer. Zero rigid ETL pipelines required.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {["1-Click OAuth integrations", "Automatic schema resolution", "Real-time data syncing"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={16} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            <div style={{ background: "#FFFFFF", padding: 28, borderRadius: 8, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, borderBottom: surfaceBorder, paddingBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.faint, letterSpacing: "0.05em" }}>SEMANTIC ROUTER</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#047857", background: "rgba(16,185,129,0.08)", padding: "4px 10px", borderRadius: 8, border: surfaceBorder }}>
                  <CheckCircle2 size={14} /> ACTIVE
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAFA", padding: "14px 16px", borderRadius: 8, border: surfaceBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#635BFF", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>St</div>
                    <div>
                      <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>Stripe MRR</div>
                      <div style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>api.amount</div>
                    </div>
                  </div>
                  <ArrowRight size={16} color={C.faint} />
                  <div style={{ background: "#fff", border: surfaceBorder, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.navy, boxShadow: surfaceShadow }}>
                    Global Revenue
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAFA", padding: "14px 16px", borderRadius: 8, border: surfaceBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#96BF48", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>Sh</div>
                    <div>
                      <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>Shopify Sales</div>
                      <div style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>api.total_price</div>
                    </div>
                  </div>
                  <ArrowRight size={16} color={C.faint} />
                  <div style={{ background: "#fff", border: surfaceBorder, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.navy, boxShadow: surfaceShadow }}>
                    Global Revenue
                  </div>
                </div>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 16, left: 16, right: -12, bottom: -12, background: "#F3F4F6", borderRadius: 8, zIndex: 1, opacity: 0.9, border: surfaceBorder }} />
          </div>
        </div>

        {/* ── Step 2: Explore & Ask (AI Analyst) ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref2 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 600, fontSize: 12, marginBottom: 14, letterSpacing: "0.05em" }}>
              STEP 02
            </div>
            <h2 style={{ fontSize: 36, color: C.navy, marginBottom: 20, lineHeight: 1.12, letterSpacing: "-0.02em", fontWeight: 700 }}>
              Bypass the SQL editor.
            </h2>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.55, marginBottom: 28 }}>
              DataOmen's AI understands your unique schema. Simply type your question in plain English, and it instantly translates it into perfectly optimized SQL, generating presentation-ready charts on the fly.
            </p>
            <a
              href="/register"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: surfaceBorder,
                boxShadow: surfaceShadow,
                background: C.blue,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none"
              }}
            >
              Try the AI Analyst
            </a>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, background: "#FAFAFA", padding: 28, borderRadius: 8, border: surfaceBorder, position: "relative", boxShadow: surfaceShadow }}>
            {/* NL Input Bubble */}
            <div style={{ background: "#fff", border: surfaceBorder, borderRadius: 8, padding: "12px 14px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", boxShadow: surfaceShadow, position: "relative", zIndex: 3 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(59,154,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0 }}>
                <Sparkles size={14} />
              </div>
              <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>
                "Show me total revenue by month for captured transactions."
              </div>
            </div>

            {/* SQL Output */}
            <div style={{ background: "#111827", color: "#D1D5DB", padding: "16px 14px", borderRadius: 8, fontSize: 12, position: "relative", zIndex: 2, boxShadow: surfaceShadow, lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase", fontWeight: 600 }}>Generated Query</div>
              <span style={{ color: "#569CD6" }}>SELECT</span> date_trunc(<span style={{ color: "#CE9178" }}>'month'</span>, created_at),<br />
              <span style={{ color: "#569CD6" }}>SUM</span>(amount) <span style={{ color: "#569CD6" }}>AS</span> total_revenue<br />
              <span style={{ color: "#569CD6" }}>FROM</span> core_transactions<br />
              <span style={{ color: "#569CD6" }}>WHERE</span> status = <span style={{ color: "#CE9178" }}>'captured'</span><br />
              <span style={{ color: "#569CD6" }}>GROUP BY</span> 1 <span style={{ color: "#569CD6" }}>ORDER BY</span> 1 <span style={{ color: "#569CD6" }}>DESC</span>;
            </div>
          </div>
        </div>

        {/* ── Step 3: Automate & Guard (Watchdogs) ── */}
        <div className="grid-2" ref={ref3 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis3 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.red, fontWeight: 600, fontSize: 12, marginBottom: 14, letterSpacing: "0.05em" }}>
              STEP 03
            </div>
            <h2 style={{ fontSize: 36, color: C.navy, marginBottom: 20, lineHeight: 1.12, letterSpacing: "-0.02em", fontWeight: 700 }}>
              Automate & Guard
            </h2>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.55, marginBottom: 28 }}>
              Don't just stare at dashboards waiting for lines to drop. DataOmen continuously monitors your metrics 24/7. If conversion rates dip or API errors spike, you get an immediate alert with the root cause already diagnosed.
            </p>
            <a
              href="#agents"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: surfaceBorder,
                boxShadow: surfaceShadow,
                background: "#FFFFFF",
                color: C.navy,
                fontSize: 14,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none"
              }}
            >
              Explore AI Watchdogs
            </a>
          </div>

          <div className={`fu ${vis3 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 8, padding: 28, position: "relative", zIndex: 2, color: "#fff", boxShadow: surfaceShadow, border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div className="pulse-indicator pulse-red" />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.05em" }}>LIVE SYSTEM LOG</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.redPale }}>
                      <Bell size={14} color={C.red} />
                      <span style={{ fontWeight: 600 }}>Anomaly Detected</span>
                    </div>
                    <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>Just now</span>
                  </div>
                  <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Checkout Conversion Drop</h5>
                  <p style={{ fontSize: 13, color: C.faint, lineHeight: 1.5 }}>
                    EMEA region conversion fell by 4.2% in the last hour. AI diagnosis correlates this with a spike in Stripe Gateway latency.
                  </p>
                </div>

                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 14, opacity: 0.7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.greenPale, marginBottom: 8 }}>
                    <CheckCircle2 size={14} color={C.green} />
                    <span style={{ fontWeight: 600 }}>System Nominal</span>
                  </div>
                  <h5 style={{ fontSize: 14, fontWeight: 600 }}>All other metrics stable</h5>
                </div>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: -12, left: 12, right: -12, bottom: 12, background: "#F3F4F6", borderRadius: 8, zIndex: 1, opacity: 0.95, border: surfaceBorder }} />
          </div>
        </div>

      </div>
    </section>
  );
}