"use client";

import React from "react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

/**
 * Arcli Social Proof Component
 * * Strategy: Establish high-performance trust through empirical metrics and 
 * outcome-driven testimonials. 
 * * Architecture: Utilizes semantic grid layouts for accessibility and 
 * intersection observers (useVisible) for viewport-optimized rendering.
 */

interface Stat {
  value: string;
  label: string;
}

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  initials: string;
  color: string;
}

const stats: Stat[] = [
  { value: "1,200+", label: "High-Growth Teams" },
  { value: "4.2B",   label: "Rows Analyzed Monthly" },
  { value: "< 5 min", label: "To First Insight" },
  { value: "99.99%",  label: "Architecture SLA" },
];

const testimonials: Testimonial[] = [
  {
    quote: "Arcli's Supervisor Architecture replaced 80% of our manual BI dashboard cycles. Our analysts now spend their time on market strategy, not writing SQL tickets.",
    name: "Sarah Chen",
    role: "Head of Data",
    company: "Nexus Technologies",
    initials: "SC",
    color: C.blue,
  },
  {
    quote: "We caught a critical payment gateway latency spike before a single customer reported it, thanks to Arcli's vectorized anomaly detection. It paid for itself in one hour.",
    name: "Marcus Webb",
    role: "VP Engineering",
    company: "Quantum Commerce",
    initials: "MW",
    color: C.green,
  },
  {
    quote: "Our non-technical founders now pull complex expansion metrics independently using plain English. Arcli has effectively democratized our DuckDB compute layer.",
    name: "Priya Nair",
    role: "CTO",
    company: "Vertex SaaS",
    initials: "PN",
    color: C.navySoft,
  },
];

export function SocialProof() {
  const [ref, vis] = useVisible(0.1);
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section 
      aria-labelledby="social-proof-heading"
      style={{ padding: "120px 24px", background: "#fff", borderBottom: surfaceBorder, fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }} ref={ref as React.RefObject<HTMLDivElement>}>
        <h2 id="social-proof-heading" className="sr-only">Social Proof and Statistics</h2>

        {/* ── Stats Row: Hybrid Performance Architecture ── */}
        <div
          className={`fu ${vis ? "vis" : ""}`}
          style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", 
            gap: 1, 
            background: "rgba(0,0,0,0.08)", 
            border: surfaceBorder, 
            borderRadius: 8, 
            overflow: "hidden", 
            marginBottom: 88,
            boxShadow: surfaceShadow
          }}
        >
          {stats.map((s, i) => (
            <div key={i} style={{ background: "#fff", padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 44, fontWeight: 700, color: C.navy, marginBottom: 6, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Testimonials: Outcome-Driven Narrative ── */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "150ms" }}>
          <p style={{ 
            textAlign: "center", 
            fontSize: 12,
            fontWeight: 600,
            color: C.muted, 
            textTransform: "uppercase", 
            letterSpacing: "0.12em", 
            marginBottom: 36 
          }}>
            Powered by Arcli's Multi-Agent Engine
          </p>
          
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", 
            gap: 16
          }}>
            {testimonials.map((t, i) => (
              <div
                key={i}
                style={{
                  background: "#FAFAFA", 
                  border: surfaceBorder,
                  borderRadius: 8,
                  padding: "24px 20px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: 16,
                  transition: "all 0.2s ease",
                  boxShadow: surfaceShadow,
                }}
                onMouseOver={e => {
                  e.currentTarget.style.boxShadow = surfaceShadow;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseOut={e => {
                  e.currentTarget.style.boxShadow = surfaceShadow;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Visual Trust Indicator (Stars) */}
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <div key={s} style={{ fontSize: 14, color: C.amber }}>★</div>
                  ))}
                </div>

                <blockquote style={{ fontSize: 16, color: C.navy, lineHeight: 1.55, fontStyle: "normal", flex: 1, margin: 0 }}>
                  "{t.quote}"
                </blockquote>

                <div style={{ display: "flex", alignItems: "center", gap: 12, borderTop: surfaceBorder, paddingTop: 14 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: t.color,
                    border: surfaceBorder,
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center",
                    color: "#fff", 
                    fontWeight: 700,
                    fontSize: 13,
                    flexShrink: 0,
                    boxShadow: surfaceShadow
                  }}>
                    {t.initials}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <cite style={{ fontWeight: 600, color: C.navy, fontSize: 14, fontStyle: "normal" }}>{t.name}</cite>
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>{t.role} · {t.company}</span>
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