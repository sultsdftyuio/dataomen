"use client";

import { Activity, Database, Search, LineChart, Bell, Workflow } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

const pipelineSteps = [
  {
    id: "01",
    name: "Autonomous Sentinel",
    role: "Anomaly Detector",
    icon: <Activity size={20} color={C.blueLight} />,
    desc: "Multi-dimensional ML models evaluate your metrics streams 24/7, identifying complex anomalies and hidden pattern shifts in milliseconds—far beyond simple threshold alerts.",
  },
  {
    id: "02",
    name: "Semantic Memory",
    role: "Context Engine",
    icon: <Database size={20} color={C.blueLight} />,
    desc: "Leverages Long-Term Memory (LTM) and RAG to deeply understand your unique business cycles, instantly distinguishing between normal seasonality and critical incidents.",
  },
  {
    id: "03",
    name: "Recursive Diagnostics",
    role: "Root-Cause Analyst",
    icon: <Search size={20} color={C.blueLight} />,
    desc: "Deploys an autonomous swarm to recursively write SQL, execute queries, and traverse your database schema, pinpointing the exact micro-segment or product driving the variance.",
  },
  {
    id: "04",
    name: "Scenario Forecasting",
    role: "Predictive Modeler",
    icon: <LineChart size={20} color={C.blueLight} />,
    desc: "Executes real-time simulations to project the compounding impact on your KPIs and bottom line, generating predictive trajectories for the next 7 to 30 days.",
  },
  {
    id: "05",
    name: "Actionable Intelligence",
    role: "Dispatcher",
    icon: <Bell size={20} color={C.blueLight} />,
    desc: "Delivers a boardroom-ready, plain-English brief directly to Slack or Teams, complete with auto-generated visualization boards and immediate mitigation recommendations.",
  },
];

export function AIAgents() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section
      id="agents"
      className="blueprint-grid"
      style={{
        padding: "140px 24px",
        background: C.navy,
        position: "relative",
        borderTop: `1px solid ${C.navyMid}`,
        borderBottom: `1px solid ${C.navyMid}`,
      }}
    >
      {/* Decorative glow */}
      <div style={{
        position: "absolute", top: 0, left: "20%", width: 600, height: 600,
        background: C.blue, borderRadius: "50%", filter: "blur(180px)", opacity: 0.13,
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 80 }} ref={ref as React.RefObject<HTMLDivElement>}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(59,154,232,0.15)", padding: "6px 16px", borderRadius: 30,
            marginBottom: 24, color: C.blueLight, border: "1px solid rgba(59,154,232,0.3)",
          }}>
            <Workflow size={16} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>THE SUPERVISOR ARCHITECTURE</span>
          </div>
          <h2 className="pfd" style={{ fontSize: 48, color: "#fff", marginBottom: 24, lineHeight: 1.1 }}>
            Don't just query your data.<br />Hire an AI team to watch it.
          </h2>
          <p style={{ color: C.faint, fontSize: 18, maxWidth: 650, margin: "0 auto", lineHeight: 1.6 }}>
            Unlike standard BI dashboards that require you to actively hunt for problems, Arcli uses an advanced multi-agent orchestration pattern to proactively detect, diagnose, and predict outcomes for you.
          </p>
        </div>

        {/* Pipeline */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "150ms" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>

            {/* Connecting line */}
            <div
              className="pipeline-line"
              style={{
                position: "absolute", left: "28px", top: "40px", bottom: "40px",
                width: "2px",
                background: "linear-gradient(to bottom, rgba(59,154,232,0.5), rgba(59,154,232,0.05))",
                zIndex: 0,
              }}
            />

            {pipelineSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 32, position: "relative", zIndex: 1 }}>

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

                {/* Content card */}
                <div
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 20, padding: 32,
                    transition: "transform 0.2s, background 0.2s",
                    cursor: "default",
                  }}
                  onMouseOver={e => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateX(4px)";
                  }}
                  onMouseOut={e => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(59,154,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {step.icon}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <h3 style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{step.name}</h3>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.blueLight, background: "rgba(59,154,232,0.1)", padding: "4px 10px", borderRadius: 20 }}>
                          {step.role}
                        </span>
                      </div>
                      <p style={{ color: C.faint, fontSize: 16, lineHeight: 1.6 }}>{step.desc}</p>
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