"use client";

import React from "react";
import { CheckCircle2, ShieldAlert, Workflow, DollarSign, Activity, Zap, RefreshCcw, Key } from "lucide-react";
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

        {/* ── Segment A: Transparent Risk Scoring ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <ShieldAlert size={14} /> CLEAR & TRANSPARENT SCORING
            </div>
            <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 20, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Risk scoring your team<br />can actually explain.
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 26 }}>
              Stop relying on mysterious AI formulas that leave your team guessing. Arcli tracks exact customer behaviors—like going inactive for two weeks or clicking the cancel button—so you always know precisely *why* an account is at risk.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "100% transparent and explainable rules", 
                "Custom warning alerts for inactivity or drop-offs", 
                "Simple, secure connection to your app"
              ].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={16} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, background: "#FAFAFA", padding: 24, borderRadius: 8, border: surfaceBorder, position: "relative", boxShadow: surfaceShadow }}>
            
            {/* Human-Readable Scoring UI Mockup */}
            <div style={{ background: "#fff", padding: "18px", borderRadius: 8, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow }}>
              
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Customer: Acme Corporation</h4>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: surfaceBorder, padding: "2px 8px", borderRadius: 6 }}>HIGH CHURN RISK</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#4B5563", background: "rgba(75,85,99,0.08)", border: surfaceBorder, padding: "2px 8px", borderRadius: 6 }}>ENTERPRISE PLAN</span>
                  </div>
                </div>
                <div style={{ background: "#FAFAFA", border: surfaceBorder, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  <Key size={12} /> Connected via API
                </div>
              </div>

              {/* KPI Row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <div style={{ flex: 1, border: surfaceBorder, borderRadius: 8, padding: 12, boxShadow: surfaceShadow }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>AT-RISK REVENUE</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>$499.00 / mo</div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 4 }}>Account inactive for 16 days</div>
                </div>
                <div style={{ flex: 1, border: surfaceBorder, borderRadius: 8, padding: 12, boxShadow: surfaceShadow }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>OVERALL RISK SCORE</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#EF4444" }}>85 / 100</div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 4 }}>Warning threshold reached</div>
                </div>
              </div>

              {/* Signals List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>WHY THIS CUSTOMER IS AT RISK</div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)", borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.navy }}>Clicked "Cancel Subscription" button</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#EF4444" }}>+50 Risk Points</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)", borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.navy }}>No account login in over 14 days</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#F59E0B" }}>+35 Risk Points</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.1)", borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.navy, opacity: 0.7 }}>Last active team session</div>
                  <div style={{ fontSize: 12, color: C.faint }}>16 days ago</div>
                </div>
              </div>

            </div>
            
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 12, left: 12, right: -12, bottom: -12, background: "rgba(59,154,232,0.12)", borderRadius: 8, zIndex: 1, opacity: 1, border: surfaceBorder }} />
          </div>
        </div>

        {/* ── Segment B: Automated Recovery & Tracking ── */}
        <div className="grid-2" ref={ref2 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <Workflow size={14} /> AUTOMATED RECOVERY
            </div>
            <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 20, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Don't just watch them leave.<br />Automatically bring them back.
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 26 }}>
              Spotting at-risk customers is only half the battle. Arcli automatically sends targeted check-ins at just the right moment, prevents email spam with built-in safety pauses, and confirms the exact moment a customer logs back in.
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
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  letterSpacing: "0.02em"
                }}
              >
                View Automated Campaigns
              </a>
            </div>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 8, padding: 24, position: "relative", zIndex: 2, color: "#FFFFFF", boxShadow: surfaceShadow, border: "1px solid rgba(255,255,255,0.12)" }}>
              
              {/* Report Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(59,154,232,0.18)", border: "1px solid rgba(96,165,250,0.28)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blueLight }}>
                      <Activity size={14} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.blueLight, letterSpacing: "0.05em" }}>RECOVERY TRACKER</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>14-Day Inactivity Campaign</h3>
                </div>
                <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", padding: "6px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", boxShadow: surfaceShadow }}>
                  <RefreshCcw size={14} color="#10B981" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#10B981" }}>Running Live</span>
                </div>
              </div>

              {/* Attribution Body */}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 16, marginBottom: 14 }}>
                
                {/* Micro Stat */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#34D399" }}>
                    <Activity size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0" }}>Accounts Saved (Last 30 Days)</div>
                    <div style={{ fontSize: 18, color: "#34D399", fontWeight: 700 }}>28 Customers Successfully Restored</div>
                  </div>
                </div>

                {/* Plain English Activity Feed */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ color: C.faint, marginTop: 2 }}><Zap size={14} /></div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 2 }}>Customer inactive for 14 days</div>
                      <div style={{ fontSize: 12, color: C.faint }}>Enrolled in automated re-engagement campaign</div>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ color: C.blueLight, marginTop: 2 }}><Workflow size={14} /></div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 2 }}>Sent personalized check-in email</div>
                      <div style={{ fontSize: 12, color: C.faint }}>Delivered safely (Spam protection filters passed)</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ color: "#34D399", marginTop: 2 }}><CheckCircle2 size={14} /></div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#34D399", marginBottom: 2 }}>Customer logged back into their account</div>
                      <div style={{ fontSize: 12, color: C.faint }}>Activity confirmed. <span style={{ color: "#E2E8F0", fontWeight: 600 }}>Account marked as saved.</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Plain English Safety Footer */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0B1120", border: "1px solid rgba(255,255,255,0.14)", boxShadow: surfaceShadow, padding: "8px 12px", borderRadius: 8, fontSize: 11, color: "#64748B", fontWeight: 600 }}>
                SPAM PROTECTION: <span style={{ color: "#F59E0B", fontWeight: 600 }}>ACTIVE</span>
                <span style={{ margin: "0 6px", color: "rgba(255,255,255,0.2)" }}>|</span>
                NEXT EMAIL PAUSED FOR: <span style={{ color: C.faint }}>14 DAYS</span>
              </div>

            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: -12, left: -12, right: 12, bottom: 12, background: "rgba(59,154,232,0.16)", borderRadius: 8, zIndex: 1, opacity: 1, border: surfaceBorder }} />
          </div>
        </div>

      </div>
    </section>
  );
}