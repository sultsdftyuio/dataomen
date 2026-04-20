"use client";

import React from "react";
import { CheckCircle2, LayoutDashboard, Presentation, Share2, Sparkles, LineChart } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function DeepDiveFeatures() {
  const [ref1, vis1] = useVisible(0.1);
  const [ref2, vis2] = useVisible(0.1);
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section id="dashboards" style={{ padding: "140px 24px", background: "#FAFAFA", borderTop: surfaceBorder, fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* ── Segment A: The Smart Grid (Dashboards) ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 600, fontSize: 12, marginBottom: 14, letterSpacing: "0.05em" }}>
              <LayoutDashboard size={14} /> THE SMART GRID
            </div>
            <h2 style={{ fontSize: 40, color: C.navy, marginBottom: 20, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 700 }}>
              Dashboards that actually<br />answer the next question.
            </h2>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.55, marginBottom: 26 }}>
              Stop building brittle dashboards that break when you filter them. The Smart Grid dynamically joins data across your platforms (Stripe + Shopify + Zendesk) into fluid, interactive canvases. 
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Zero-ETL cross-platform joins", 
                "Progressive widget hydration", 
                "1-Click metric lineage & provenance"
              ].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={16} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, background: "#FAFAFA", padding: 24, borderRadius: 8, border: surfaceBorder, position: "relative", boxShadow: surfaceShadow }}>
            
            {/* Dashboard UI Mockup */}
            <div style={{ background: "#fff", padding: "18px", borderRadius: 8, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow }}>
              
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Omni-Graph Overview</h4>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#635BFF", background: "rgba(99,91,255,0.08)", border: surfaceBorder, padding: "2px 8px", borderRadius: 6 }}>STRIPE</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#4B5563", background: "rgba(75,85,99,0.08)", border: surfaceBorder, padding: "2px 8px", borderRadius: 6 }}>SHOPIFY</span>
                  </div>
                </div>
                <div style={{ background: "#FAFAFA", border: surfaceBorder, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.muted }}>
                  Last 30 Days
                </div>
              </div>

              {/* KPI Row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <div style={{ flex: 1, border: surfaceBorder, borderRadius: 8, padding: 12, boxShadow: surfaceShadow }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>REVENUE</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>$124.5k</div>
                  <div style={{ fontSize: 12, color: "#10B981", fontWeight: 600, marginTop: 4 }}>+14.2%</div>
                </div>
                <div style={{ flex: 1, border: surfaceBorder, borderRadius: 8, padding: 12, boxShadow: surfaceShadow }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>AVG ORDER</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>$84.20</div>
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
                    <div style={{ width: "100%", background: "rgba(59,154,232,0.25)", height: `${h * 0.4}%`, borderRadius: "2px" }} />
                    {/* Primary Metric Bar (Darker) */}
                    <div style={{ width: "100%", background: C.blue, height: `${h * 0.6}%`, borderRadius: "2px" }} />
                    
                    {/* Simulated Hover Tooltip on 8th item */}
                    {i === 7 && (
                      <div style={{ position: "absolute", top: -36, left: "50%", transform: "translateX(-50%)", background: C.navy, color: "#fff", padding: "6px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", boxShadow: surfaceShadow }}>
                        $14,200
                        <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 8, height: 8, background: C.navy }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
            
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 12, left: 12, right: -12, bottom: -12, background: "#F3F4F6", borderRadius: 8, zIndex: 1, opacity: 1, border: surfaceBorder }} />
          </div>
        </div>

        {/* ── Segment B: Narrative Synthesis (Charts & Reporting) ── */}
        <div className="grid-2" ref={ref2 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 600, fontSize: 12, marginBottom: 14, letterSpacing: "0.05em" }}>
              <Presentation size={14} /> NARRATIVE SYNTHESIS
            </div>
            <h2 style={{ fontSize: 40, color: C.navy, marginBottom: 20, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 700 }}>
              Charts are nice.<br />Answers are better.
            </h2>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.55, marginBottom: 26 }}>
              Stop pasting screenshots into Slack. With one click, generate a presentation-ready executive summary of your board. We freeze the data state, giving you a "Time-Travel" hash so your team sees exactly what you saw.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <a
                href="#demo"
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
                Generate Brief
              </a>
            </div>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, position: "relative" }}>
            <div style={{ background: "#FFFFFF", borderRadius: 8, padding: 24, position: "relative", zIndex: 2, color: C.navy, boxShadow: surfaceShadow, border: surfaceBorder }}>
              
              {/* Report Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(59,154,232,0.12)", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", color: C.blue }}>
                      <Sparkles size={14} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.blue, letterSpacing: "0.05em" }}>EXECUTIVE BRIEF</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>Q3 Pipeline Synthesis</h3>
                </div>
                <div style={{ background: "#FAFAFA", border: surfaceBorder, padding: "6px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", boxShadow: surfaceShadow }}>
                  <Share2 size={14} color={C.muted} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Share</span>
                </div>
              </div>

              {/* Report Body */}
              <div style={{ background: "#FAFAFA", border: surfaceBorder, borderRadius: 8, padding: 16, marginBottom: 14 }}>
                
                {/* Micro Chart inside Report */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: surfaceBorder }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(16,185,129,0.12)", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981" }}>
                    <LineChart size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Enterprise LTV Growth</div>
                    <div style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>+24% vs Prev Quarter</div>
                  </div>
                </div>

                {/* AI Text Block */}
                <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
                  <p style={{ marginBottom: 12 }}>
                    Based on the current Omni-Graph state, Enterprise LTV has driven the majority of Q3 growth, directly correlated with the introduction of the new Zendesk integration.
                  </p>
                  <p>
                    <span style={{ color: C.navy, fontWeight: 600 }}>Recommendation:</span> Increase allocation to the Enterprise outbound campaign, as CAC payback period has shortened to 4.2 months.
                  </p>
                </div>
              </div>

              {/* Time Travel Hash Footer */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#FFFFFF", border: surfaceBorder, boxShadow: surfaceShadow, padding: "8px 12px", borderRadius: 8, fontSize: 11, color: C.faint, fontWeight: 600 }}>
                STATE HASH: <span style={{ color: C.blue, fontWeight: 600 }}>#A7F92B</span>
                <span style={{ margin: "0 6px", color: "rgba(0,0,0,0.2)" }}>|</span>
                FROZEN: <span style={{ color: C.muted }}>OCT 24, 14:00 UTC</span>
              </div>

            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: -12, left: -12, right: 12, bottom: 12, background: "#F3F4F6", borderRadius: 8, zIndex: 1, opacity: 1, border: surfaceBorder }} />
          </div>
        </div>

      </div>
    </section>
  );
}