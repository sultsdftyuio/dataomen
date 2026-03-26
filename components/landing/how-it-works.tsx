"use client";

import React from "react";
import { 
  Database, 
  Sparkles, 
  Bot, 
  CheckCircle2, 
  ChevronRight, 
  Activity, 
  AlertTriangle 
} from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function HowItWorks() {
  const [ref1, vis1] = useVisible(0.1);
  const [ref2, vis2] = useVisible(0.1);
  const [ref3, vis3] = useVisible(0.1);

  return (
    <section id="how-it-works" style={{ padding: "140px 24px", background: C.offWhite, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 100 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
            PIPELINE ARCHITECTURE
          </div>
          <h2 className="pfd" style={{ fontSize: 48, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
            From Raw Data to <span style={{ color: C.blue }}>Autonomous Action.</span>
          </h2>
          <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, maxWidth: 640, margin: "0 auto" }}>
            A modular, unified engine designed to seamlessly bridge the gap between your raw database and proactive business intelligence.
          </p>
        </div>

        {/* ── Step 1: Connect Infrastructure ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.navy, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Database size={18} color={C.blue} /> STEP 01
            </div>
            <h2 className="pfd" style={{ fontSize: 40, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Connect Infrastructure
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Connect your live database or warehouse in seconds. Arcli instantly maps your schema, types, and relationships, building a comprehensive vector topology for analysis without moving your data.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {["Secure read-only connections", "Automatic schema inference", "Instant vector mapping"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={20} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, background: C.offWhite, padding: 40, borderRadius: 24, border: `1px solid ${C.rule}`, position: "relative" }}>
            <div className="jbm" style={{ background: "#1E1E1E", color: "#D4D4D4", padding: 24, borderRadius: 12, fontSize: 13, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", lineHeight: 1.8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F56" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FFBD2E" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#27C93F" }} />
              </div>
              <div style={{ color: "#CE9178", marginBottom: 8 }}>
                <span style={{ color: "#858585", marginRight: 8 }}>$</span> 
                arcli connect --source postgresql_prod
              </div>
              <div style={{ color: "#858585", marginBottom: 8 }}>Initiating secure read-only tunnel...</div>
              <div style={{ color: "#4EC9B0", fontWeight: "bold", marginBottom: 8 }}>✓ Connection established.</div>
              <div style={{ color: "#858585", marginBottom: 8 }}>Extracting schema topologies...</div>
              <div style={{ paddingLeft: 16, borderLeft: "2px solid #569CD6", marginBottom: 16 }}>
                <div>Found table: <span style={{ color: "#569CD6" }}>core_transactions</span> <span style={{ color: "#858585" }}>(1.2M rows)</span></div>
                <div>Found table: <span style={{ color: "#569CD6" }}>users</span> <span style={{ color: "#858585" }}>(84K rows)</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", color: "#CE9178", fontWeight: "bold" }}>
                <ChevronRight size={16} style={{ marginRight: 4 }} />
                Ready for analysis.
              </div>
            </div>
            {/* Decorative background block */}
            <div style={{ position: "absolute", top: -10, right: -10, left: 30, bottom: 30, background: C.blueLight, borderRadius: 24, zIndex: -1, opacity: 0.5 }} />
          </div>
        </div>

        {/* ── Step 2: Contextual RAG Querying ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref2 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.navy, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Sparkles size={18} color={C.blue} /> STEP 02
            </div>
            <h2 className="pfd" style={{ fontSize: 40, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Contextual RAG Querying
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Ask complex business questions in plain English. The engine synthesizes your specific schema context to write perfectly optimized SQL instantly, rendering the answer as data or beautiful visualizations.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {["Plain English to optimized SQL", "Context-aware semantic routing", "Dynamic visualization mapping"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={20} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, position: "relative" }}>
             <div style={{ background: "#fff", borderRadius: 24, padding: 32, border: `1px solid ${C.rule}`, boxShadow: "0 30px 60px rgba(10,22,40,0.05)", position: "relative", zIndex: 2 }}>
                
                {/* User Input Bubble */}
                <div style={{ background: C.offWhite, border: `1px solid ${C.rule}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(59,154,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>US</span>
                  </div>
                  <div style={{ fontWeight: 600, color: C.navy, fontSize: 15 }}>
                    "Show MRR growth over the last 4 months."
                  </div>
                </div>

                {/* SQL Code Block */}
                <div className="jbm" style={{ background: "#1E1E1E", color: "#D4D4D4", padding: 16, borderRadius: 12, fontSize: 12, marginBottom: 24, lineHeight: 1.6 }}>
                  <span style={{ color: "#569CD6" }}>SELECT</span> date_trunc(<span style={{ color: "#CE9178" }}>'month'</span>, created_at), <span style={{ color: "#569CD6" }}>SUM</span>(amount)<br />
                  <span style={{ color: "#569CD6" }}>FROM</span> subscriptions <span style={{ color: "#569CD6" }}>WHERE</span> status = <span style={{ color: "#CE9178" }}>'active'</span><br />
                  <span style={{ color: "#569CD6" }}>GROUP BY</span> 1 <span style={{ color: "#569CD6" }}>ORDER BY</span> 1 <span style={{ color: "#569CD6" }}>DESC</span>;
                </div>

                {/* Chart Visualization */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100, padding: "0 16px" }}>
                  {[30, 45, 60, 85].map((h, i) => (
                    <div key={i} style={{ flex: 1, background: C.blue, height: `${h}%`, borderRadius: "6px 6px 0 0", opacity: 0.8 }} />
                  ))}
                </div>
             </div>
             {/* Decorative background block */}
             <div style={{ position: "absolute", top: 20, left: -20, right: 20, bottom: -20, background: C.offWhite, border: `1px solid ${C.rule}`, borderRadius: 24, zIndex: 1 }} />
          </div>
        </div>

        {/* ── Step 3: Deploy Autonomous Agents ── */}
        <div className="grid-2" ref={ref3 as React.RefObject<HTMLDivElement>}>
          <div className={`fu ${vis3 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.navy, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Bot size={18} color={C.red} /> STEP 03
            </div>
            <h2 className="pfd" style={{ fontSize: 40, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Deploy Autonomous Agents
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Turn powerful queries into proactive watchdogs. AI agents continuously monitor your metrics 24/7, employing linear algebra and statistical variance to detect hidden anomalies before they hit the bottom line.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {["24/7 Continuous metric monitoring", "Statistical variance & EMA detection", "Instant root-cause diagnosis alerts"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={20} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis3 ? "vis" : ""}`} style={{ order: 2, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 24, padding: 40, position: "relative", zIndex: 2, color: "#fff", boxShadow: "0 30px 60px rgba(10,22,40,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="pulse-indicator pulse-red" />
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.05em" }}>WATCHDOG ACTIVE</span>
                </div>
                <div className="jbm" style={{ padding: "4px 8px", background: "rgba(39, 201, 63, 0.1)", color: C.green, borderRadius: 6, fontSize: 11, fontWeight: "bold" }}>
                  SYSTEM NOMINAL
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Nominal Log */}
                <div style={{ display: "flex", gap: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
                  <Activity size={20} color={C.faint} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <h5 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Routine Check: Daily Active Users</h5>
                    <p className="jbm" style={{ fontSize: 12, color: C.faint }}>Variance: +1.2% (Within normal thresholds)</p>
                  </div>
                </div>

                {/* Anomaly Log */}
                <div style={{ display: "flex", gap: 16, background: "rgba(255,59,48,0.1)", border: `1px solid ${C.red}`, borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.red }} />
                  <AlertTriangle size={20} color={C.red} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <h5 style={{ fontSize: 15, fontWeight: 700, color: C.redPale, marginBottom: 8 }}>Anomaly Detected: API Error Rate</h5>
                    <p style={{ fontSize: 14, color: "#fff", opacity: 0.8, lineHeight: 1.5 }}>
                      Gateway 502 errors spiked by 400% in the last 5 minutes. Highly correlated with recent deployment <code className="jbm" style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4, color: C.redPale, fontSize: 12 }}>v2.4.1</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Decorative background block */}
            <div style={{ position: "absolute", top: -20, left: -20, right: 20, bottom: 20, background: C.red, borderRadius: 24, zIndex: 1, opacity: 0.08 }} />
          </div>
        </div>

      </div>
    </section>
  );
}