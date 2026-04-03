"use client";

import React from "react";
import { CheckCircle2, LayoutDashboard, Presentation, Share2, Sparkles, BarChart3, LineChart } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function DeepDiveFeatures() {
  const [ref1, vis1] = useVisible(0.1);
  const [ref2, vis2] = useVisible(0.1);

  return (
    <section id="dashboards" style={{ padding: "140px 24px", background: C.offWhite, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* ── Segment A: The Smart Grid (Dashboards) ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <LayoutDashboard size={18} /> THE SMART GRID
            </div>
            <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Dashboards that actually<br />answer the next question.
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Stop building brittle dashboards that break when you filter them. The Smart Grid dynamically joins data across your platforms (Stripe + Shopify + Zendesk) into fluid, interactive canvases. 
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                "Zero-ETL cross-platform joins", 
                "Progressive widget hydration", 
                "1-Click metric lineage & provenance"
              ].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={20} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, background: C.offWhite, padding: 40, borderRadius: 24, border: `1px solid ${C.rule}`, position: "relative" }}>
            
            {/* Dashboard UI Mockup */}
            <div style={{ background: "#fff", padding: "24px", borderRadius: 16, border: `1px solid ${C.rule}`, position: "relative", zIndex: 2, boxShadow: "0 20px 40px rgba(0,0,0,0.05)" }}>
              
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 4 }}>Omni-Graph Overview</h4>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#635BFF", background: "rgba(99,91,255,0.1)", padding: "2px 8px", borderRadius: 12 }}>STRIPE</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#96BF48", background: "rgba(150,191,72,0.1)", padding: "2px 8px", borderRadius: 12 }}>SHOPIFY</span>
                  </div>
                </div>
                <div style={{ background: C.offWhite, border: `1px solid ${C.rule}`, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.muted }}>
                  Last 30 Days
                </div>
              </div>

              {/* KPI Row */}
              <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                <div style={{ flex: 1, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 8 }}>REVENUE</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>$124.5k</div>
                  <div style={{ fontSize: 12, color: "#10B981", fontWeight: 600, marginTop: 4 }}>+14.2%</div>
                </div>
                <div style={{ flex: 1, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 8 }}>AVG ORDER</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>$84.20</div>
                  <div style={{ fontSize: 12, color: "#10B981", fontWeight: 600, marginTop: 4 }}>+2.1%</div>
                </div>
              </div>

              {/* Chart Visualization */}
              <div style={{ height: 140, display: "flex", alignItems: "flex-end", gap: 6, position: "relative" }}>
                {/* Simulated Grid Lines */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, borderTop: `1px dashed ${C.rule}`, zIndex: 0 }} />
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: `1px dashed ${C.rule}`, zIndex: 0 }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, borderTop: `1px solid ${C.rule}`, zIndex: 0 }} />

                {/* Animated Bars */}
                {[30, 45, 25, 60, 75, 50, 85, 100, 70, 90].map((h, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4, height: "100%", zIndex: 1, position: "relative", paddingBottom: 1 }}>
                    {/* Secondary Metric Bar (Lighter) */}
                    <div style={{ width: "100%", background: "rgba(59,154,232,0.3)", height: `${h * 0.4}%`, borderRadius: "3px" }} />
                    {/* Primary Metric Bar (Darker) */}
                    <div style={{ width: "100%", background: C.blue, height: `${h * 0.6}%`, borderRadius: "3px" }} />
                    
                    {/* Simulated Hover Tooltip on 8th item */}
                    {i === 7 && (
                      <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", background: C.navy, color: "#fff", padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 10px 20px rgba(0,0,0,0.15)" }}>
                        $14,200
                        <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 8, height: 8, background: C.navy }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
            
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 20, left: 20, right: -20, bottom: -20, background: C.blue, borderRadius: 24, zIndex: 1, opacity: 0.05 }} />
          </div>
        </div>

        {/* ── Segment B: Narrative Synthesis (Charts & Reporting) ── */}
        <div className="grid-2" ref={ref2 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Presentation size={18} /> NARRATIVE SYNTHESIS
            </div>
            <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Charts are nice.<br />Answers are better.
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Stop pasting screenshots into Slack. With one click, generate a presentation-ready executive summary of your board. We freeze the data state, giving you a "Time-Travel" hash so your team sees exactly what you saw.
            </p>
            <div style={{ display: "flex", gap: 16 }}>
              <a href="#demo" className="btn-blue" style={{ padding: "14px 28px" }}>
                Generate Brief
              </a>
            </div>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 24, padding: 40, position: "relative", zIndex: 2, color: "#fff", boxShadow: "0 30px 60px rgba(10,22,40,0.2)" }}>
              
              {/* Report Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(59,154,232,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue }}>
                      <Sparkles size={14} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.blueLight, letterSpacing: "0.05em" }}>EXECUTIVE BRIEF</span>
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Q3 Pipeline Synthesis</h3>
                </div>
                <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)", padding: "6px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <Share2 size={14} color="#D4D4D4" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#D4D4D4" }}>Share</span>
                </div>
              </div>

              {/* Report Body */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
                
                {/* Micro Chart inside Report */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981" }}>
                    <LineChart size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0" }}>Enterprise LTV Growth</div>
                    <div style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>+24% vs Prev Quarter</div>
                  </div>
                </div>

                {/* AI Text Block */}
                <div style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.7 }}>
                  <p style={{ marginBottom: 12 }}>
                    Based on the current Omni-Graph state, Enterprise LTV has driven the majority of Q3 growth, directly correlated with the introduction of the new Zendesk integration.
                  </p>
                  <p>
                    <span style={{ color: "#E2E8F0", fontWeight: 600 }}>Recommendation:</span> Increase allocation to the Enterprise outbound campaign, as CAC payback period has shortened to 4.2 months.
                  </p>
                </div>
              </div>

              {/* Time Travel Hash Footer */}
              <div className="jbm" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0B1120", border: "1px solid rgba(255,255,255,0.1)", padding: "8px 12px", borderRadius: 8, fontSize: 11, color: "#64748B" }}>
                STATE HASH: <span style={{ color: C.blueLight, fontWeight: 600 }}>#A7F92B</span>
                <span style={{ margin: "0 6px", color: "rgba(255,255,255,0.2)" }}>|</span>
                FROZEN: <span style={{ color: "#94A3B8" }}>OCT 24, 14:00 UTC</span>
              </div>

            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: -20, left: -20, right: 20, bottom: 20, background: C.blue, borderRadius: 24, zIndex: 1, opacity: 0.08 }} />
          </div>
        </div>

      </div>
    </section>
  );
}