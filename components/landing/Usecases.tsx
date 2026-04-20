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
    icon: <TrendingUp size={16} color={C.blue} />,
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
    icon: <PieChart size={16} color={C.green} />,
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
    icon: <Zap size={16} color={C.amber} />,
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
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section style={{ padding: "140px 24px", background: "#fff", borderTop: surfaceBorder, fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }} ref={ref as React.RefObject<HTMLDivElement>}>

        {/* Header: Narrative Precision focused on Arcli's accessibility */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "clamp(34px, 5vw, 44px)", color: C.navy, marginBottom: 18, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 700 }}>
            Built for every team, not just data engineers.
          </h2>
          <p style={{ color: C.muted, fontSize: 16, maxWidth: 620, margin: "0 auto", lineHeight: 1.55 }}>
            No matter your role, Arcli speaks your language and answers the questions that actually move the needle for your department.
          </p>
        </div>

        {/* Cards Grid: Maintains original styling with improved data mapping */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, transitionDelay: "100ms" }}>
          {useCases.map((uc, i) => (
            <div
              key={i}
              style={{
                border: surfaceBorder,
                borderRadius: 8,
                overflow: "hidden",
                transition: "all 0.2s",
                boxShadow: surfaceShadow,
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = surfaceShadow;
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = surfaceShadow;
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              }}
            >
              {/* Card Header Section */}
              <div style={{ background: "#FAFAFA", padding: "16px 16px 14px", borderBottom: surfaceBorder }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FFFFFF", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {uc.icon}
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{uc.team}</span>
                </div>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.5, fontWeight: 500 }}>
                  "{uc.quote}"
                </p>
              </div>

              {/* Interaction Layer: Example queries sharpened for business impact */}
              <div style={{ padding: "14px 16px 16px", background: "#fff" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                  Example questions
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {uc.questions.map((q, j) => (
                    <div key={j} style={{
                      background: "#FAFAFA",
                      border: surfaceBorder,
                      borderRadius: 8,
                      padding: "10px 12px",
                      fontSize: 14,
                      color: C.navy,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      cursor: "pointer", transition: "background 0.15s",
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = "#F3F4F6")}
                    onMouseOut={e  => (e.currentTarget.style.background = "#FAFAFA")}
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