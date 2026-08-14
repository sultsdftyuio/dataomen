"use client";

import { CheckCircle2, ArrowRight } from "lucide-react";
import { C } from "@/lib/tokens";
import { Reveal, RevealWords } from "@/components/landing/reveal";

export function CTA() {
  return (
    <section
      style={{
        padding: "112px 24px",
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
        <h2 className="pfd" style={{ fontSize: "clamp(38px, 5vw, 54px)", marginBottom: 14, lineHeight: 1.05, letterSpacing: "-0.015em", fontWeight: 600 }}>
          <RevealWords text="Skip the noise." />
          <br />
          <RevealWords text="Find real prospects." delay={160} />
        </h2>
        <p style={{ fontSize: 17, marginBottom: 30, color: "rgba(255,255,255,0.9)", lineHeight: 1.62 }}>
          Add your website. Arcli finds people already asking for help with the problem you solve.
        </p>


        {/* CTA buttons */}
        <Reveal delay={180}>
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
                letterSpacing: "0.02em",
              }}
            >
              Find Prospects <ArrowRight size={14} />
            </a>
          </div>
        </Reveal>

        {/* Trust nudges */}
        <Reveal delay={260}>
          <div style={{ display: "flex", gap: 16, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.82)", letterSpacing: "0.03em", textTransform: "uppercase", flexWrap: "wrap", justifyContent: "center" }}>
          {["Simple $35/month Pro", "Cancel anytime", "Start from your website"].map((t, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={14} /> {t}
            </span>
          ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
