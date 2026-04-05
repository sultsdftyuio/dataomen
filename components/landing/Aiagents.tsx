"use client";

import React, { useState } from "react";
import { Activity, Database, Search, LineChart, Bell, Workflow, ArrowRight, Server, Zap } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

// SEO v10: Content Depth Hierarchy & Entity Alignment mapping
const pipelineSteps = [
  {
    id: "01",
    name: "Autonomous Sentinel",
    role: "Anomaly Detector",
    icon: <Activity size={20} color={C.blueLight} />,
    surfaceDesc: "Evaluates your metrics streams 24/7, identifying complex anomalies and hidden pattern shifts in milliseconds.",
    deepDesc: "Deploys unsupervised ML (Isolation Forests) across high-cardinality time-series data to detect n-dimensional pattern shifts without manual rules.",
    vsTraditional: "Traditional BI relies on static, manual thresholds that cause alert fatigue.",
  },
  {
    id: "02",
    name: "Semantic Memory",
    role: "Context Engine",
    icon: <Database size={20} color={C.blueLight} />,
    surfaceDesc: "Understands your unique business cycles, instantly distinguishing between normal seasonality and critical incidents.",
    deepDesc: "Leverages Long-Term Memory (LTM) and advanced RAG to continuously vector-map historical performance context to current anomalies.",
    vsTraditional: "Traditional tools treat all spikes equally, ignoring historical business context.",
  },
  {
    id: "03",
    name: "Recursive Diagnostics",
    role: "Root-Cause Analyst",
    icon: <Search size={20} color={C.blueLight} />,
    surfaceDesc: "Pinpoints the exact micro-segment or product driving the variance by autonomously writing and executing queries.",
    deepDesc: "An autonomous swarm writes multi-join SQL, traverses your schema, and executes recursive hypothesis testing to isolate causality.",
    vsTraditional: "Standard BI requires data engineers to manually slice data for hours to find the 'why'.",
  },
  {
    id: "04",
    name: "Scenario Forecasting",
    role: "Predictive Modeler",
    icon: <LineChart size={20} color={C.blueLight} />,
    surfaceDesc: "Projects the compounding impact on your KPIs and bottom line, generating trajectories for the next 7 to 30 days.",
    deepDesc: "Executes Monte Carlo simulations in real-time, mapping isolated variance out to downstream revenue impacts.",
    vsTraditional: "Legacy dashboards only show what happened yesterday, not what will happen tomorrow.",
  },
  {
    id: "05",
    name: "Actionable Intelligence",
    role: "Dispatcher",
    icon: <Bell size={20} color={C.blueLight} />,
    surfaceDesc: "Delivers a boardroom-ready brief directly to Slack or Teams, complete with mitigation recommendations.",
    deepDesc: "Generates intent-optimized NLP summaries combined with dynamic Vega charts, pushing semantic payloads to webhook endpoints.",
    vsTraditional: "Typical alerts send a raw link to a broken dashboard. We send the exact answer.",
  },
];

