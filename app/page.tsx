"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare, TrendingUp, FileText, Plug, Bell, ShieldCheck,
  Upload, Search, BarChart3, ChevronDown, ArrowRight, Check,
  Star, Menu, X, Database, Activity, Zap, Lock, ExternalLink,
  Cpu, Layers, Shield, Globe, Share2, Code2, Terminal, BarChart
} from "lucide-react";

/* ─── Design Tokens (The Blueprint Aesthetic) ───────────────────────────── */
const C = {
  navy:      "#0A1628",
  navyMid:   "#142038",
  navySoft:  "#1E3A5F",
  blue:      "#1B6EBF",
  blueMid:   "#2580D4",
  blueLight: "#3B9AE8",
  bluePale:  "#EBF4FD",
  blueTint:  "#F0F7FF",
  white:     "#FFFFFF",
  offWhite:  "#F6FAFE",
  rule:      "#DDE8F2",
  ruleDark:  "#C8D9E8",
  muted:     "#546F8A",
  faint:     "#8BADC4",
  text:      "#0A1628",
};

/* ─── Global Styles ──────────────────────────────────────────────────────── */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; color: ${C.navy}; overflow-x: hidden; -webkit-font-smoothing: antialiased; }

    .pfd { font-family: 'Playfair Display', serif; }
    .jbm { font-family: 'JetBrains Mono', monospace; }

    .nav-scrolled { background: rgba(255,255,255,0.8) !important; backdrop-filter: blur(12px); border-bottom: 1px solid ${C.rule} !important; }

    .btn-navy { background: ${C.navy}; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-navy:hover { background: ${C.navyMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(10,22,40,0.1); }

    .btn-blue { background: ${C.blue}; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-blue:hover { background: ${C.blueMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(27,110,191,0.2); }

    .btn-ghost { background: transparent; color: ${C.navy}; font-weight: 600; font-size: 14px; border: 1.5px solid ${C.rule}; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; }
    .btn-ghost:hover { border-color: ${C.blue}; background: ${C.bluePale}; color: ${C.blue}; }

    .fu { opacity: 0; transform: translateY(24px); transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
    .fu.vis { opacity: 1; transform: translateY(0); }

    .dot-grid { background-image: radial-gradient(${C.ruleDark} 1.5px, transparent 1.5px); background-size: 32px 32px; }
    
    .glass-card { background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); border: 1.5px solid ${C.rule}; border-radius: 16px; padding: 32px; transition: all 0.3s; }
    .glass-card:hover { border-color: ${C.blue}; box-shadow: 0 20px 40px rgba(10,22,40,0.04); }

    .spec-line { border-left: 2px solid ${C.rule}; padding-left: 24px; position: relative; margin-bottom: 32px; }
    .spec-line::before { content: ""; position: absolute; left: -5px; top: 0; width: 8px; height: 8px; background: ${C.blue}; border-radius: 50%; }

    @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr !important; gap: 40px !important; } .hide-mobile { display: none !important; } }
  `}</style>
);

/* ─── Components ─────────────────────────────────────────────────────────── */

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav className={scrolled ? "nav-scrolled" : ""} style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, transition: "all 0.3s" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", height: 80, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={18} color="#fff" /></div>
          <span className="pfd" style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>Data<span style={{ color: C.blue }}>Omen</span></span>
        </div>
        <div className="hide-mobile" style={{ display: "flex", gap: 32 }}>
          {["Features", "Engine", "Integrations", "FAQ"].map(n => <a key={n} href={`#${n.toLowerCase()}`} style={{ textDecoration: "none", color: C.muted, fontWeight: 600, fontSize: 14 }}>{n}</a>)}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/login" className="btn-ghost hide-mobile" style={{ padding: "10px 20px" }}>Log In</a>
          <a href="/register" className="btn-navy" style={{ padding: "10px 24px" }}>Get Started</a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="dot-grid" style={{ paddingTop: 180, paddingBottom: 100, background: C.offWhite }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.bluePale, padding: "6px 14px", borderRadius: 20, marginBottom: 24 }}>
            <Activity size={14} color={C.blue} />
            <span className="jbm" style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>v3.0 ANALYTICAL RUNTIME LIVE</span>
          </div>
          <h1 className="pfd" style={{ fontSize: "clamp(48px, 7vw, 84px)", color: C.navy, lineHeight: 0.95, marginBottom: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>
            The SaaS core for <br/><span style={{ color: C.blue }}>Vectorized Intelligence.</span>
          </h1>
          <p style={{ fontSize: 21, color: C.muted, lineHeight: 1.6, marginBottom: 48, maxWidth: 720, margin: "0 auto 48px" }}>
            High-performance, multi-tenant analytical SaaS platform built for speed. Ask complex queries in English; receive sub-second vectorized insights.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <a href="/register" className="btn-blue" style={{ padding: "18px 44px", fontSize: 16 }}>Deploy Your Engine <ArrowRight size={18} /></a>
            <a href="#engine" className="btn-ghost" style={{ padding: "18px 44px", fontSize: 16 }}>Read the Specs</a>
          </div>
        </div>
        
        {/* Abstract Product Mockup */}
        <div style={{ maxWidth: 1000, margin: "0 auto", background: "#fff", border: `1.5px solid ${C.rule}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 100px rgba(10,22,40,0.12)" }}>
           <div style={{ height: 44, background: C.offWhite, borderBottom: `1.5px solid ${C.rule}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 8 }}>
             {[1,2,3].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: C.ruleDark }} />)}
             <div style={{ flex: 1, height: 24, background: "#fff", borderRadius: 4, border: `1px solid ${C.rule}`, marginLeft: 20, display: "flex", alignItems: "center", padding: "0 12px" }}>
                <span className="jbm" style={{ fontSize: 10, color: C.faint }}>https://app.dataomen.io/v3/orchestrator</span>
             </div>
           </div>
           <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[1,2,3,4].map(i => <div key={i} style={{ height: 40, background: C.blueTint, borderRadius: 8 }} />)}
              </div>
              <div style={{ background: C.navy, borderRadius: 12, padding: 32 }}>
                 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
                    <div style={{ height: 12, width: 120, background: C.blueMid, borderRadius: 10, opacity: 0.5 }} />
                    <Activity size={16} color={C.blueLight} />
                 </div>
                 <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
                    {[60, 40, 90, 70, 100, 80, 50, 90].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, background: C.blue, borderRadius: "4px 4px 0 0", opacity: 0.8 }} />
                    ))}
                 </div>
              </div>
           </div>
        </div>
      </div>
    </section>
  );
}

