// components/landing/hero.tsx
"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { C } from "@/lib/tokens";

export function Hero() {
  return (
    <section
      className="dot-grid"
      style={{
        paddingTop: 152,
        paddingBottom: 96,
        background: "linear-gradient(180deg, #FFFFFF 0%, #F4F8FF 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: "10%", left: "5%", width: 360, height: 360, background: "rgba(59,154,232,0.16)", borderRadius: "50%", filter: "blur(80px)", opacity: 0.7, zIndex: 0 }} />
      <div style={{ position: "absolute", top: "30%", right: "-5%", width: 440, height: 440, background: "rgba(99,91,255,0.12)", borderRadius: "50%", filter: "blur(100px)", opacity: 0.7, zIndex: 0 }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div
          style={{ textAlign: "center", marginBottom: 36 }}
        >
          <h1
            className="pfd"
            style={{
              fontSize: "clamp(40px, 6vw, 54px)",
              fontWeight: 600,
              color: C.navy,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: 860,
              margin: "0 auto 20px",
            }}
          >
            Find B2B buyers already talking
            <br />
            <span style={{ color: C.blue }}>
              about the problem you solve.
            </span>
          </h1>

          <p style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 17, color: C.navySoft, lineHeight: 1.62, maxWidth: 640, margin: "0 auto 36px" }}>
            Add your website. Arcli learns what you sell, finds relevant public conversations, checks the context, and gives you evidence to review before you decide what to do next.
          </p>

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
                letterSpacing: "0.02em",
              }}
            >
              Find Prospects <ArrowRight size={16} />
            </a>
          </div>
          <Link
            href="/resources/buyer-intent-signals"
            style={{ color: C.navySoft, fontSize: 14, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 4 }}
          >
            Learn how buyer-intent signals work
          </Link>
        </div>
      </div>
    </section>
  );
}
