"use client";

import { Search, ArrowRight, CheckCircle2, TrendingUp, Sparkles, Bot, Play } from "lucide-react";
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
              Business intelligence without the SQL
            </span>
          </div>

          <h1
            className="pfd hero-text"
            style={{ fontSize: 76, color: C.navy, lineHeight: 1.05, letterSpacing: "-0.04em", maxWidth: 820, margin: "0 auto 24px" }}
          >
            Your AI Data Analyst.<br />
            <span style={{ color: C.blue }}>Ask anything. Get charts instantly.</span>
          </h1>

          <p style={{ fontSize: 20, color: C.muted, lineHeight: 1.6, maxWidth: 620, margin: "0 auto 48px" }}>
            Connect Stripe, Postgres, or Snowflake in seconds. Ask Arcli questions in plain English, and deploy autonomous AI agents to watch your metrics 24/7. No SQL. No tickets. No waiting.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/register" className="btn-blue" style={{ padding: "18px 44px", fontSize: 16 }}>
              Start Free Trial <ArrowRight size={18} />
            </a>
            <a href="#demo" className="btn-ghost" style={{ padding: "18px 36px", fontSize: 16, background: "#fff" }}>
              <Play size={17} /> Try the Playground
            </a>
          </div>

          {/* Social nudge */}
          <p style={{ marginTop: 20, fontSize: 13, color: C.faint, fontWeight: 600 }}>
            14-day free trial · No credit card · Setup in 5 minutes
          </p>
        </div>

        {/* ── Product Mockup ── */}
        <div
          className={`fu ${vis ? "vis" : ""}`}
          style={{ transitionDelay: "200ms", maxWidth: 1000, margin: "0 auto", position: "relative" }}
        >
          {/* Floating Badge 1 */}
          <div className="anim-float-1 hide-mobile" style={{
            position: "absolute", top: -20, left: -40, background: "#fff",
            border: `1px solid ${C.rule}`, borderRadius: 12, padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 20px 40px rgba(10,22,40,0.08)", zIndex: 10
          }}>
            <div style={{ width: 32, height: 32, background: C.greenPale, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={16} color={C.green} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Stripe Synced</div>
              <div style={{ fontSize: 11, color: C.muted }}>2.4M rows processed</div>
            </div>
          </div>

          {/* Floating Badge 2 */}
          <div className="anim-float-2 hide-mobile" style={{
            position: "absolute", bottom: 60, right: -50, background: "#fff",
            border: `1px solid ${C.rule}`, borderRadius: 12, padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 20px 40px rgba(10,22,40,0.08)", zIndex: 10
          }}>
            <div style={{ width: 32, height: 32, background: C.bluePale, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={16} color={C.blue} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Growth Agent Active</div>
              <div style={{ fontSize: 11, color: C.muted }}>Monitoring CAC/LTV</div>
            </div>
          </div>

          {/* App Window */}
          <div style={{ background: "#fff", border: `1.5px solid ${C.ruleDark}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 100px rgba(10,22,40,0.12)" }}>
            {/* Browser chrome */}
            <div style={{ height: 48, background: C.offWhite, borderBottom: `1.5px solid ${C.rule}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 8 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: C.ruleDark }} />)}
              <div style={{ flex: 1, height: 28, background: "#fff", borderRadius: 6, border: `1px solid ${C.rule}`, marginLeft: 24, display: "flex", alignItems: "center", padding: "0 12px" }}>
                <Search size={14} color={C.faint} style={{ marginRight: 8 }} />
                <span style={{ fontSize: 13, color: C.navy, fontWeight: 500 }}>
                  What was our Monthly Recurring Revenue growth across Europe in Q3?
                </span>
              </div>
            </div>

            {/* Answer body */}
            <div style={{ padding: "40px 50px" }}>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 32 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Sparkles size={20} color="#fff" />
                </div>
                <div style={{ paddingTop: 4 }}>
                  <h4 style={{ fontSize: 19, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
                    European MRR grew by 24.2% in Q3.
                  </h4>
                  <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>
                    Growth was primarily driven by the Enterprise segment in Germany and the UK.
                    Arcli generated the following trajectory breakdown from your Stripe dataset.
                  </p>
                </div>
              </div>

              {/* Chart card */}
              <div style={{ background: C.offWhite, borderRadius: 16, padding: 32, border: `1px solid ${C.rule}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 40, alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 13, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Q3 MRR Trajectory
                    </span>
                    <div style={{ fontSize: 32, fontWeight: 800, color: C.navy, marginTop: 4 }}>$842,500</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.green, background: C.greenPale, padding: "8px 16px", borderRadius: 20, fontWeight: 700, fontSize: 14 }}>
                    <TrendingUp size={16} /> +24.2%
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 180 }}>
                  {[40, 45, 42, 55, 60, 58, 70, 75, 85, 82, 95, 100].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}>
                      <div style={{
                        width: "100%", height: `${h}%`,
                        background: i > 8 ? C.blue : C.blueLight,
                        borderRadius: "6px 6px 0 0",
                        opacity: i > 8 ? 1 : 0.6,
                        transition: "all 0.3s"
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trust logos */}
      <div style={{ maxWidth: 1000, margin: "80px auto 0", textAlign: "center", borderTop: `1px solid ${C.rule}`, paddingTop: 40, padding: "40px 24px 0" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 24 }}>
          Trusted by 1,200+ fast-growing data teams worldwide
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap", opacity: 0.45, filter: "grayscale(100%)" }}>
          {["Acme Corp", "GlobalTech", "Nexus", "Quantum", "Vertex"].map((logo, i) => (
            <span key={i} className="pfd" style={{ fontSize: 22, fontWeight: 800 }}>{logo}</span>
          ))}
        </div>
      </div>
    </section>
  );
}