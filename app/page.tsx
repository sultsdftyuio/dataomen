"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare, TrendingUp, FileText, Plug, Bell, ShieldCheck,
  Upload, Search, BarChart3, ChevronDown, ArrowRight, Check,
  Star, Menu, X, Database, Activity, Zap, Lock,
} from "lucide-react";

/* ─── Design Tokens (Hardcoded for Blueprint Aesthetic) ─────────────────── */
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
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600;1,700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; -webkit-font-smoothing: antialiased; color: #0A1628; }

    .pj  { font-family: 'Plus Jakarta Sans', sans-serif; }
    .pfd { font-family: 'Playfair Display', serif; }
    .jbm { font-family: 'JetBrains Mono', monospace; }

    @media (max-width: 900px) {
      .two-col, .three-col, .stats-row { grid-template-columns: 1fr !important; }
      .hide-sm, .step-conn { display: none !important; }
    }
    @media (max-width: 640px) {
      .cta-grid { grid-template-columns: 1fr !important; }
      .nav-btns { display: none !important; }
      .mob-menu-btn { display: block !important; }
    }
    @media (min-width: 641px) { .mob-menu-btn { display: none !important; } }

    .nav-scrolled {
      background: rgba(255,255,255,0.97) !important;
      backdrop-filter: blur(20px);
      border-bottom: 1.5px solid #DDE8F2 !important;
      box-shadow: 0 2px 20px rgba(10,22,40,0.07) !important;
    }

    .btn-navy { background: #0A1628; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-navy:hover { background: #142038; box-shadow: 0 8px 28px rgba(10,22,40,0.22); transform: translateY(-1px); }

    .btn-blue { background: #1B6EBF; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-blue:hover { background: #2580D4; box-shadow: 0 8px 28px rgba(27,110,191,0.32); transform: translateY(-1px); }

    .btn-ghost { background: transparent; color: #0A1628; font-weight: 600; font-size: 14px; border: 1.5px solid #DDE8F2; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-ghost:hover { border-color: #1B6EBF; background: #EBF4FD; color: #1B6EBF; }

    .pillar-card { background: #FFFFFF; border: 1.5px solid #DDE8F2; border-radius: 12px; padding: 28px; transition: all 0.22s; }
    .pillar-card:hover { border-color: #1B6EBF; box-shadow: 0 14px 44px rgba(27,110,191,0.11); transform: translateY(-4px); }
    .pillar-icon { background: #EBF4FD; color: #1B6EBF; border-radius: 10px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; }
    .pillar-card:hover .pillar-icon { background: #1B6EBF; color: #fff; }

    .window-mock { background: #fff; border: 1.5px solid #DDE8F2; border-radius: 14px; overflow: hidden; box-shadow: 0 24px 80px rgba(10,22,40,0.11); }
    .window-bar { background: #F6FAFE; border-bottom: 1.5px solid #DDE8F2; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; }
    .dot { width: 11px; height: 11px; border-radius: 50%; }

    .bubble-user { background: #0A1628; color: #fff; border-radius: 14px 14px 4px 14px; padding: 12px 16px; font-size: 13.5px; line-height: 1.55; }
    .bubble-ai { background: #F6FAFE; border: 1.5px solid #DDE8F2; border-radius: 4px 14px 14px 14px; padding: 16px 18px; font-size: 13.5px; line-height: 1.6; color: #0A1628; }

    .fu { opacity: 0; transform: translateY(22px); transition: opacity 0.65s ease, transform 0.65s ease; }
    .fu.vis { opacity: 1; transform: translateY(0); }

    .bar { border-radius: 3px 3px 0 0; transition: height 1.3s cubic-bezier(0.34,1.1,0.64,1); }
    .tag { background: #EBF4FD; color: #1B6EBF; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; border-radius: 5px; padding: 4px 9px; }
    .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #1B6EBF; display: block; }
    .sh { font-family: 'Playfair Display', serif; font-weight: 700; color: #0A1628; line-height: 1.18; letter-spacing: -0.02em; }

    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    .cursor { animation: blink 1s step-end infinite; color: #1B6EBF; }
    .dot-grid { background-image: radial-gradient(#C8D9E8 1px, transparent 1px); background-size: 28px 28px; }
  `}</style>
);

/* ─── Data ───────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "FAQ", href: "#faq" },
];

const TRUST_LOGOS = [
  { name: "Meridian Capital", acronym: "MC" },
  { name: "Vortex Labs", acronym: "VL" },
  { name: "Apex Retail", acronym: "AR" },
  { name: "NovaTech", acronym: "NT" },
  { name: "Stratos Group", acronym: "SG" },
  { name: "Helix AI", acronym: "HX" },
];

const PILLARS = [
  { icon: <MessageSquare size={19}/>, title: "Natural Language Queries", desc: "Ask any business question in plain English. DataOmen interprets context and intent, delivering precise answers without SQL.", tag: "Conversational AI" },
  { icon: <TrendingUp size={19}/>, title: "Predictive Forecasting", desc: "Identify revenue trends weeks before they appear in monthly reports. Our engine surfaces forward-looking signals automatically.", tag: "Predictive Analytics" },
  { icon: <FileText size={19}/>, title: "Automated Summaries", desc: "Every dashboard auto-generates a board-ready narrative. Distribute insights without writing a single line yourself.", tag: "Auto-Reporting" },
  { icon: <Plug size={19}/>, title: "One-Click Connectors", desc: "Connect Stripe, PostgreSQL, Shopify, or Excel in under 60 seconds. No engineering involvement required.", tag: "Integrations" },
  { icon: <Bell size={19}/>, title: "Threshold Alerting", desc: "Set KPI thresholds for revenue or churn. DataOmen monitors 24/7 and notifies stakeholders the moment a signal appears.", tag: "Smart Alerts" },
  { icon: <ShieldCheck size={19}/>, title: "Enterprise Security", desc: "SOC 2 Type II certified. Strict data isolation. Infrastructure trusted by global financial institutions.", tag: "Compliance" },
];

const STEPS = [
  { num: "01", icon: <Upload size={20}/>, title: "Connect Your Data", desc: "Upload a spreadsheet or connect a SaaS platform in under 60 seconds." },
  { num: "02", icon: <Search size={20}/>, title: "Ask Anything", desc: "Type any question in plain English. Get structured answers in seconds." },
  { num: "03", icon: <BarChart3 size={20}/>, title: "Act on Evidence", desc: "Replace gut-feel with data-backed confidence to drive growth." },
];

const TESTIMONIALS = [
  { quote: "I used to spend Sunday nights rebuilding Excel models. Now I ask DataOmen and have the answer before my coffee is done.", name: "Sarah Chen", role: "Head of Growth", company: "Meridian Capital", stars: 5 },
  { quote: "We spotted a 23% drop in repeat purchases three weeks before it surfaced in reports. That window saved us six figures.", name: "Marcus Webb", role: "Co-Founder", company: "Apex Retail", stars: 5 },
  { quote: "Strict data isolation was our legal requirement. DataOmen met it without compromise — and onboarded us in one afternoon.", name: "Priya Nair", role: "VP Operations", company: "Stratos Group", stars: 5 },
];

const FAQ_ITEMS = [
  { q: "Do I need to know how to code?", a: "Not at all. If you can write a sentence, you can use the platform — no SQL or developer involvement needed." },
  { q: "How fast is the query engine?", a: "DataOmen processes queries on tables with 50+ million rows in under two seconds — 10× faster than traditional BI tools." },
  { q: "Is our data used for AI training?", a: "Never. Your data is exclusively yours and is never used to train models or shared with third parties." },
];

/* ─── Fixed Custom Hook ──────────────────────────────────────────────────── */
/**
 * REASON FOR FIX: Added explicit generic to useRef and 'as const' to the return 
 * array to ensure TypeScript treats it as a tuple [RefObject, boolean].
 */
function useVisible(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVis(true);
    }, { threshold });
    
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, vis] as const;
}

/* ─── Components ─────────────────────────────────────────────────────────── */

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav className={scrolled ? "nav-scrolled" : ""} style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, transition: "all 0.3s" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 24px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={16} color="#fff" /></div>
          <span className="pfd" style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>Data<span style={{ color: C.blue }}>Omen</span></span>
        </a>
        <div className="nav-btns" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {NAV_ITEMS.map(n => <a key={n.label} href={n.href} className="nav-link">{n.label}</a>)}
        </div>
        <div className="nav-btns" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/login" className="btn-ghost" style={{ padding: "9px 20px" }}>Sign In</a>
          <a href="/register" className="btn-navy" style={{ padding: "9px 20px" }}>Get Started →</a>
        </div>
        <button className="mob-menu-btn" onClick={() => setOpen(!open)} style={{ background: "none", border: "none", color: C.navy }}><Menu size={22} /></button>
      </div>
    </nav>
  );
}

function Hero() {
  const [typed, setTyped] = useState("");
  const query = "What drove revenue growth last quarter?";
  useEffect(() => {
    let i = 0;
    const t = setTimeout(() => {
      const iv = setInterval(() => {
        if (i <= query.length) { setTyped(query.slice(0, i)); i++; }
        else clearInterval(iv);
      }, 52);
    }, 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="dot-grid" style={{ background: C.offWhite, paddingTop: 140, paddingBottom: 100 }}>
      <div className="two-col" style={{ maxWidth: 1160, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <span className="eyebrow" style={{ marginBottom: 24 }}>Enterprise Data Intelligence Platform</span>
          <h1 className="pfd" style={{ fontSize: "clamp(34px, 4vw, 56px)", fontWeight: 700, color: C.navy, lineHeight: 1.1, marginBottom: 22 }}>The analytics layer your organisation has been missing.</h1>
          <p className="pj" style={{ fontSize: 16.5, lineHeight: 1.7, color: C.muted, marginBottom: 36, maxWidth: 460 }}>Ask any question about your business in plain English and receive a precise, structured answer in seconds.</p>
          <div style={{ display: "flex", gap: 12 }}><a href="/register" className="btn-blue" style={{ padding: "13px 28px" }}>Start Free Trial</a><a href="#demo" className="btn-ghost" style={{ padding: "13px 28px" }}>Watch Demo</a></div>
        </div>
        <div className="window-mock">
          <div className="window-bar"><div style={{ display: "flex", gap: 6 }}>{["#F47171","#F0B955","#5AC878"].map(c => <div key={c} className="dot" style={{ background: c }} />)}</div></div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><div className="bubble-user">{typed}<span className="cursor">|</span></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductDemo() {
  const [ref, vis] = useVisible(0.2);
  const bars = [55,70,45,90,65,80,75,95,60,85,72,100];

  return (
    <section ref={ref} id="demo" style={{ padding: "100px 24px" }}>
      <div className={`fu ${vis ? "vis" : ""}`} style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <h2 className="sh" style={{ fontSize: 42, marginBottom: 20 }}>One question. One definitive answer.</h2>
        <div className="window-mock" style={{ marginTop: 40, textAlign: "left" }}>
            <div className="window-bar" />
            <div style={{ padding: 30 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
                    {bars.map((h, i) => <div key={i} className="bar" style={{ flex: 1, background: C.blue, height: vis ? `${h}%` : "0%" }} />)}
                </div>
            </div>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <section style={{ padding: "100px 24px", background: "#fff" }} id="faq">
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h2 className="sh" style={{ fontSize: 36, marginBottom: 40, textAlign: "center" }}>Common questions.</h2>
        <div style={{ border: `1.5px solid ${C.rule}`, borderRadius: 12 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="faq-row">
              <button className="faq-btn" onClick={() => setOpenIdx(i)}>
                <span className="pj" style={{ fontWeight: 600 }}>{item.q}</span>
                <ChevronDown size={16} />
              </button>
              {openIdx === i && <div style={{ padding: "0 28px 22px", color: C.muted }}>{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: "40px 24px", borderTop: `1.5px solid ${C.rule}`, textAlign: "center" }}>
      <span className="pfd" style={{ fontWeight: 700 }}>DataOmen</span>
      <p style={{ marginTop: 10, color: C.faint, fontSize: 12 }}>© {new Date().getFullYear()} DataOmen, Inc. All rights reserved.</p>
    </footer>
  );
}

export default function Page() {
  return (
    <div>
      <Styles />
      <Navbar />
      <Hero />
      <ProductDemo />
      <FAQ />
      <Footer />
    </div>
  );
}