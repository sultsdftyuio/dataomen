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