// components/landing/hero.tsx
"use client";

import { ArrowRight } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function Hero() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section
      className="dot-grid"
      style={{
        paddingTop: 168,
        paddingBottom: 112,
        background: "linear-gradient(180deg, #FFFFFF 0%, #F4F8FF 100%)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Subtle atmosphere accents */}
      <div style={{ position: "absolute", top: "10%", left: "5%", width: 360, height: 360, background: "rgba(59,154,232,0.16)", borderRadius: "50%", filter: "blur(80px)", opacity: 0.7, zIndex: 0 }} />
      <div style={{ position: "absolute", top: "30%", right: "-5%", width: 440, height: 440, background: "rgba(99,91,255,0.12)", borderRadius: "50%", filter: "blur(100px)", opacity: 0.7, zIndex: 0 }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>

        {/* ── Headline Block ── */}
        <div
          style={{ textAlign: "center", marginBottom: 36 }}
          className={`fu ${vis ? "vis" : ""}`}
          ref={ref as React.RefObject<HTMLDivElement>}
        >
          <h1
            style={{
              fontSize: 44,
              fontWeight: 600,
              color: C.navy,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
              maxWidth: 800,
              margin: "0 auto 16px",
              fontFamily: "var(--font-geist-sans)"
            }}
          >
            Autonomous business intelligence infrastructure.
          </h1>

          <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.5, maxWidth: 500, margin: "0 auto 32px", fontWeight: 400 }}>
            Stop querying and start knowing. Connect your data stack and let specialized AI agents uncover insights automatically.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 18 }}>
            <a
              href="/register"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                background: C.blue,
                color: "#fff",
                fontFamily: "var(--font-geist-sans), sans-serif",
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                textDecoration: "none",
                whiteSpace: "nowrap",
                letterSpacing: "0.02em"
              }}
            >
              Start Free Trial <ArrowRight size={16} />
            </a>
          </div>

          {/* Social nudge */}
          <p style={{ fontFamily: "var(--font-geist-sans), sans-serif", marginTop: 0, fontSize: 12, color: C.faint, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            14-day free trial · No credit card · Setup in 5 minutes
          </p>
        </div>

      </div>
    </section>
  );
}