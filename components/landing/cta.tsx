"use client";

import { CheckCircle2, ArrowRight, Play } from "lucide-react";
import { C } from "@/lib/tokens";

export function CTA() {
  return (
    <section
      style={{
        padding: "120px 24px",
        background: "linear-gradient(135deg, #1B6EBF 0%, #0F4F91 100%)",
        textAlign: "center",
        color: "#FFFFFF",
        position: "relative",
        overflow: "hidden",
        borderTop: "1px solid rgba(255,255,255,0.16)",
        fontFamily: "var(--font-geist-sans), sans-serif"
      }}
    >
      {/* Subtle atmosphere accents */}
      <div style={{ position: "absolute", top: "-10%", left: "-8%", width: 380, height: 380, background: "rgba(59,154,232,0.28)", borderRadius: "50%", opacity: 0.9, filter: "blur(90px)" }} />
      <div style={{ position: "absolute", bottom: "-12%", right: "-8%", width: 320, height: 320, background: "rgba(99,91,255,0.22)", borderRadius: "50%", opacity: 0.85, filter: "blur(80px)" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{ fontSize: "clamp(34px, 5vw, 48px)", marginBottom: 14, lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 700 }}>
          Stop guessing.<br />Start knowing.
        </h2>
        <p style={{ fontSize: 16, marginBottom: 30, color: "rgba(255,255,255,0.88)", lineHeight: 1.55 }}>
          Connect your first data source and deploy your first autonomous AI agent in under 5 minutes.
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 22 }}>
          <a
            href="/register"
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: "none",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "#FFFFFF",
              color: C.blue,
            }}
          >
            Initialize Agent <ArrowRight size={14} />
          </a>
          <a
            href="#demo"
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: "none",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.12)",
              color: "#FFFFFF",
            }}
          >
            <Play size={14} /> Try the Playground
          </a>
        </div>

        {/* Trust nudges */}
        <div style={{ display: "flex", gap: 16, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)", flexWrap: "wrap", justifyContent: "center" }}>
          {["14-day free trial", "No credit card required", "Setup in 5 minutes"].map((t, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={14} /> {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}