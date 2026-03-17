"use client";

import React from "react";
import { TrendingUp, PieChart, Zap } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

/**
 * UseCases Component
 * * Interaction (Frontend): 100% Functional React component with viewport-optimized rendering.
 * * Strategy: Multi-persona mapping. Demonstrates how Arcli provides instant 
 * value across diverse business verticals by translating technical data into 
 * department-specific outcomes.
 * * Style-Lock: Strictly preserves the original grid layout and visual tokens.
 */

interface UseCase {
  team: string;
  icon: React.ReactNode;
  color: string;
  iconBg: string;
  questions: string[];
  quote: string;
}

const useCases: UseCase[] = [
  {
    team: "Marketing",
    icon: <TrendingUp size={22} color={C.blue} />,
    color: C.bluePale,
    iconBg: C.blue,
    questions: [
      "Why did Paid Social ROAS drop 15% yesterday?",
      "Which campaign has the highest LTV to CAC ratio?",
      "Compare trial-to-paid conversion by lead source",
    ],
    quote: "We cut reporting time from 2 days to 2 minutes using Arcli.",
  },
  {
    team: "Finance",
    icon: <PieChart size={22} color={C.green} />,
    color: C.greenPale,
    iconBg: C.green,
    questions: [
      "What is our projected MRR churn for next month?",
      "Breakdown gross margin by enterprise product line",
      "Calculate runway impact of the new hiring plan",
    ],
    quote: "Our CFO pulls her own revenue breakdowns now.",
  },
  {
    team: "Product",
    icon: <Zap size={22} color={C.amber} />,
    color: C.amberPale,
    iconBg: C.amber,
    questions: [
      "Which features are the biggest retention drivers?",
      "Where is the highest drop-off in the onboarding flow?",
      "Compare active usage: Free vs. Enterprise tiers",
    ],
    quote: "We found our #1 churn bottleneck in one session.",
  },
];

export function UseCases() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section style={{ padding: "140px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }} ref={ref as React.RefObject<HTMLDivElement>}>

        {/* Header: Narrative Precision focused on Arcli's accessibility */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 72 }}>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 20, lineHeight: 1.1 }}>
            Built for every team, not just data engineers.
          </h2>
          <p style={{ color: C.muted, fontSize: 18, maxWidth: 580, margin: "0 auto" }}>
            No matter your role, Arcli speaks your language and answers the questions that actually move the needle for your department.
          </p>
        </div>

        {/* Cards Grid: Maintains original styling with improved data mapping */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, transitionDelay: "100ms" }}>
          {useCases.map((uc, i) => (
            <div
              key={i}
              style={{
                border: `1.5px solid ${C.rule}`, borderRadius: 24,
                overflow: "hidden", transition: "all 0.2s",
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 20px 48px rgba(10,22,40,0.08)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              }}
            >
              {/* Card Header Section */}
              <div style={{ background: uc.color, padding: "28px 28px 24px", borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: uc.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {uc.icon}
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>{uc.team}</span>
                </div>
                <p style={{ fontSize: 13, color: C.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>
                  "{uc.quote}"
                </p>
              </div>

              {/* Interaction Layer: Example queries sharpened for business impact */}
              <div style={{ padding: "24px 28px", background: "#fff" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  Example questions
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {uc.questions.map((q, j) => (
                    <div key={j} style={{
                      background: C.offWhite, border: `1px solid ${C.rule}`,
                      borderRadius: 10, padding: "12px 16px",
                      fontSize: 14, color: C.navy, fontWeight: 500, lineHeight: 1.4,
                      cursor: "pointer", transition: "background 0.15s",
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = C.blueTint)}
                    onMouseOut={e  => (e.currentTarget.style.background = C.offWhite)}
                    >
                      "{q}"
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}