"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { C } from "@/lib/tokens";

export default function ArcliPricingCards() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section
      id="pricing"
      style={{
        padding: "96px 24px",
        background: C.offWhite,
        borderTop: `1px solid ${C.rule}`,
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <div style={{ maxWidth: 1024, margin: "0 auto" }}>
        {/* Section Header */}
        <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 56px" }}>
          <h2
            style={{
              fontSize: "clamp(32px, 4vw, 44px)",
              fontWeight: 600,
              color: C.text,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: 12,
            }}
          >
            Predictable infrastructure. <br />
            <span style={{ color: C.blue }}>Zero black-box taxing.</span>
          </h2>
          <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.6, margin: "0 0 28px" }}>
            Test your ingestion pipeline for free. Upgrade to automate churn recovery and keep 100% of the revenue you save.
          </p>

          {/* Billing Toggle */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "4px 8px", background: C.white, borderRadius: 999, border: `1px solid ${C.rule}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: !isAnnual ? C.text : C.faint }}>
              Monthly Billing
            </span>
            <button
              type="button"
              onClick={() => setIsAnnual(!isAnnual)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                background: isAnnual ? C.blue : C.faint,
                position: "relative",
                border: "none",
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}
              aria-label="Toggle billing frequency"
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: C.white,
                  position: "absolute",
                  top: 3,
                  left: isAnnual ? 23 : 3,
                  transition: "left 0.2s ease",
                }}
              />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: isAnnual ? C.text : C.faint, display: "flex", alignItems: "center", gap: 6 }}>
              Annual Commitment
              <span style={{ fontSize: 10, fontWeight: 700, background: C.greenPale, color: C.green, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                2 Months Free
              </span>
            </span>
          </div>
        </div>

        {/* Pricing Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "stretch" }}>
          
          {/* Developer Sandbox */}
          <div
            style={{
              background: C.white,
              border: `1px solid ${C.rule}`,
              borderRadius: 16,
              padding: 36,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>
                Sandbox Environment
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                Integration Verification
              </h3>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.5, minHeight: 42, marginBottom: 24 }}>
                Verify webhook replay safety, inspect explainable risk scoring, and test tenant isolation locally.
              </p>

              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 700, color: C.text, letterSpacing: "-0.03em" }}>$0</span>
                  <span style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>/ forever</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
                {[
                  "Up to 100 tracked events / month",
                  "Local webhook catcher & deduplication testing",
                  "Deterministic signal debugging inspector",
                  "Isolated tenant schema verification",
                ].map((feat, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: C.text }}>
                    <CheckCircle2 size={16} color={C.blue} style={{ flexShrink: 0 }} />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/register?tier=sandbox"
              style={{
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                background: C.bluePale,
                color: C.blue,
                border: `1px solid ${C.rule}`,
              }}
            >
              Deploy Sandbox Tenant <ArrowRight size={14} />
            </Link>
          </div>

          {/* Production Engine */}
          <div
            style={{
              background: C.white,
              border: `2px solid ${C.blue}`,
              borderRadius: 16,
              padding: 36,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 8px 24px rgba(27,110,191,0.08)",
              position: "relative",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.blue }}>
                  Production Engine
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, background: C.greenPale, color: C.green, padding: "2px 8px", borderRadius: 999 }}>
                  0% Rev-Share
                </span>
              </div>
              
              <h3 style={{ fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                Automated Recovery Layer
              </h3>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.5, minHeight: 42, marginBottom: 24 }}>
                Route high-risk accounts into retry-safe recovery sequences and attribute exact MRR restored.
              </p>

              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 700, color: C.text, letterSpacing: "-0.03em" }}>
                    ${isAnnual ? "24" : "29"}
                  </span>
                  <span style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>/ month</span>
                </div>
                <div style={{ fontSize: 12, color: C.blue, fontWeight: 500, marginTop: 4 }}>
                  {isAnnual ? "Billed annually ($290/year)" : "Billed monthly ($29/month)"}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
                {[
                  "Unlimited automated recovery campaigns",
                  "Exact revenue attribution ledger",
                  "Distributed execution with idempotency locks",
                  "Strict anti-spam cooldown enforcement",
                  "Stripe invoice & subscription lifecycle sync",
                ].map((feat, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: C.text }}>
                    <CheckCircle2 size={16} color={C.blue} style={{ flexShrink: 0 }} />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/register?tier=pro"
              style={{
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                background: "linear-gradient(135deg, #1B6EBF 0%, #0F4F91 100%)",
                color: C.white,
                boxShadow: "0 2px 4px rgba(27,110,191,0.2)",
              }}
            >
              Start 3-Day Pro Trial <ArrowRight size={14} />
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}