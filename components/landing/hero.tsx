// components/landing/hero.tsx
"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function Hero() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section
      className="dot-grid"
      style={{ paddingTop: 180, paddingBottom: 60, background: C.offWhite, position: "relative", overflow: "hidden" }}
    >
      {/* Background blobs */}
      <div style={{ position: "absolute", top: "10%", left: "5%", width: 400, height: 400, background: C.bluePale, borderRadius: "50%", filter: "blur(100px)", opacity: 0.6, zIndex: 0 }} />
      <div style={{ position: "absolute", top: "30%", right: "-5%", width: 500, height: 500, background: C.blueTint, borderRadius: "50%", filter: "blur(120px)", opacity: 0.8, zIndex: 0 }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>

        {/* ── Headline Block ── */}
        <div
          style={{ textAlign: "center", marginBottom: 60 }}
          className={`fu ${vis ? "vis" : ""}`}
          ref={ref as React.RefObject<HTMLDivElement>}
        >
          {/* Eyebrow badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "#fff", border: `1px solid ${C.ruleDark}`,
            padding: "6px 16px", borderRadius: 30, marginBottom: 32,
            boxShadow: "0 4px 12px rgba(0,0,0,0.03)"
          }}>
            <Sparkles size={14} color={C.blue} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
              The Unified Data Infrastructure
            </span>
          </div>

          <h1
            className="pfd hero-text"
            style={{ fontSize: 76, color: C.navy, lineHeight: 1.05, letterSpacing: "-0.04em", maxWidth: 900, margin: "0 auto 24px" }}
          >
            The Intelligent Data Operating System.<br />
            <span style={{ color: C.blue }}>Connect, govern, and automate.</span>
          </h1>

          <p style={{ fontSize: 20, color: C.muted, lineHeight: 1.6, maxWidth: 660, margin: "0 auto 48px" }}>
            Connect your entire stack, govern your metrics, and let AI automate your insights. From raw integrations to proactive intelligence—all in one unified platform.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/register" className="btn-blue" style={{ padding: "18px 44px", fontSize: 16 }}>
              Start Free Trial <ArrowRight size={18} />
            </a>
          </div>

          {/* Social nudge */}
          <p style={{ marginTop: 20, fontSize: 13, color: C.faint, fontWeight: 600 }}>
            14-day free trial · No credit card · Setup in 5 minutes
          </p>
        </div>
      </div>
    </section>
  );
}