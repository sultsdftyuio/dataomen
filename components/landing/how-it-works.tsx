"use client";

import React from "react";
import { CheckCircle2, Database, Search, Bot, ArrowRight, Sparkles, Activity, Bell } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function HowItWorks() {
  const [ref0, vis0] = useVisible(0.1);
  const [ref1, vis1] = useVisible(0.1);
  const [ref2, vis2] = useVisible(0.1);
  const [ref3, vis3] = useVisible(0.1);

  return (
    <section id="pipeline" style={{ padding: "140px 24px", background: "#fff", borderTop: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* ── Section Header ── */}
        <div 
          className={`fu ${vis0 ? "vis" : ""}`} 
          ref={ref0 as React.RefObject<HTMLDivElement>}
          style={{ textAlign: "center", marginBottom: 120, maxWidth: 600, margin: "0 auto 120px" }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
            <Database size={18} /> THE PIPELINE
          </div>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
            How DataOmen thinks.
          </h2>
          <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6 }}>
            A seamless transition from raw, disjointed data to proactive business intelligence. Built for velocity, engineered for absolute precision.
          </p>
        </div>

        {/* ── Step 1: Connect & Harmonize ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.navy, fontWeight: 700, fontSize: 14, marginBottom: 16, letterSpacing: "0.05em" }}>
              STEP 01
            </div>
            <h2 className="pfd" style={{ fontSize: 40, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Connect & Harmonize
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Plug in your tools in seconds. DataOmen’s semantic engine automatically maps chaotic, disjointed API fields into a unified, strictly-typed business layer. Zero rigid ETL pipelines required.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {["1-Click OAuth integrations", "Automatic schema resolution", "Real-time data syncing"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={20} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            <div style={{ background: "#fff", padding: 40, borderRadius: 24, border: `1px solid ${C.rule}`, position: "relative", zIndex: 2, boxShadow: "0 20px 40px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, borderBottom: `1px solid ${C.rule}`, paddingBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.faint, letterSpacing: "0.05em" }}>SEMANTIC ROUTER</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", padding: "4px 10px", borderRadius: 20 }}>
                  <CheckCircle2 size={14} /> ACTIVE
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.offWhite, padding: "16px 20px", borderRadius: 12, border: `1px solid ${C.rule}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#635BFF", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>St</div>
                    <div>
                      <div style={{ fontWeight: 700, color: C.navy, fontSize: 15 }}>Stripe MRR</div>
                      <div className="jbm" style={{ fontSize: 11, color: C.faint }}>api.amount</div>
                    </div>
                  </div>
                  <ArrowRight size={20} color={C.faint} />
                  <div style={{ background: "#fff", border: `1px solid ${C.rule}`, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.navy, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
                    Global Revenue
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.offWhite, padding: "16px 20px", borderRadius: 12, border: `1px solid ${C.rule}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#96BF48", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>Sh</div>
                    <div>
                      <div style={{ fontWeight: 700, color: C.navy, fontSize: 15 }}>Shopify Sales</div>
                      <div className="jbm" style={{ fontSize: 11, color: C.faint }}>api.total_price</div>
                    </div>
                  </div>
                  <ArrowRight size={20} color={C.faint} />
                  <div style={{ background: "#fff", border: `1px solid ${C.rule}`, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.navy, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
                    Global Revenue
                  </div>
                </div>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 20, left: 20, right: -20, bottom: -20, background: C.blue, borderRadius: 24, zIndex: 1, opacity: 0.05 }} />
          </div>
        </div>

        {/* ── Step 2: Explore & Ask (AI Analyst) ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref2 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 14, marginBottom: 16, letterSpacing: "0.05em" }}>
              STEP 02
            </div>
            <h2 className="pfd" style={{ fontSize: 40, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Bypass the SQL editor.
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              DataOmen's AI understands your unique schema. Simply type your question in plain English, and it instantly translates it into perfectly optimized SQL, generating presentation-ready charts on the fly.
            </p>
            <a href="/register" className="btn-blue" style={{ padding: "14px 28px" }}>
              Try the AI Analyst
            </a>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, background: C.offWhite, padding: 40, borderRadius: 24, border: `1px solid ${C.rule}`, position: "relative" }}>
            {/* NL Input Bubble */}
            <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.05)", position: "relative", zIndex: 3 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(59,154,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0 }}>
                <Sparkles size={16} />
              </div>
              <div style={{ fontWeight: 600, color: C.navy, fontSize: 15 }}>
                "Show me total revenue by month for captured transactions."
              </div>
            </div>

            {/* JBM SQL Output */}
            <div className="jbm" style={{ background: "#1E1E1E", color: "#D4D4D4", padding: "24px 20px", borderRadius: 12, fontSize: 13, position: "relative", zIndex: 2, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", lineHeight: 1.8 }}>
              <div style={{ fontSize: 10, color: "#858585", letterSpacing: "0.1em", marginBottom: 16, textTransform: "uppercase" }}>Generated Query</div>
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
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.red, fontWeight: 700, fontSize: 14, marginBottom: 16, letterSpacing: "0.05em" }}>
              STEP 03
            </div>
            <h2 className="pfd" style={{ fontSize: 40, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Automate & Guard
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Don't just stare at dashboards waiting for lines to drop. DataOmen continuously monitors your metrics 24/7. If conversion rates dip or API errors spike, you get an immediate alert with the root cause already diagnosed.
            </p>
            <a href="#agents" className="btn-ghost" style={{ padding: "14px 28px" }}>
              Explore AI Watchdogs
            </a>
          </div>

          <div className={`fu ${vis3 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 24, padding: 40, position: "relative", zIndex: 2, color: "#fff", boxShadow: "0 30px 60px rgba(10,22,40,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
                <div className="pulse-indicator pulse-red" />
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.05em" }}>LIVE SYSTEM LOG</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.redPale }}>
                      <Bell size={16} color={C.red} />
                      <span style={{ fontWeight: 600 }}>Anomaly Detected</span>
                    </div>
                    <span style={{ fontSize: 12, color: C.faint }}>Just now</span>
                  </div>
                  <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Checkout Conversion Drop</h5>
                  <p style={{ fontSize: 14, color: C.faint, lineHeight: 1.5 }}>
                    EMEA region conversion fell by 4.2% in the last hour. AI diagnosis correlates this with a spike in Stripe Gateway latency.
                  </p>
                </div>

                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 20, opacity: 0.6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.greenPale, marginBottom: 8 }}>
                    <CheckCircle2 size={16} color={C.green} />
                    <span style={{ fontWeight: 600 }}>System Nominal</span>
                  </div>
                  <h5 style={{ fontSize: 15, fontWeight: 700 }}>All other metrics stable</h5>
                </div>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: -20, left: 20, right: -20, bottom: 20, background: C.red, borderRadius: 24, zIndex: 1, opacity: 0.05 }} />
          </div>
        </div>

      </div>
    </section>
  );
}