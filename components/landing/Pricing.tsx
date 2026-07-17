"use client";

import React from "react";
import Link from "next/link";
import { 
  CheckCircle2, 
  Activity, 
  ArrowRight, 
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { C } from "@/lib/tokens";

export default function ArcliPricingCards() {
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <section 
      id="pricing" 
      style={{ 
        padding: "140px 24px", 
        background: "#FAFAFA", 
        borderTop: surfaceBorder, 
        fontFamily: "var(--font-geist-sans), sans-serif",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Background Decorative Gradient */}
      <div 
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 800,
          height: 400,
          background: "rgba(235, 244, 253, 0.6)",
          filter: "blur(80px)",
          borderRadius: "50%",
          pointerEvents: "none"
        }} 
      />

      <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 10 }}>
        
        {/* Section Header */}
        <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 64px auto" }}>
          <div 
            style={{ 
              display: "inline-flex", 
              alignItems: "center", 
              gap: 8, 
              color: C.blue, 
              fontWeight: 700, 
              fontSize: 12, 
              marginBottom: 16, 
              letterSpacing: "0.08em", 
              textTransform: "uppercase",
              background: C.bluePale,
              border: `1px solid rgba(27,110,191,0.18)`,
              padding: "6px 14px",
              borderRadius: 20
            }}
          >
            <Activity size={14} /> SIMPLE PROSPECT INTELLIGENCE PRICING
          </div>
          
          <h2 
            style={{ 
              fontSize: 42, 
              color: C.navy, 
              marginBottom: 16, 
              lineHeight: 1.08, 
              letterSpacing: "-0.015em", 
              fontWeight: 600 
            }}
          >
            Start for free. <br />
            <span style={{ color: C.blue }}>Upgrade when signals turn into revenue.</span>
          </h2>
          
          <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62 }}>
            Use Arcli to understand your SaaS, verify public prospect signals, and alert your team when real opportunities appear.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "stretch" }}>
          
          {/* ── CARD 1: Free Plan ($0) ── */}
          <div 
            style={{ 
              background: C.white, 
              borderRadius: 12, 
              border: surfaceBorder, 
              boxShadow: surfaceShadow,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden"
            }}
          >
            <div style={{ padding: "32px 28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <span 
                    style={{ 
                      display: "inline-flex", 
                      alignItems: "center", 
                      gap: 6, 
                      padding: "4px 10px", 
                      borderRadius: 6, 
                      fontSize: 11, 
                      fontWeight: 700, 
                      background: "rgba(84,111,138,0.1)", 
                      color: C.muted, 
                      letterSpacing: "0.05em", 
                      textTransform: "uppercase", 
                      marginBottom: 8 
                    }}
                  >
                    Free Forever
                  </span>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: C.navy, margin: 0 }}>Free Plan</h3>
                </div>
              </div>

              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>
                Perfect for validating how prospect intelligence works for your SaaS before you scale discovery.
              </p>

              {/* Price Display */}
              <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em" }}>$0</span>
                  <span style={{ color: C.muted, fontWeight: 600, fontSize: 14 }}>/ forever</span>
                </div>
                <p style={{ fontSize: 12, color: C.faint, fontWeight: 600, marginTop: 6 }}>
                  No credit card required. Instant access.
                </p>
              </div>

              {/* Feature Specs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  What&apos;s Included
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.blue} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Build one Service Profile from your website</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.blue} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Limited verified prospect alerts</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.blue} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Explainable AI verification summaries</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.blue} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Standard email support</span>
                </div>
              </div>
            </div>

            <div style={{ padding: "0 28px 32px 28px" }}>
              <Link 
                href="/register?tier=free" 
                style={{ 
                  width: "100%", 
                  height: 44, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  gap: 8, 
                  borderRadius: 8, 
                  fontWeight: 700, 
                  color: C.navy, 
                  background: C.offWhite, 
                  border: surfaceBorder,
                  textDecoration: "none", 
                  fontSize: 14,
                  boxShadow: surfaceShadow
                }}
              >
                Get Started Free <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* ── CARD 2: Pro Plan ($29) ── */}
          <div 
            style={{ 
              background: "linear-gradient(180deg, #FFFFFF 0%, #FAFCFF 100%)", 
              borderRadius: 12, 
              border: "1px solid rgba(27,110,191,0.28)", 
              boxShadow: "0 12px 32px -8px rgba(27,110,191,0.12)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {/* Top Accent Bar */}
            <div style={{ height: 6, width: "100%", background: `linear-gradient(90deg, ${C.blue} 0%, ${C.blueLight} 100%)` }} />

            <div style={{ padding: "32px 28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <span 
                    style={{ 
                      display: "inline-flex", 
                      alignItems: "center", 
                      gap: 6, 
                      padding: "4px 10px", 
                      borderRadius: 6, 
                      fontSize: 11, 
                      fontWeight: 700, 
                      background: C.bluePale, 
                      color: C.blue, 
                      border: "1px solid rgba(27,110,191,0.2)",
                      letterSpacing: "0.05em", 
                      textTransform: "uppercase", 
                      marginBottom: 8 
                    }}
                  >
                    <Sparkles size={12} fill={C.blue} /> Recommended
                  </span>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: C.navy, margin: 0 }}>Pro Plan</h3>
                </div>
              </div>

              <p style={{ fontSize: 14, color: C.navySoft, lineHeight: 1.6, marginBottom: 24 }}>
                Continuously discover and verify prospect signals from public discussions without turning your team into keyword hunters.
              </p>

              {/* Price Display */}
              <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid rgba(27,110,191,0.14)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em" }}>$29</span>
                  <span style={{ color: C.muted, fontWeight: 600, fontSize: 14 }}>/ month</span>
                </div>
                <p style={{ fontSize: 12, color: C.blue, fontWeight: 600, marginTop: 6 }}>
                  No commission on the revenue you generate.
                </p>
              </div>

              {/* Feature Specs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  Everything in Free, plus:
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Continuous discovery across public discussions</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Explainable intent and pain validation</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>False-positive filters and negative keyword controls</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Service Profile refresh from your website</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Priority 24/7 support</span>
                </div>
              </div>
            </div>

            <div style={{ padding: "0 28px 32px 28px" }}>
              <Link 
                href="/register?tier=pro" 
                style={{ 
                  width: "100%", 
                  height: 44, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  gap: 8, 
                  borderRadius: 8, 
                  fontWeight: 700, 
                  color: C.white, 
                  background: C.blue, 
                  textDecoration: "none", 
                  fontSize: 14,
                  boxShadow: "0 4px 12px rgba(27,110,191,0.24)"
                }}
              >
                Start 3-Day Free Trial <ArrowRight size={16} />
              </Link>
              
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.rule}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <ShieldCheck size={14} color={C.blue} /> Cancel Anytime
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
