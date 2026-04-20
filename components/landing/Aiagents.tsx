"use client";

import { Activity, Database, Search, LineChart, Bell, Workflow } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

const pipelineSteps = [
  {
    id: "01",
    name: "Autonomous Sentinel",
    role: "Anomaly Detector",
    icon: <Activity size={16} color={C.blue} />,
    desc: "Multi-dimensional ML models evaluate your metrics streams 24/7, identifying complex anomalies and hidden pattern shifts in milliseconds—far beyond simple threshold alerts.",
  },
  {
    id: "02",
    name: "Semantic Memory",
    role: "Context Engine",
    icon: <Database size={16} color={C.blue} />,
    desc: "Leverages Long-Term Memory (LTM) and RAG to deeply understand your unique business cycles, instantly distinguishing between normal seasonality and critical incidents.",
  },
  {
    id: "03",
    name: "Recursive Diagnostics",
    role: "Root-Cause Analyst",
    icon: <Search size={16} color={C.blue} />,
    desc: "Deploys an autonomous swarm to recursively write SQL, execute queries, and traverse your database schema, pinpointing the exact micro-segment or product driving the variance.",
  },
  {
    id: "04",
    name: "Scenario Forecasting",
    role: "Predictive Modeler",
    icon: <LineChart size={16} color={C.blue} />,
    desc: "Executes real-time simulations to project the compounding impact on your KPIs and bottom line, generating predictive trajectories for the next 7 to 30 days.",
  },
  {
    id: "05",
    name: "Actionable Intelligence",
    role: "Dispatcher",
    icon: <Bell size={16} color={C.blue} />,
    desc: "Delivers a boardroom-ready, plain-English brief directly to Slack or Teams, complete with auto-generated visualization boards and immediate mitigation recommendations.",
  },
];

export function AIAgents() {
  const [ref, vis] = useVisible(0.1);
  const surfaceBorder = "1px solid rgba(255,255,255,0.12)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.24)";

  return (
    <section
      id="agents"
      className="blueprint-grid"
      style={{
        padding: "140px 24px",
        background: "linear-gradient(180deg, #0A1628 0%, #0F1F36 100%)",
        position: "relative",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      {/* Subtle atmosphere layer */}
      <div style={{
        position: "absolute", top: 0, left: "20%", width: 520, height: 520,
        background: "rgba(59,154,232,0.22)", borderRadius: "50%", filter: "blur(140px)", opacity: 0.9,
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 64 }} ref={ref as React.RefObject<HTMLDivElement>}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(59,154,232,0.14)", padding: "6px 12px", borderRadius: 8,
            marginBottom: 18, color: C.blueLight, border: "1px solid rgba(96,165,250,0.28)", boxShadow: surfaceShadow,
          }}>
            <Workflow size={14} />
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.05em" }}>THE SUPERVISOR ARCHITECTURE</span>
          </div>
          <h2 style={{ fontSize: "clamp(34px, 5vw, 48px)", color: "#FFFFFF", marginBottom: 20, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 700 }}>
            Don't just query your data.<br />Hire an AI team to watch it.
          </h2>
          <p style={{ color: C.faint, fontSize: 16, maxWidth: 680, margin: "0 auto", lineHeight: 1.55 }}>
            Unlike standard BI dashboards that require you to actively hunt for problems, Arcli uses an advanced multi-agent orchestration pattern to proactively detect, diagnose, and predict outcomes for you.
          </p>
        </div>

        {/* Pipeline */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "150ms" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>

            {/* Connecting line */}
            <div
              className="pipeline-line"
              style={{
                position: "absolute", left: "28px", top: "40px", bottom: "40px",
                width: "2px",
                background: "linear-gradient(to bottom, rgba(96,165,250,0.65), rgba(96,165,250,0.05))",
                zIndex: 0,
              }}
            />

            {pipelineSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 16, position: "relative", zIndex: 1 }}>

                {/* Node number */}
                <div className="hide-mobile" style={{ width: 44, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8,
                    background: "rgba(255,255,255,0.06)", border: surfaceBorder,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#FFFFFF", fontWeight: 700, fontSize: 12,
                    boxShadow: surfaceShadow,
                  }}>
                    {step.id}
                  </div>
                </div>

                {/* Content card */}
                <div
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.03)",
                    border: surfaceBorder,
                    borderRadius: 8, padding: 20,
                    transition: "transform 0.2s, background 0.2s",
                    cursor: "default",
                    boxShadow: surfaceShadow,
                  }}
                  onMouseOver={e => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateX(2px)";
                  }}
                  onMouseOut={e => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(59,154,232,0.16)", border: "1px solid rgba(96,165,250,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {step.icon}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#FFFFFF" }}>{step.name}</h3>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.blueLight, background: "rgba(59,154,232,0.14)", border: "1px solid rgba(96,165,250,0.28)", padding: "3px 8px", borderRadius: 6 }}>
                          {step.role}
                        </span>
                      </div>
                      <p style={{ color: C.faint, fontSize: 14, lineHeight: 1.55 }}>{step.desc}</p>
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}