function EngineSpecs() {
  const [ref, vis] = useVisible(0.1);
  return (
    <section ref={ref} id="engine" style={{ padding: "120px 24px", background: "#fff" }}>
      <div className="grid-2" style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 100, alignItems: "center" }}>
        <div className={`fu ${vis ? "vis" : ""}`}>
          <span className="jbm" style={{ color: C.blue, fontSize: 12, fontWeight: 700 }}>THE HYBRID PERFORMANCE PARADIGM</span>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginTop: 12, marginBottom: 40 }}>Architected for <br/>Analytical Efficiency.</h2>
          
          <div className="spec-line">
            <h4 style={{ fontSize: 19, marginBottom: 8, fontWeight: 700 }}>DuckDB-Powered Compute</h4>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>We use in-process analytical engines to move processing as close to the data as possible, enabling sub-second responses on millions of rows.</p>
          </div>
          
          <div className="spec-line">
            <h4 style={{ fontSize: 19, marginBottom: 8, fontWeight: 700 }}>EMA Forecasting</h4>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>Our predictive engine utilizes Linear Algebra concepts like EMA and variance calculations to ensure sensitivity to seasonality.</p>
          </div>
          
          <div className="spec-line" style={{ marginBottom: 0 }}>
            <h4 style={{ fontSize: 19, marginBottom: 8, fontWeight: 700 }}>Semantic SQL Routing</h4>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>Contextual RAG ensures LLMs only see necessary schema fragments, preventing token bloat and eliminating hallucinations.</p>
          </div>
        </div>

        <div className={`fu ${vis ? "vis" : ""}`} style={{ background: C.offWhite, border: `1.5px solid ${C.rule}`, borderRadius: 24, padding: 40, position: "relative" }}>
          <div style={{ marginBottom: 32 }}>
            <span className="jbm" style={{ fontSize: 12, color: C.muted }}>// Core Implementation</span>
            <pre className="jbm" style={{ color: C.navy, fontSize: 14, lineHeight: 1.7, marginTop: 16 }}>
              <code>{`def detect_anomalies(series):
    # Vectorized EMA calculation
    ema = series.ewm(span=20).mean()
    std = series.rolling(20).std()
    
    # Mathematical Precision
    return series > (ema + (2 * std))`}</code>
            </pre>
          </div>
          <div style={{ padding: "20px", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12 }}>
             <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Activity size={16} color={C.blue} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Real-time Detection</span>
             </div>
             <div style={{ height: 4, width: "100%", background: C.bluePale, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "70%", background: C.blue }} />
             </div>
             <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Anomaly detected: 23% Variance in API latency</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Integrations() {
  const [ref, vis] = useVisible(0.1);
  const connectors = [
    { name: "Stripe", icon: <CreditCard size={20}/> },
    { name: "PostgreSQL", icon: <Database size={20}/> },
    { name: "Shopify", icon: <Share2 size={20}/> },
    { name: "S3 / R2", icon: <Globe size={20}/> },
  ];

  return (
    <section ref={ref} id="integrations" style={{ padding: "100px 24px", background: C.navy }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
        <h2 className="pfd" style={{ color: "#fff", fontSize: 42, marginBottom: 24 }}>The Modular Strategy.</h2>
        <p style={{ color: C.faint, fontSize: 18, marginBottom: 60, maxWidth: 600, margin: "0 auto 60px" }}>
          Treat logic as swappable modules. Connect any data source; our unified interface handles the mapping automatically.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
          {connectors.map((c, i) => (
            <div key={i} className={`fu ${vis ? "vis" : ""}`} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", padding: 32, borderRadius: 16, transitionDelay: `${i * 100}ms` }}>
              <div style={{ color: C.blueLight, marginBottom: 16, display: "flex", justifyContent: "center" }}>{c.icon}</div>
              <h4 style={{ color: "#fff" }}>{c.name}</h4>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const items = [
    { q: "How do you handle multi-tenant isolation?", a: "Every query is naturally partitioned using a strict tenant_id filter at the core orchestrator level, ensuring zero data leakage." },
    { q: "Is it really sub-second?", a: "By utilizing vectorized operations (Polars) and columnar Parquet formats, our engine avoids the overhead of traditional row-based row scanning." },
    { q: "Does this work with Supabase?", a: "Perfectly. We use Supabase for Auth and management, while our DuckDB engine handles the intensive analytical compute." },
  ];

  return (
    <section id="faq" style={{ padding: "120px 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: 36, textAlign: "center", marginBottom: 64 }}>Technical Queries</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item, i) => (
            <div key={i} style={{ border: `1.5px solid ${C.rule}`, borderRadius: 16, overflow: "hidden" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", padding: "28px", display: "flex", justifyContent: "space-between", alignItems: "center", background: open === i ? C.bluePale : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span className="pj" style={{ fontWeight: 700, color: C.navy, fontSize: 16 }}>{item.q}</span>
                <ChevronDown style={{ transform: open === i ? "rotate(180deg)" : "none", transition: "0.2s" }} />
              </button>
              {open === i && <div style={{ padding: "0 28px 28px", color: C.muted, lineHeight: 1.7, fontSize: 15 }}>{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Shared Utils ──────────────────────────────────────────────────────── */
function useVisible(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, vis] as const;
}

const CreditCard = ({ size }: { size: number }) => <Plug size={size} />;

/* ─── Main Execution ─────────────────────────────────────────────────────── */
export default function Page() {
  return (
    <main>
      <Styles />
      <Navbar />
      <Hero />
      <EngineSpecs />
      <Integrations />
      <FAQ />
      
      {/* Conversion Anchor */}
      <section style={{ padding: "120px 24px", background: C.blue, textAlign: "center", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 }} className="dot-grid" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 className="pfd" style={{ fontSize: 56, marginBottom: 24 }}>Scale with evidence.</h2>
          <p style={{ fontSize: 20, marginBottom: 48, opacity: 0.9 }}>Connect your first source and ask your first question in 60 seconds.</p>
          <a href="/register" style={{ background: "#fff", color: C.blue, padding: "20px 52px", borderRadius: 12, fontWeight: 800, textDecoration: "none", fontSize: 18, display: "inline-block" }}>Get Started Free</a>
        </div>
      </section>

      <footer style={{ padding: "80px 24px", borderTop: `1px solid ${C.rule}`, textAlign: "center" }}>
        <div style={{ marginBottom: 40, display: "flex", justifyContent: "center", gap: 32 }}>
          {["Documentation", "Status", "Twitter", "GitHub"].map(l => <a key={l} href="#" style={{ color: C.muted, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>{l}</a>)}
        </div>
        <p style={{ fontSize: 13, color: C.faint }}>© 2026 DataOmen Inc. | SOC2 Type II Certified | Built for High-Performance SaaS</p>
      </footer>
    </main>
  );
}