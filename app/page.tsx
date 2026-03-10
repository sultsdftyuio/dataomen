"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare, TrendingUp, FileText, Plug, Bell, ShieldCheck,
  Upload, Search, BarChart3, ChevronDown, ArrowRight, Check,
  Star, Menu, X, Database, Activity, Zap, Lock, ExternalLink
} from "lucide-react";

/* ─── Design Tokens (Blueprint Aesthetic) ───────────────────────────────── */
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

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface NavItem { label: string; href: string; }
interface Pillar { icon: React.ReactNode; title: string; desc: string; tag: string; }
interface Step { num: string; icon: React.ReactNode; title: string; desc: string; }
interface Testimonial { quote: string; name: string; role: string; company: string; stars: number; }

/* ─── Injected Styles ────────────────────────────────────────────────────── */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; color: #0A1628; overflow-x: hidden; }

    .pfd { font-family: 'Playfair Display', serif; }
    .jbm { font-family: 'JetBrains Mono', monospace; }

    .nav-scrolled {
      background: rgba(255,255,255,0.8) !important;
      backdrop-filter: blur(12px);
      border-bottom: 1px solid ${C.rule} !important;
    }

    .btn-navy { background: ${C.navy}; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-navy:hover { background: ${C.navyMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(10,22,40,0.1); }

    .btn-blue { background: ${C.blue}; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-blue:hover { background: ${C.blueMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(27,110,191,0.2); }

    .btn-ghost { background: transparent; color: ${C.navy}; font-weight: 600; font-size: 14px; border: 1.5px solid ${C.rule}; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; }
    .btn-ghost:hover { border-color: ${C.blue}; background: ${C.bluePale}; color: ${C.blue}; }

    .pillar-card { background: #FFFFFF; border: 1.5px solid ${C.rule}; border-radius: 12px; padding: 32px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; }
    .pillar-card:hover { border-color: ${C.blue}; transform: translateY(-4px); box-shadow: 0 20px 40px rgba(10,22,40,0.05); }
    
    .fu { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
    .fu.vis { opacity: 1; transform: translateY(0); }

    .dot-grid { background-image: radial-gradient(${C.ruleDark} 1.5px, transparent 1.5px); background-size: 32px 32px; }
    
    @media (max-width: 768px) {
      .two-col { grid-template-columns: 1fr !important; gap: 40px !important; }
      .hide-mobile { display: none !important; }
    }
  `}</style>
);

/* ─── Data ───────────────────────────────────────────────────────────────── */
const NAV_ITEMS: NavItem[] = [
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
];

const PILLARS: Pillar[] = [
  { icon: <MessageSquare size={20}/>, title: "Natural Language SQL", desc: "Ask questions in plain English. Our engine translates intent into optimized SQL queries in real-time.", tag: "LLM-Powered" },
  { icon: <TrendingUp size={20}/>, title: "Anomaly Detection", desc: "Utilize EMA-based variance tracking to spot revenue leaks or usage spikes before they become trends.", tag: "Linear Algebra" },
  { icon: <Zap size={20}/>, title: "DuckDB Compute", desc: "Processing happens in-memory and on-edge, delivering sub-second responses on millions of rows.", tag: "Columnar" },
  { icon: <Lock size={20}/>, title: "Tenant Isolation", desc: "Every query is strictly partitioned by tenant_id. Your data never mingles with others, guaranteed.", tag: "Security" },
  { icon: <Plug size={20}/>, title: "Unified Connectors", desc: "Native adapters for Stripe, Postgres, and Shopify. Modular strategy allows for seamless custom integrations.", tag: "Modular" },
  { icon: <Activity size={20}/>, title: "Live Dashboards", desc: "Streaming data ingestion via Cloudflare Workers ensures your metrics are never more than 5 seconds old.", tag: "Real-time" },
];

const STEPS: Step[] = [
  { num: "01", icon: <Upload size={20}/>, title: "Ingest", desc: "Connect your existing data sources via secure, read-only analytical tunnels." },
  { num: "02", icon: <Search size={20}/>, title: "Query", desc: "Chat with your database. No schema mapping or manual indexing required." },
  { num: "03", icon: <BarChart3 size={20}/>, title: "Deploy", desc: "Turn any insight into a live-monitored KPI with automated alerting." },
];

/* ─── Hooks ─────────────────────────────────────────────────────────────── */
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

/* ─── Components ─────────────────────────────────────────────────────────── */

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
          <span className="pfd" style={{ fontSize: 22, fontWeight: 800, color: C.navy, letterSpacing: "-0.03em" }}>Data<span style={{ color: C.blue }}>Omen</span></span>
        </a>

        <div className="hide-mobile" style={{ display: "flex", gap: 32 }}>
          {NAV_ITEMS.map(n => <a key={n.label} href={n.href} style={{ textDecoration: "none", color: C.muted, fontWeight: 600, fontSize: 14 }}>{n.label}</a>)}
        </div>

        <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/login" className="btn-ghost" style={{ padding: "10px 20px" }}>Log In</a>
          <a href="/register" className="btn-navy" style={{ padding: "10px 24px" }}>Start Building</a>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: "none", border: "none", color: C.navy, cursor: "pointer" }} className="mob-menu-btn">
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <div style={{ position: "absolute", top: 80, left: 0, right: 0, background: "#fff", borderBottom: `1px solid ${C.rule}`, padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {NAV_ITEMS.map(n => <a key={n.label} href={n.href} onClick={() => setMobileOpen(false)} style={{ textDecoration: "none", color: C.navy, fontWeight: 700, fontSize: 18 }}>{n.label}</a>)}
          <hr style={{ border: "none", borderTop: `1px solid ${C.rule}` }} />
          <a href="/register" className="btn-blue" style={{ justifyContent: "center", padding: "16px" }}>Get Started</a>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  const [typed, setTyped] = useState("");
  const query = "Analyze churn vs revenue per tenant...";
  
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setTyped(query.slice(0, i));
      i++;
      if (i > query.length) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="dot-grid" style={{ paddingTop: 160, paddingBottom: 100, background: C.offWhite }}>
      <div className="two-col" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 80, alignItems: "center" }}>
        <div className="fu vis">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.bluePale, padding: "6px 14px", borderRadius: 20, marginBottom: 24 }}>
            <Activity size={14} color={C.blue} />
            <span className="jbm" style={{ fontSize: 11, fontWeight: 600, color: C.blue, textTransform: "uppercase" }}>v3.0 Engine Live</span>
          </div>
          <h1 className="pfd" style={{ fontSize: "clamp(40px, 5vw, 64px)", color: C.navy, lineHeight: 1.05, marginBottom: 24, fontWeight: 800 }}>The analytical core for modern SaaS.</h1>
          <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.6, marginBottom: 40, maxWidth: 540 }}>
            Move data processing to the edge. Ask complex business questions and receive vectorized insights instantly. No SQL, no bottlenecks.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <a href="/register" className="btn-blue" style={{ padding: "16px 32px", fontSize: 16 }}>Start Free Trial <ArrowRight size={18} /></a>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex" }}>{[1,2,3,4,5].map(i => <Star key={i} size={14} fill={C.blue} color={C.blue} />)}</div>
              <span className="jbm" style={{ fontSize: 12, color: C.muted }}>Trusted by 2,000+ teams</span>
            </div>
          </div>
        </div>

        <div className="hide-mobile">
          <div style={{ background: "#fff", border: `1.5px solid ${C.rule}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 60px rgba(10,22,40,0.08)" }}>
            <div style={{ background: C.offWhite, padding: "12px 20px", borderBottom: `1.5px solid ${C.rule}`, display: "flex", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 6 }}>{[1,2,3].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: C.ruleDark }} />)}</div>
              <span className="jbm" style={{ fontSize: 10, color: C.faint }}>dataomen_query_v2.sql</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: C.navy, borderRadius: 8, padding: "16px", color: "#fff", fontSize: 14, marginBottom: 16, display: "flex", gap: 10 }}>
                <span style={{ color: C.blueLight }}>{">"}</span>
                <span className="jbm">{typed}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[80, 45, 95].map((w, i) => (
                  <div key={i} style={{ height: 32, width: `${w}%`, background: C.bluePale, borderRadius: 4, display: "flex", alignItems: "center", padding: "0 12px" }}>
                    <div style={{ height: 8, width: "100%", background: C.blue, borderRadius: 4, opacity: 0.2 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const [ref, vis] = useVisible(0.1);
  return (
    <section ref={ref} id="features" style={{ padding: "120px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 80 }} className={`fu ${vis ? "vis" : ""}`}>
          <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 20 }}>Engineered for speed.</h2>
          <p style={{ color: C.muted, maxWidth: 600, margin: "0 auto", fontSize: 18 }}>We’ve stripped away the overhead of traditional BI to give you raw, vectorized performance.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {PILLARS.map((p, i) => (
            <div key={i} className={`pillar-card fu ${vis ? "vis" : ""}`} style={{ transitionDelay: `${i * 100}ms` }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: C.bluePale, color: C.blue, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>{p.icon}</div>
              <span className="jbm" style={{ fontSize: 10, color: C.blue, fontWeight: 700, marginBottom: 12, display: "block" }}>{p.tag}</span>
              <h3 style={{ fontSize: 20, color: C.navy, marginBottom: 12 }}>{p.title}</h3>
              <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const [ref, vis] = useVisible(0.2);
  return (
    <section ref={ref} id="workflow" style={{ padding: "100px 24px", background: C.navy }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
        <h2 className="pfd" style={{ color: "#fff", fontSize: 42, marginBottom: 60 }}>Deployment Strategy</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 40, position: "relative" }}>
          {STEPS.map((s, i) => (
            <div key={i} className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: `${i * 150}ms` }}>
              <div style={{ color: C.blueLight, fontSize: 48, fontWeight: 800, marginBottom: 20, opacity: 0.3 }}>{s.num}</div>
              <h4 style={{ color: "#fff", fontSize: 22, marginBottom: 12 }}>{s.title}</h4>
              <p style={{ color: C.faint, lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section style={{ padding: "120px 24px", background: C.offWhite }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", background: C.blue, borderRadius: 24, padding: "80px 40px", textAlign: "center", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 }} className="dot-grid" />
        <h2 className="pfd" style={{ fontSize: 48, marginBottom: 24, position: "relative" }}>Ready to automate your intelligence?</h2>
        <p style={{ fontSize: 20, marginBottom: 40, opacity: 0.9, maxWidth: 600, margin: "0 auto 40px" }}>Join the forward-thinking teams using DataOmen to turn raw rows into strategic revenue.</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
          <a href="/register" style={{ background: "#fff", color: C.blue, padding: "18px 40px", borderRadius: 12, fontWeight: 700, textDecoration: "none", fontSize: 18 }}>Get Started Now</a>
          <a href="/login" style={{ border: "2px solid rgba(255,255,255,0.3)", color: "#fff", padding: "18px 40px", borderRadius: 12, fontWeight: 700, textDecoration: "none", fontSize: 18 }}>Schedule Demo</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: "80px 24px 40px", borderTop: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 48, marginBottom: 60 }}>
        <div>
          <span className="pfd" style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>DataOmen</span>
          <p style={{ marginTop: 16, color: C.muted, fontSize: 14 }}>The edge-compute analytical engine for multi-tenant SaaS platforms.</p>
        </div>
        {["Product", "Company", "Legal"].map((col) => (
          <div key={col}>
            <h5 style={{ color: C.navy, marginBottom: 20, fontSize: 14, fontWeight: 700 }}>{col}</h5>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1,2,3].map(i => <a key={i} href="#" style={{ color: C.muted, textDecoration: "none", fontSize: 14 }}>Link {i}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", borderTop: `1px solid ${C.rule}`, paddingTop: 40, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
        <p style={{ fontSize: 12, color: C.faint }}>© {new Date().getFullYear()} DataOmen Inc. Built on Vercel & Supabase.</p>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="#" style={{ color: C.muted }}><ExternalLink size={16}/></a>
        </div>
      </div>
    </footer>
  );
}

export default function Page() {
  return (
    <main>
      <Styles />
      <Navbar />
      <Hero />
      <Features />
      <Workflow />
      <CTA />
      <Footer />
    </main>
  );
}