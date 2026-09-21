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
        paddingTop: 112,
        paddingBottom: 76,
        background: "linear-gradient(180deg, #FFFFFF 0%, #F4F8FF 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: "10%", left: "5%", width: 360, height: 360, background: "rgba(59,154,232,0.16)", borderRadius: "50%", filter: "blur(80px)", opacity: 0.7, zIndex: 0 }} />
      <div style={{ position: "absolute", top: "30%", right: "-5%", width: 440, height: 440, background: "rgba(99,91,255,0.12)", borderRadius: "50%", filter: "blur(100px)", opacity: 0.7, zIndex: 0 }} />

      <div style={{ margin: "0 auto", maxWidth: 1120, padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div
          style={{ margin: "0 auto", maxWidth: 680, textAlign: "center" }}
        >
          <h1
            className="pfd"
            style={{
              fontSize: "clamp(38px, 5vw, 48px)",
              fontWeight: 600,
              color: C.navy,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              margin: "0 0 18px",
            }}
          >
            Find buyers already describing
            <br />
            <span style={{ color: C.blue }}>
              the problem your SaaS solves.
            </span>
          </h1>

          <p style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 16, color: C.navySoft, lineHeight: 1.62, maxWidth: 550, margin: "0 auto 30px" }}>
            Arcli turns your website into a reviewable queue of relevant public conversations, with the original source, match reasoning, and a suggested first reply.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 18 }}>
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
              Start Free Scan <ArrowRight size={16} />
            </a>
          </div>
          <Link
            href="#proof"
            style={{ color: C.navySoft, fontSize: 14, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 4 }}
          >
            See a review-ready lead
          </Link>
        </div>
      </div>
    </section>
  );
}
