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
      style={{ paddingTop: 180, paddingBottom: 0, background: C.offWhite, position: "relative", overflow: "hidden" }}
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

        {/* ── Product Interface Teaser ── */}
        <div 
          className={`fu ${vis ? "vis" : ""}`}
          style={{ transitionDelay: "150ms", margin: "0 auto", maxWidth: 1000, perspective: 1000 }}
        >
          <div style={{
            background: "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(20px)",
            border: `1px solid ${C.rule}`,
            borderBottom: "none",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            boxShadow: "0 -10px 40px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.6)",
            height: 300, /* Peeking over the edge */
            overflow: "hidden",
            position: "relative",
            transform: "rotateX(2deg)",
            transformOrigin: "bottom"
          }}>
            {/* Mockup Top Bar */}
            <div style={{ height: 48, borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E5E7EB" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E5E7EB" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E5E7EB" }} />
            </div>
            {/* Mockup Content Area */}
            <div style={{ padding: 32, display: "flex", gap: 24, opacity: 0.5 }}>
              <div style={{ flex: 1, height: 120, background: `linear-gradient(to bottom, ${C.bluePale}, transparent)`, borderRadius: 8 }} />
              <div style={{ flex: 2, height: 180, background: `linear-gradient(to bottom, #F3F4F6, transparent)`, borderRadius: 8 }} />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}