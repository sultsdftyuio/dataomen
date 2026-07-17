"use client";

import React from "react";
import { CheckCircle2, Database, ArrowRight, Webhook, Workflow, DollarSign, ShieldCheck, Activity, Key } from "lucide-react";
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
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", marginBottom: 14, textTransform: "uppercase" }}>
            <Database size={14} /> THE PIPELINE
          </div>
          <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 20, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
            How Arcli finds prospects for you.
          </h2>
          <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62 }}>
            Add your website. Arcli learns what you do, finds people asking for help online, checks the fit, sends the best matches, and learns from your feedback.
          </p>
        </div>

        {/* ── Step 1: Detect (Ingest & Score) ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.navy, fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              STEP 01
            </div>
            <h2 className="pfd" style={{ fontSize: 38, color: C.navy, marginBottom: 20, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Learn What You Sell
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 28 }}>
              Give Arcli your website. It reads your public pages and learns who you help, what problem you solve, and what to ignore.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {["Learns from your website", "Understands who you help", "Knows what to ignore"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={16} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            <div style={{ background: "#FFFFFF", padding: 28, borderRadius: 8, border: surfaceBorder, position: "relative", zIndex: 2, boxShadow: surfaceShadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, borderBottom: surfaceBorder, paddingBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.faint, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
                  <Key size={14} /> WEBSITE REVIEW
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#047857", background: "rgba(16,185,129,0.08)", padding: "4px 10px", borderRadius: 8, border: surfaceBorder }}>
                  <Activity size={14} /> LEARNING
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAFA", padding: "14px 16px", borderRadius: 8, border: surfaceBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Activity size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>your product is understood</div>
                      <div style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>source: your website</div>
                    </div>
                  </div>
                  <ArrowRight size={16} color={C.faint} />
                  <div style={{ background: "#fff", border: surfaceBorder, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#EF4444", boxShadow: surfaceShadow }}>
                    Best Fit: B2B SaaS
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAFA", padding: "14px 16px", borderRadius: 8, border: surfaceBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(16,185,129,0.1)", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Activity size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>someone asked for help</div>
                      <div style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>source: Reddit / HN / X</div>
                    </div>
                  </div>
                  <ArrowRight size={16} color={C.faint} />
                  <div style={{ background: "#fff", border: surfaceBorder, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#10B981", boxShadow: surfaceShadow }}>
                    Looks Relevant
                  </div>
                </div>
              </div>
            </div>
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 16, left: 16, right: -12, bottom: -12, background: "#F3F4F6", borderRadius: 8, zIndex: 1, opacity: 0.9, border: surfaceBorder }} />
          </div>
        </div>

        {/* ── Step 2: Recover (Idempotent Queues) ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref2 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              STEP 02
            </div>
            <h2 className="pfd" style={{ fontSize: 38, color: C.navy, marginBottom: 20, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Checks Each Match
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 28 }}>
              Arcli does not send every post that happens to use the right words. It reads the context, checks whether the person has a real problem, and removes bad fits before alerting you.
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
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                letterSpacing: "0.02em"
              }}
            >
              See How Matches Are Checked
            </a>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, background: "#FAFAFA", padding: 28, borderRadius: 8, border: surfaceBorder, position: "relative", boxShadow: surfaceShadow }}>
            {/* UI Mockup for Queue Safeties */}
            <div style={{ background: "#fff", border: surfaceBorder, borderRadius: 8, padding: "16px", marginBottom: 12, boxShadow: surfaceShadow, position: "relative", zIndex: 3 }}>
              
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: surfaceBorder }}>
                <Workflow size={16} color={C.blue} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Person needs cleaner billing ops</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span style={{ color: C.navySoft, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} color="#10B981" /> Problem Match</span>
                  <span style={{ fontWeight: 600, color: C.navy }}>Looks close</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span style={{ color: C.navySoft, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} color="#10B981" /> Fit Check</span>
                  <span style={{ fontWeight: 600, color: C.navy }}>Real pain found</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginTop: 4, paddingTop: 10, borderTop: "1px dashed rgba(0,0,0,0.06)" }}>
                  <span style={{ color: C.navySoft, fontWeight: 500 }}>Action</span>
                  <span style={{ fontWeight: 600, color: C.blue }}>Sending Prospect Alert</span>
                </div>
              </div>
            </div>

            {/* Simulated Async Worker Log */}
            <div style={{ background: "#111827", color: "#D1D5DB", padding: "16px 14px", borderRadius: 8, fontSize: 12, position: "relative", zIndex: 2, boxShadow: surfaceShadow, lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--font-geist-sans)" }}>QUALITY CHECK</div>
              <span style={{ color: "#10B981" }}>[OK]</span> Learned your product<br />
              <span style={{ color: "#10B981" }}>[OK]</span> Reviewed discussion<br />
              <span style={{ color: "#F59E0B" }}>[SKIP]</span> Bad fits removed<br />
              <span style={{ color: "#3B82F6" }}>[DONE]</span> Prospect alert ready.
            </div>
          </div>
        </div>

        {/* ── Step 3: Measure (Exact Attribution) ── */}
        <div className="grid-2" ref={ref3 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis3 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#10B981", fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              STEP 03
            </div>
            <h2 className="pfd" style={{ fontSize: 38, color: C.navy, marginBottom: 20, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Useful Alerts That Improve
            </h2>
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 28 }}>
              When someone looks like a fit, Arcli shows the post, the problem, and why it matters. Your thumbs-up or thumbs-down helps future alerts improve.
            </p>
            <a
              href="#demo"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: surfaceBorder,
                boxShadow: surfaceShadow,
                background: "#FFFFFF",
                color: C.navy,
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                letterSpacing: "0.02em"
              }}
            >
              See Prospect Alerts
            </a>
          </div>

          <div className={`fu ${vis3 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 8, padding: 28, position: "relative", zIndex: 2, color: "#fff", boxShadow: surfaceShadow, border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div className="pulse-indicator pulse-green" style={{ background: "#10B981", boxShadow: "0 0 8px rgba(16,185,129,0.6)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.05em" }}>PROSPECT ALERT LIVE</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#34D399" }}>
                      <Activity size={16} />
                      <span style={{ fontWeight: 600 }}>Good Prospect</span>
                    </div>
                    <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>Just now</span>
                  </div>
                  
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <h5 style={{ fontSize: 13, fontWeight: 500, color: C.faint, marginBottom: 4 }}>Source: Reddit post</h5>
                      <p style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 600 }}>
                        Pain: manual billing reconciliation
                      </p>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#34D399", background: "rgba(52,211,153,0.1)", padding: "4px 10px", borderRadius: 6 }}>
                      Worth Reviewing
                    </div>
                  </div>
                </div>

                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle2 size={14} color={C.faint} />
                  </div>
                  <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
                    Checked by Arcli.<br />Your feedback improves future matches.
                  </div>
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
