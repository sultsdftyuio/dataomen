"use client";

import React from "react";
import { 
  Megaphone, 
  ShieldCheck, 
  Mail, 
  Clock, 
  AlertCircle,
  Lock,
  LineChart,
  Workflow,
  Activity
} from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function Campaigns() {
  const [ref1, vis1] = useVisible(0.1);
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section 
      id="campaigns" 
      style={{ 
        padding: "140px 24px", 
        background: "#FFFFFF", 
        borderTop: surfaceBorder, 
        fontFamily: "var(--font-geist-sans), sans-serif",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Subtle Grid Background */}
      <div 
        style={{ 
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.03,
          backgroundImage: 'linear-gradient(#1B6EBF 1px, transparent 1px), linear-gradient(90deg, #1B6EBF 1px, transparent 1px)', 
          backgroundSize: '32px 32px' 
        }}
      />

      <div style={{ maxWidth: 1240, margin: "0 auto", position: "relative", zIndex: 10 }}>

        {/* ── Campaigns Layout Split ── */}
        <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }} ref={ref1 as React.RefObject<HTMLDivElement>}>

          {/* Left Side: Product Copy */}
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 12, marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <Megaphone size={14} /> BETTER PROSPECT ALERTS
            </div>
            
            <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 20, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
              Fewer alerts.<br />Better prospects.
            </h2>
            
            <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, marginBottom: 40 }}>
              Arcli is not a social listening tool or a DM bot. It sends a small number of people whose public posts point to the problem your SaaS solves.
            </p>

            {/* Premium Feature Stack */}
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              
              {/* Feature 1 */}
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(59,154,232,0.1)", border: "1px solid rgba(59,154,232,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0, boxShadow: surfaceShadow }}>
                  <Clock size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, color: C.navy, marginBottom: 6 }}>Quality Over Noise</h3>
                  <p style={{ fontSize: 15, color: C.navySoft, lineHeight: 1.6 }}>
                    Arcli removes word-match noise, hiring posts, random complaints, and bad matches before they reach you.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(59,154,232,0.1)", border: "1px solid rgba(59,154,232,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0, boxShadow: surfaceShadow }}>
                  <Lock size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, color: C.navy, marginBottom: 6 }}>Clear Reasons</h3>
                  <p style={{ fontSize: 15, color: C.navySoft, lineHeight: 1.6 }}>
                    Every alert explains why the person looks relevant, what problem they described, and why it may be worth a look.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981", flexShrink: 0, boxShadow: surfaceShadow }}>
                  <LineChart size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, color: C.navy, marginBottom: 6 }}>Learns From Feedback</h3>
                  <p style={{ fontSize: 15, color: C.navySoft, lineHeight: 1.6 }}>
                    Mark an alert useful or wrong. Arcli learns what you care about so future alerts get sharper.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Right Side: Visual Workflow Canvas Mockup */}
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            
            {/* Offset Background Accent */}
            <div style={{ position: "absolute", top: 12, left: 12, right: -12, bottom: -12, background: "rgba(59,154,232,0.12)", borderRadius: 8, zIndex: 1, border: surfaceBorder }} />

            {/* Main Mockup Container */}
            <div style={{ background: "#FFFFFF", borderRadius: 8, padding: 32, position: "relative", zIndex: 2, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", border: surfaceBorder }}>
              
              {/* Top Canvas Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: 16, marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: "rgba(59,154,232,0.1)", padding: 8, borderRadius: 8, color: C.blue, border: "1px solid rgba(59,154,232,0.2)" }}>
                    <Workflow size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: "0.06em", marginBottom: 2 }}>PROSPECT FINDER</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>Prospect Review Flow</div>
                  </div>
                </div>
                <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 12, letterSpacing: "0.05em" }}>
                  ACTIVE
                </div>
              </div>

              {/* Vertical Pipeline Interface */}
              <div style={{ position: "relative", paddingLeft: 16 }}>
                {/* Visual connecting line */}
                <div style={{ position: "absolute", left: 33, top: 20, bottom: 20, width: 2, background: "rgba(0,0,0,0.06)", zIndex: 0 }} />

                {/* Node 1: Detect */}
                <div style={{ display: "flex", gap: 20, marginBottom: 28, position: "relative", zIndex: 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#FEF2F2", border: "1px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: surfaceShadow }}>
                    <AlertCircle size={16} color="#EF4444" />
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: "0.06em", marginBottom: 4 }}>STEP 1: UNDERSTAND</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.navy, fontFamily: "monospace", display: "inline-block", background: "#FAFAFA", padding: "2px 6px", borderRadius: 4, border: surfaceBorder }}>website reviewed</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Built from your website.</div>
                  </div>
                </div>

                {/* Node 2: Verify */}
                <div style={{ display: "flex", gap: 20, marginBottom: 28, position: "relative", zIndex: 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: surfaceShadow }}>
                    <ShieldCheck size={16} color="#64748B" />
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: "0.06em", marginBottom: 4 }}>STEP 2: FIND</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.navy }}>Online Post Found</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Finds people with similar pain.</div>
                  </div>
                </div>

                {/* Node 3: Recover */}
                <div style={{ display: "flex", gap: 20, marginBottom: 28, position: "relative", zIndex: 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: surfaceShadow }}>
                    <Mail size={16} color={C.blue} />
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: "0.06em", marginBottom: 4 }}>STEP 3: CHECK</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.navy }}>Fit Check</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Checks fit, urgency, and bad matches.</div>
                  </div>
                </div>

                {/* Node 4: Measure */}
                <div style={{ display: "flex", gap: 20, position: "relative", zIndex: 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ECFDF5", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: surfaceShadow }}>
                    <Activity size={16} color="#10B981" />
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", letterSpacing: "0.06em", marginBottom: 4 }}>STEP 4: IMPROVE</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.navy }}>Feedback Applied</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Founder reviewed alert. <span style={{ fontWeight: 600, color: "#10B981" }}>Quality improved.</span></div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