export function AIAgents() {
  const [ref, vis] = useVisible(0.1);
  const [depth, setDepth] = useState<"surface" | "deep">("surface");

  // SEO v10: Entity Alignment & Ranking Engine Structured Data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Arcli Multi-Agent Supervisor",
    "applicationCategory": "BusinessIntelligenceApplication",
    "description": "Multi-agent AI architecture for automated root-cause analysis and data anomaly detection.",
    "featureList": pipelineSteps.map(s => s.name),
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": pipelineSteps.map((step, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "name": step.name,
        "description": step.deepDesc
      }))
    }
  };

  return (
    <section
      id="agents"
      className="blueprint-grid"
      aria-label="Arcli AI Agent Architecture"
      style={{
        padding: "140px 24px",
        background: C.navy,
        position: "relative",
        borderTop: `1px solid ${C.navyMid}`,
        borderBottom: `1px solid ${C.navyMid}`,
      }}
    >
      {/* Schema.org Injection */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Decorative glow */}
      <div style={{
        position: "absolute", top: 0, left: "20%", width: 600, height: 600,
        background: C.blue, borderRadius: "50%", filter: "blur(180px)", opacity: 0.13,
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", position: "relative", zIndex: 1 }}>
        
        {/* Header Block: High-Intent & Hooks */}
        <header className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 60 }} ref={ref as React.RefObject<HTMLDivElement>}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(59,154,232,0.15)", padding: "6px 16px", borderRadius: 30,
            marginBottom: 24, color: C.blueLight, border: "1px solid rgba(59,154,232,0.3)",
          }}>
            <Workflow size={16} aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>THE SUPERVISOR ARCHITECTURE</span>
          </div>
          
          <h2 className="pfd" style={{ fontSize: 48, color: "#fff", marginBottom: 24, lineHeight: 1.1 }}>
            Don't just query your data.<br />Hire an AI team to watch it.
          </h2>
          
          <p style={{ color: C.faint, fontSize: 18, maxWidth: 650, margin: "0 auto", lineHeight: 1.6, marginBottom: 32 }}>
            Unlike standard BI dashboards that require you to actively hunt for problems, Arcli uses an advanced multi-agent orchestration pattern to proactively detect, diagnose, and predict outcomes.
          </p>

          {/* UI Persuasion Layer: Content Depth Controller */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            <button 
              onClick={() => setDepth("surface")}
              style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: depth === "surface" ? C.blue : "rgba(255,255,255,0.05)",
                color: depth === "surface" ? "#fff" : C.faint,
                border: `1px solid ${depth === "surface" ? C.blueLight : "transparent"}`,
                cursor: "pointer", transition: "all 0.2s"
              }}
            >
              Business Value
            </button>
            <button 
              onClick={() => setDepth("deep")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: depth === "deep" ? "rgba(59,154,232,0.15)" : "rgba(255,255,255,0.05)",
                color: depth === "deep" ? C.blueLight : C.faint,
                border: `1px solid ${depth === "deep" ? "rgba(59,154,232,0.4)" : "transparent"}`,
                cursor: "pointer", transition: "all 0.2s"
              }}
            >
              <Server size={14} /> Engineering Depth
            </button>
          </div>
        </header>

        {/* Query Class: Process & Workflow Pipeline */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "150ms" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
            
            {/* Semantic Connecting line */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute", left: "28px", top: "40px", bottom: "40px", width: "2px",
                background: "linear-gradient(to bottom, rgba(59,154,232,0.5), rgba(59,154,232,0.05))",
                zIndex: 0,
              }}
            />

            {pipelineSteps.map((step, i) => (
              <article key={i} style={{ display: "flex", gap: 32, position: "relative", zIndex: 1 }}>
                
                {/* Node number */}
                <div className="hide-mobile" style={{ width: 56, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: C.navyMid, border: "2px solid rgba(59,154,232,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 800, fontSize: 18,
                    boxShadow: "0 0 20px rgba(59,154,232,0.15)",
                  }}>
                    {step.id}
                  </div>
                </div>

                {/* Content Block (Entity UI Block) */}
                <div
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 20, padding: 32,
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                  onMouseOver={e => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(59,154,232,0.3)";
                  }}
                  onMouseOut={e => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(59,154,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {step.icon}
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <h3 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>{step.name}</h3>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.blueLight, background: "rgba(59,154,232,0.1)", padding: "4px 10px", borderRadius: 20 }}>
                          {step.role}
                        </span>
                      </header>
                      
                      {/* Dynamic Semantic Density (Toggleable Depth) */}
                      <p style={{ color: C.faint, fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
                        {depth === "surface" ? step.surfaceDesc : step.deepDesc}
                      </p>

                      {/* SERP Competition Layer: Integrated Comparison Block */}
                      <div style={{ 
                        background: "rgba(0,0,0,0.2)", padding: "12px 16px", borderRadius: 8,
                        borderLeft: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "flex-start", gap: 12 
                      }}>
                        <Zap size={16} color={C.faint} style={{ marginTop: 2, flexShrink: 0 }} />
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5 }}>
                          <strong style={{ color: "rgba(255,255,255,0.8)" }}>vs. BI:</strong> {step.vsTraditional}
                        </p>
                      </div>

                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}