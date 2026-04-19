// components/landing/hero.tsx
"use client";

import { ArrowRight, Search } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function Hero() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section
      className="dot-grid"
      style={{ paddingTop: 180, paddingBottom: 100, background: C.offWhite, position: "relative", overflow: "hidden" }}
    >
      {/* Background blobs */}
      <div style={{ position: "absolute", top: "10%", left: "5%", width: 400, height: 400, background: C.bluePale, borderRadius: "50%", filter: "blur(100px)", opacity: 0.6, zIndex: 0 }} />
      <div style={{ position: "absolute", top: "30%", right: "-5%", width: 500, height: 500, background: C.blueTint, borderRadius: "50%", filter: "blur(120px)", opacity: 0.8, zIndex: 0 }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>

        {/* ── Headline Block ── */}
        <div
          style={{ textAlign: "center", marginBottom: 40 }}
          className={`fu ${vis ? "vis" : ""}`}
          ref={ref as React.RefObject<HTMLDivElement>}
        >
          
          {/* Dynamic Search/Query UI Pill */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${C.ruleDark}`,
            borderRadius: 100,
            padding: "8px 24px 8px 8px",
            marginBottom: 36,
            boxShadow: "0 8px 32px rgba(27, 110, 191, 0.08)",
            transform: vis ? "translateY(0)" : "translateY(10px)",
            opacity: vis ? 1 : 0,
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s"
          }}>
            <div style={{
              background: C.blueTint,
              borderRadius: 100,
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: C.blue,
              fontSize: 13,
              fontWeight: 600
            }}>
              <Search size={14} strokeWidth={2.5} /> Ask AI
            </div>
            <span style={{ fontSize: 15, color: C.navyMid, letterSpacing: "-0.01em" }}>
              Graph Shopify sales by region...
            </span>
            <div style={{ width: 2, height: 18, background: C.blue }} className="animate-pulse" />
          </div>

          <h1
            className="pfd hero-text"
            style={{ fontSize: 76, color: C.navy, lineHeight: 1.05, letterSpacing: "-0.04em", maxWidth: 900, margin: "0 auto 24px" }}
          >
            Autonomous<br />
            <span style={{ color: C.blue }}>Business Intelligence.</span>
          </h1>

          <p style={{ fontSize: 20, color: C.muted, lineHeight: 1.6, maxWidth: 600, margin: "0 auto 48px" }}>
            Stop querying. Start knowing. Connect your data stack and let AI agents uncover insights, track anomalies, and build reports automatically.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
            <a href="/register" className="btn-blue" style={{ padding: "18px 44px", fontSize: 16 }}>
              Start Free Trial <ArrowRight size={18} />
            </a>
          </div>

          {/* Social nudge */}
          <p style={{ marginTop: 0, fontSize: 13, color: C.faint, fontWeight: 600 }}>
            14-day free trial · No credit card · Setup in 5 minutes
          </p>
        </div>

      </div>
    </section>
  );
}