"use client";

import React from "react";
import { CheckCircle2, ShieldAlert, Workflow, DollarSign, Activity, Zap, RefreshCcw } from "lucide-react";
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

        {/* ── Segment A: Deterministic Churn Scoring ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <ShieldAlert size={14} /> DETERMINISTIC SCORING
            </div>
            <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 20, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Risk scoring you can<br />actually explain.
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 26 }}>
              Stop relying on black-box AI models that can't be debugged. Arcli uses transparent, deterministic rules—merging Stripe billing lifecycle events with your app's raw activity to score churn risk exactly as it happens.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Zero black-box AI magic", 
                "Explainable inactivity & payment thresholds", 
                "Multi-tenant isolated data processing"
              ].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={16} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, background: "#FAFAFA", padding: 24, borderRadius: 8, border: surfaceBorder, position: "relative", boxShadow: surfaceShadow }}>
            
            {/* Deterministic Scoring UI Mockup */}
            <div style={{ background: "#fff", padding: "18px", borderRadius: 8, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow }}>
              
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Risk Profile: acme_corp</h4>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: surfaceBorder, padding: "2px 8px", borderRadius: 6 }}>HIGH RISK</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#4B5563", background: "rgba(75,85,99,0.08)", border: surfaceBorder, padding: "2px 8px", borderRadius: 6 }}>PRO TIER</span>
                  </div>
                </div>
                <div style={{ background: "#FAFAFA", border: surfaceBorder, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.muted }}>
                  Tenant: tr_8f92a
                </div>
              </div>

              {/* KPI Row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <div style={{ flex: 1, border: surfaceBorder, borderRadius: 8, padding: 12, boxShadow: surfaceShadow }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>AT-RISK MRR</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>$499.00</div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 4 }}>Renews in 4 days</div>
                </div>
                <div style={{ flex: 1, border: surfaceBorder, borderRadius: 8, padding: 12, boxShadow: surfaceShadow }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>RISK SCORE</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#EF4444" }}>85 / 100</div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 4 }}>Threshold breached</div>
                </div>
              </div>

              {/* Signals List (Replacing Generic Chart) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>DETERMINISTIC SIGNALS</div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)", borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.navy, fontFamily: "monospace" }}>stripe.invoice_payment_failed</div>
                  <div style={{ fontSize: 12, color: C.faint }}>2h ago</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)", borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.navy, fontFamily: "monospace" }}>app.inactivity_detected &gt; 14d</div>
                  <div style={{ fontSize: 12, color: C.faint }}>+45 pts</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.1)", borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.navy, fontFamily: "monospace", opacity: 0.6 }}>app.login_event</div>
                  <div style={{ fontSize: 12, color: C.faint }}>21d ago</div>
                </div>
              </div>

            </div>
            
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 12, left: 12, right: -12, bottom: -12, background: "rgba(59,154,232,0.12)", borderRadius: 8, zIndex: 1, opacity: 1, border: surfaceBorder }} />
          </div>
        </div>

        {/* ── Segment B: Recovery Pipeline & Attribution ── */}
        <div className="grid-2" ref={ref2 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <Workflow size={14} /> RECOVERY PIPELINE
            </div>
            <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 20, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Don't just measure churn.<br />Automate its recovery.
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 26 }}>
              Knowing a user might churn is only half the battle. Arcli automatically routes at-risk accounts into idempotent recovery flows, respects strict cooldown windows to avoid spam, and attributes every dollar of MRR won back.
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
                View Recovery Workflows
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
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.blueLight, letterSpacing: "0.05em" }}>ATTRIBUTION ENGINE</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>Failed Payment Campaign</h3>
                </div>
                <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", padding: "6px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", boxShadow: surfaceShadow }}>
                  <RefreshCcw size={14} color="#10B981" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#10B981" }}>Active</span>
                </div>
              </div>

              {/* Attribution Body */}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 16, marginBottom: 14 }}>
                
                {/* Micro Stat */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#34D399" }}>
                    <DollarSign size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0" }}>Recovered MRR (30d)</div>
                    <div style={{ fontSize: 18, color: "#34D399", fontWeight: 700 }}>$14,250.00</div>
                  </div>
                </div>

                {/* Event Log */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ color: C.faint, marginTop: 2 }}><Zap size={14} /></div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 2 }}>User routed to recovery flow</div>
                      <div style={{ fontSize: 12, color: C.faint }}>Target: user_491az · Deduplication passed</div>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ color: C.blueLight, marginTop: 2 }}><Workflow size={14} /></div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 2 }}>Sent template: "Payment Issue"</div>
                      <div style={{ fontSize: 12, color: C.faint }}>Idempotency key validated. Email delivered.</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ color: "#34D399", marginTop: 2 }}><CheckCircle2 size={14} /></div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#34D399", marginBottom: 2 }}>stripe.invoice_paid received</div>
                      <div style={{ fontSize: 12, color: C.faint }}>Subscription restored. <span style={{ color: "#E2E8F0", fontWeight: 600 }}>+$49 MRR attributed.</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Safety Footer */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0B1120", border: "1px solid rgba(255,255,255,0.14)", boxShadow: surfaceShadow, padding: "8px 12px", borderRadius: 8, fontSize: 11, color: "#64748B", fontWeight: 600 }}>
                SYSTEM SAFETY: <span style={{ color: "#F59E0B", fontWeight: 600 }}>COOLDOWN ACTIVE</span>
                <span style={{ margin: "0 6px", color: "rgba(255,255,255,0.2)" }}>|</span>
                USER LOCKED: <span style={{ color: C.faint }}>14 DAYS</span>
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