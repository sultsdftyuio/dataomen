"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare, TrendingUp, FileText, Plug, Bell, ShieldCheck,
  Upload, Search, BarChart3, ChevronDown, ArrowRight, Check,
  Star, Menu, X, Database, Activity, Zap, Lock, ExternalLink,
  Cpu, Layers, Shield, Globe, Share2, Code2
} from "lucide-react";

/* ─── Design Tokens ─────────────────────────────────────────────────────── */
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

/* ─── Injected Styles ────────────────────────────────────────────────────── */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; color: #0A1628; overflow-x: hidden; }

    .pfd { font-family: 'Playfair Display', serif; }
    .jbm { font-family: 'JetBrains Mono', monospace; }

    .nav-scrolled { background: rgba(255,255,255,0.8) !important; backdrop-filter: blur(12px); border-bottom: 1px solid ${C.rule} !important; }

    .btn-navy { background: ${C.navy}; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-navy:hover { background: ${C.navyMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(10,22,40,0.1); }

    .btn-blue { background: ${C.blue}; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-blue:hover { background: ${C.blueMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(27,110,191,0.2); }

    .btn-ghost { background: transparent; color: ${C.navy}; font-weight: 600; font-size: 14px; border: 1.5px solid ${C.rule}; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; }
    .btn-ghost:hover { border-color: ${C.blue}; background: ${C.bluePale}; color: ${C.blue}; }

    .pillar-card { background: #FFFFFF; border: 1.5px solid ${C.rule}; border-radius: 12px; padding: 32px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .pillar-card:hover { border-color: ${C.blue}; transform: translateY(-4px); box-shadow: 0 20px 40px rgba(10,22,40,0.05); }
    
    .fu { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
    .fu.vis { opacity: 1; transform: translateY(0); }

    .dot-grid { background-image: radial-gradient(${C.ruleDark} 1.5px, transparent 1.5px); background-size: 32px 32px; }
    
    .spec-line { border-left: 2px solid ${C.rule}; padding-left: 24px; position: relative; margin-bottom: 32px; }
    .spec-line::before { content: ""; position: absolute; left: -5px; top: 0; width: 8px; height: 8px; background: ${C.blue}; border-radius: 50%; }

    @media (max-width: 768px) { .two-col { grid-template-columns: 1fr !important; gap: 40px !important; } .hide-mobile { display: none !important; } }
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
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 80, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={18} color="#fff" /></div>
          <span className="pfd" style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>Data<span style={{ color: C.blue }}>Omen</span></span>
        </a>
        <div className="hide-mobile" style={{ display: "flex", gap: 32 }}>
          {["Features", "Workflow", "Security", "FAQ"].map(n => <a key={n} href={`#${n.toLowerCase()}`} style={{ textDecoration: "none", color: C.muted, fontWeight: 600, fontSize: 14 }}>{n}</a>)}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/login" className="btn-ghost hide-mobile" style={{ padding: "10px 20px" }}>Log In</a>
          <a href="/register" className="btn-navy" style={{ padding: "10px 24px" }}>Start Building</a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="dot-grid" style={{ paddingTop: 160, paddingBottom: 80, background: C.offWhite }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.bluePale, padding: "6px 14px", borderRadius: 20, marginBottom: 24 }}>
          <Activity size={14} color={C.blue} />
          <span className="jbm" style={{ fontSize: 11, fontWeight: 600, color: C.blue }}>v3.0 ENGINE LIVE — VECTORIZED ANALYTICS</span>
        </div>
        <h1 className="pfd" style={{ fontSize: "clamp(40px, 6vw, 72px)", color: C.navy, lineHeight: 1, marginBottom: 24, fontWeight: 800 }}>
          Analytics at the speed of <span style={{ color: C.blue }}>thought.</span>
        </h1>
        <p style={{ fontSize: 20, color: C.muted, lineHeight: 1.6, marginBottom: 40, maxWidth: 680, margin: "0 auto 40px" }}>
          DataOmen is the analytical core for multi-tenant SaaS. Ask questions in English, get sub-second vectorized responses from your columnar data.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <a href="/register" className="btn-blue" style={{ padding: "16px 36px", fontSize: 16 }}>Start Building <ArrowRight size={18} /></a>
          <a href="#workflow" className="btn-ghost" style={{ padding: "16px 36px", fontSize: 16 }}>View Workflow</a>
        </div>
      </div>
    </section>
  );
}

function EngineSpecs() {
  const [ref, vis] = useVisible(0.1);
  return (
    <section ref={ref} id="security" style={{ padding: "120px 24px", background: "#fff" }}>
      <div className="two-col" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 100, alignItems: "center" }}>
        <div className={`fu ${vis ? "vis" : ""}`}>
          <span className="jbm" style={{ color: C.blue, fontSize: 12, fontWeight: 700 }}>TECHNICAL METHODOLOGY</span>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginTop: 12, marginBottom: 40 }}>The Hybrid Performance Paradigm.</h2>
          
          <div className="spec-line">
            <h4 style={{ fontSize: 18, marginBottom: 8 }}>Orchestration (Backend)</h4>
            <p style={{ color: C.muted, fontSize: 15 }}>OO patterns for services and managers ensure clean dependency injection and rigid multi-tenant security.</p>
          </div>
          
          <div className="spec-line">
            <h4 style={{ fontSize: 18, marginBottom: 8 }}>Computation (Execution)</h4>
            <p style={{ color: C.muted, fontSize: 15 }}>Vectorized, stateless operations using Polars and DuckDB. We move the compute as close to the data as possible.</p>
          </div>
          
          <div className="spec-line" style={{ marginBottom: 0 }}>
            <h4 style={{ fontSize: 18, marginBottom: 8 }}>Interaction (Frontend)</h4>
            <p style={{ color: C.muted, fontSize: 15 }}>100% Functional React components with hooks for a declarative, responsive, and type-safe UI.</p>
          </div>
        </div>

        <div className={`fu ${vis ? "vis" : ""}`} style={{ background: C.navy, borderRadius: 24, padding: 40, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.05 }} className="dot-grid" />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F56" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FFBD2E" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#27C93F" }} />
            </div>
            <pre className="jbm" style={{ color: C.blueLight, fontSize: 13, lineHeight: 1.8 }}>
              <code>{`// Multi-tenant isolation logic
class QueryOrchestrator {
  async execute(tenantId, prompt) {
    const schema = await this.getSchema(tenantId);
    const sql = await NL2SQL.generate(prompt, schema);
    
    // Strict partition enforcement
    return await db.query(sql, { 
      where: { tenant_id: tenantId } 
    });
  }
}`}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModularPipeline() {
  const [ref, vis] = useVisible(0.1);
  const items = [
    { icon: <Globe />, label: "Data Sources", sub: "Postgres, S3, Stripe" },
    { icon: <Layers />, label: "Edge Worker", sub: "Sanitization & Auth" },
    { icon: <Cpu />, label: "DuckDB Engine", sub: "Vectorized Compute" },
    { icon: <Share2 />, label: "API Gateway", sub: "Semantic Routing" },
  ];

  return (
    <section ref={ref} style={{ padding: "100px 24px", background: C.offWhite }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <h2 className="pfd" style={{ fontSize: 36, marginBottom: 60 }}>The Modular Pipeline</h2>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 40 }}>
          {items.map((item, i) => (
            <React.Fragment key={i}>
              <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: `${i * 100}ms`, flex: 1, minWidth: 200 }}>
                <div style={{ width: 64, height: 64, background: "#fff", border: `1.5px solid ${C.rule}`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.blue }}>
                  {item.icon}
                </div>
                <h4 style={{ marginBottom: 4 }}>{item.label}</h4>
                <p style={{ color: C.muted, fontSize: 13 }}>{item.sub}</p>
              </div>
              {i < items.length - 1 && <ArrowRight className="hide-mobile" color={C.ruleDark} />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const [ref, vis] = useVisible(0.1);
  const data = [
    { quote: "I used to spend Sunday nights rebuilding Excel models. Now I ask DataOmen and have the answer before my coffee is done.", name: "Sarah Chen", role: "Head of Growth @ Meridian" },
    { quote: "We spotted a 23% drop in repeat purchases three weeks before it surfaced in reports. That window saved us six figures.", name: "Marcus Webb", role: "Co-Founder @ Apex Retail" },
  ];

  return (
    <section ref={ref} id="testimonials" style={{ padding: "100px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 32 }}>
          {data.map((t, i) => (
            <div key={i} className={`fu ${vis ? "vis" : ""}`} style={{ background: C.bluePale, padding: 48, borderRadius: 24, transitionDelay: `${i * 200}ms` }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>{[1,2,3,4,5].map(s => <Star key={s} size={16} fill={C.blue} color={C.blue} />)}</div>
              <p className="pfd" style={{ fontSize: 24, color: C.navy, marginBottom: 32, lineHeight: 1.4 }}>"{t.quote}"</p>
              <div>
                <strong style={{ display: "block", color: C.navy }}>{t.name}</strong>
                <span className="jbm" style={{ fontSize: 12, color: C.blue }}>{t.role}</span>
              </div>
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
    { q: "Is our data used for AI training?", a: "Never. Your data is exclusively yours. We use semantic routing to provide the LLM only with the necessary schema fragments, never the raw data itself." },
    { q: "How fast is the query engine?", a: "By leveraging columnar Parquet formats and in-process DuckDB, we typically see query execution times under 200ms for datasets up to 100M rows." },
    { q: "Can we swap storage providers?", a: "Yes. Our Modular Strategy treats logic as swappable modules. You can swap R2 for S3 or local storage without rewriting a single line of business logic." },
  ];

  return (
    <section id="faq" style={{ padding: "100px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: 36, textAlign: "center", marginBottom: 60 }}>Frequently Asked Questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item, i) => (
            <div key={i} style={{ border: `1.5px solid ${C.rule}`, borderRadius: 12, overflow: "hidden" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", padding: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: open === i ? C.bluePale : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontWeight: 700, color: C.navy }}>{item.q}</span>
                <ChevronDown style={{ transform: open === i ? "rotate(180deg)" : "none", transition: "0.2s" }} />
              </button>
              {open === i && <div style={{ padding: "0 24px 24px", color: C.muted, lineHeight: 1.6, background: C.bluePale }}>{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Utils ─────────────────────────────────────────────────────────────── */
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

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function Page() {
  return (
    <main>
      <Styles />
      <Navbar />
      <Hero />
      <EngineSpecs />
      <ModularPipeline />
      <Testimonials />
      <FAQ />
      
      {/* Brutalist Footer-CTA */}
      <section style={{ padding: "120px 24px", background: C.navy }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
          <h2 className="pfd" style={{ color: "#fff", fontSize: 52, marginBottom: 24 }}>Stop guessing. Start knowing.</h2>
          <p style={{ color: C.faint, fontSize: 20, marginBottom: 48 }}>Join 2,000+ teams building the future of data-driven SaaS.</p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <a href="/register" className="btn-blue" style={{ padding: "20px 48px", fontSize: 18 }}>Get Started Now</a>
          </div>
        </div>
      </section>

      <footer style={{ padding: "60px 24px", borderTop: `1px solid ${C.rule}`, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: C.faint }}>© 2026 DataOmen Inc. | SOC2 Type II Compliant | Built on Vercel & Supabase</p>
      </footer>
    </main>
  );
}