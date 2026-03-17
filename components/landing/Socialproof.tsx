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

  return (
    <section 
      aria-labelledby="social-proof-heading"
      style={{ padding: "120px 24px", background: "#fff", borderBottom: `1px solid ${C.rule}` }}
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
            background: C.rule, 
            border: `1px solid ${C.rule}`, 
            borderRadius: 24, 
            overflow: "hidden", 
            marginBottom: 100,
            boxShadow: "0 10px 30px rgba(10,22,40,0.04)"
          }}
        >
          {stats.map((s, i) => (
            <div key={i} style={{ background: "#fff", padding: "48px 32px", textAlign: "center" }}>
              <div className="pfd" style={{ fontSize: 52, fontWeight: 900, color: C.navy, marginBottom: 8, letterSpacing: "-0.03em" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Testimonials: Outcome-Driven Narrative ── */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "150ms" }}>
          <p style={{ 
            textAlign: "center", 
            fontSize: 14, 
            fontWeight: 800, 
            color: C.muted, 
            textTransform: "uppercase", 
            letterSpacing: "0.15em", 
            marginBottom: 48 
          }}>
            Powered by Arcli's Multi-Agent Engine
          </p>
          
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", 
            gap: 32 
          }}>
            {testimonials.map((t, i) => (
              <div
                key={i}
                style={{
                  background: C.offWhite, 
                  border: `1px solid ${C.rule}`, 
                  borderRadius: 24,
                  padding: "48px 40px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: 28,
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseOver={e => {
                  e.currentTarget.style.boxShadow = "0 24px 48px rgba(10,22,40,0.08)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseOut={e => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Visual Trust Indicator (Stars) */}
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <div key={s} style={{ fontSize: 18, color: C.amber }}>★</div>
                  ))}
                </div>

                <blockquote style={{ fontSize: 18, color: C.navy, lineHeight: 1.7, fontStyle: "italic", flex: 1, margin: 0 }}>
                  "{t.quote}"
                </blockquote>

                <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: `1px solid ${C.rule}`, paddingTop: 24 }}>
                  <div style={{
                    width: 48, 
                    height: 48, 
                    borderRadius: 14,
                    background: t.color,
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center",
                    color: "#fff", 
                    fontWeight: 800, 
                    fontSize: 15, 
                    flexShrink: 0,
                    boxShadow: `0 8px 16px ${t.color}33`
                  }}>
                    {t.initials}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <cite style={{ fontWeight: 800, color: C.navy, fontSize: 15, fontStyle: "normal" }}>{t.name}</cite>
                    <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{t.role} · {t.company}</span>
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