// app/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare, TrendingUp, FileText, Plug, Bell, ShieldCheck,
  Upload, Search, BarChart3, ChevronDown, ArrowRight, Check,
  Star, Menu, X, Database, Activity, Zap, Lock, ExternalLink,
  Cpu, Layers, Shield, Globe, Share2, Code2, Terminal, BarChart,
  LineChart, Sparkles
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

    .feature-item { display: flex; gap: 16px; margin-bottom: 32px; }
    .feature-icon-wrapper { width: 48px; height: 48px; border-radius: 12px; background: ${C.bluePale}; color: ${C.blue}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

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
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Database size={18} color="#fff" />
          </div>
          <span className="pfd" style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>Data<span style={{ color: C.blue }}>Omen</span></span>
        </div>
        <div className="hide-mobile" style={{ display: "flex", gap: 32 }}>
          {["Features", "Integrations", "Security", "FAQ"].map(n => (
            <a key={n} href={`#${n.toLowerCase()}`} style={{ textDecoration: "none", color: C.muted, fontWeight: 600, fontSize: 14, transition: "color 0.2s" }} className="hover-text-navy">
              {n}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/login" className="btn-ghost hide-mobile" style={{ padding: "10px 20px" }}>Log In</a>
          <a href="/register" className="btn-navy" style={{ padding: "10px 24px" }}>Start Free Trial</a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const [ref, vis] = useVisible(0.1);
  return (
    <section className="dot-grid" style={{ paddingTop: 180, paddingBottom: 100, background: C.offWhite }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }} className={`fu ${vis ? "vis" : ""}`} ref={ref}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.bluePale, padding: "6px 14px", borderRadius: 20, marginBottom: 24 }}>
            <Sparkles size={14} color={C.blue} />
            <span className="jbm" style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>DATAOMEN INTELLIGENCE PLATFORM</span>
          </div>
          <h1 className="pfd" style={{ fontSize: "clamp(48px, 7vw, 84px)", color: C.navy, lineHeight: 0.95, marginBottom: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>
            Talk to your data.<br/><span style={{ color: C.blue }}>Get answers instantly.</span>
          </h1>
          <p style={{ fontSize: 21, color: C.muted, lineHeight: 1.6, marginBottom: 48, maxWidth: 720, margin: "0 auto 48px" }}>
            The analytics platform that turns complex databases into clear, actionable insights. Ask questions in plain English, and let our engine do the rest. No SQL required.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/register" className="btn-blue" style={{ padding: "18px 44px", fontSize: 16 }}>Start Your Free Trial <ArrowRight size={18} /></a>
            <a href="#features" className="btn-ghost" style={{ padding: "18px 44px", fontSize: 16 }}>See How It Works</a>
          </div>
        </div>
        
        {/* User-Centric Product Mockup */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "200ms", maxWidth: 1000, margin: "0 auto", background: "#fff", border: `1.5px solid ${C.rule}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 100px rgba(10,22,40,0.12)" }}>
           <div style={{ height: 44, background: C.offWhite, borderBottom: `1.5px solid ${C.rule}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 8 }}>
             {[1,2,3].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: C.ruleDark }} />)}
             <div style={{ flex: 1, height: 24, background: "#fff", borderRadius: 4, border: `1px solid ${C.rule}`, marginLeft: 20, display: "flex", alignItems: "center", padding: "0 12px" }}>
                <Search size={12} color={C.faint} style={{ marginRight: 8 }} />
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>"What was our Monthly Recurring Revenue growth across Europe in Q3?"</span>
             </div>
           </div>
           <div style={{ padding: 40 }}>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 32 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Database size={18} color="#fff" />
                </div>
                <div>
                  <h4 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>European MRR grew by 24.2% in Q3.</h4>
                  <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>
                    Growth was primarily driven by the Enterprise segment in Germany and the UK. Here is the week-over-week breakdown.
                  </p>
                </div>
              </div>
              
              <div style={{ background: C.offWhite, borderRadius: 12, padding: 32, border: `1px solid ${C.rule}` }}>
                 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32, alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 13, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Q3 MRR Trajectory</span>
                      <div style={{ fontSize: 28, fontWeight: 800, color: C.navy, marginTop: 4 }}>$842,500</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10B981", background: "#D1FAE5", padding: "6px 12px", borderRadius: 20, fontWeight: 700, fontSize: 13 }}>
                      <TrendingUp size={14} /> +24.2%
                    </div>
                 </div>
                 {/* Abstract Chart visualization */}
                 <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160 }}>
                    {[40, 45, 42, 55, 60, 58, 70, 75, 85, 82, 95, 100].map((h, i) => (
                      <div key={i} className="group" style={{ flex: 1, position: "relative" }}>
                        <div style={{ width: "100%", height: `${h}%`, background: i > 8 ? C.blue : C.blueLight, borderRadius: "6px 6px 0 0", opacity: i > 8 ? 1 : 0.6, transition: "all 0.2s" }} />
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

function Benefits() {
  const [ref, vis] = useVisible(0.1);
  return (
    <section ref={ref} id="features" style={{ padding: "120px 24px", background: "#fff" }}>
      <div className="grid-2" style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 100, alignItems: "center" }}>
        
        <div className={`fu ${vis ? "vis" : ""}`} style={{ order: 2 }}>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 40, lineHeight: 1.1 }}>
            Insights that drive action, <br/>not confusion.
          </h2>
          
          <div className="feature-item">
            <div className="feature-icon-wrapper"><MessageSquare size={24} /></div>
            <div>
              <h4 style={{ fontSize: 19, marginBottom: 8, fontWeight: 700 }}>Natural Language Search</h4>
              <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>Stop waiting on data teams. Ask questions the way you naturally speak and get accurate, presentation-ready charts instantly.</p>
            </div>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon-wrapper"><Activity size={24} /></div>
            <div>
              <h4 style={{ fontSize: 19, marginBottom: 8, fontWeight: 700 }}>Automated Anomaly Alerts</h4>
              <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>Our engine constantly monitors your connected data streams to notify you the moment a critical metric spikes or drops unexpectedly.</p>
            </div>
          </div>
          
          <div className="feature-item" style={{ marginBottom: 0 }}>
            <div className="feature-icon-wrapper"><ShieldCheck size={24} /></div>
            <div>
              <h4 style={{ fontSize: 19, marginBottom: 8, fontWeight: 700 }}>Bank-Grade Data Security</h4>
              <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>Your data is isolated and encrypted. We maintain strict access controls so your proprietary information never leaks across boundaries.</p>
            </div>
          </div>
        </div>

        <div className={`fu ${vis ? "vis" : ""}`} style={{ order: 1, position: "relative" }}>
          <div style={{ background: C.offWhite, border: `1.5px solid ${C.rule}`, borderRadius: 24, padding: 40, position: "relative", zIndex: 2 }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: C.navy }}>Live Monitoring</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { title: "Conversion Rate Drop", desc: "Checkout conversion fell by 4.2% in the last 2 hours.", status: "critical" },
                { title: "Unusual Traffic Spike", desc: "Organic traffic from Canada is up 300% today.", status: "positive" },
              ].map((alert, i) => (
                <div key={i} style={{ padding: "20px", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, display: "flex", gap: 16 }}>
                  <div style={{ marginTop: 2 }}>
                    {alert.status === "critical" ? <Bell size={18} color="#EF4444" /> : <TrendingUp size={18} color="#10B981" />}
                  </div>
                  <div>
                    <h5 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: C.navy }}>{alert.title}</h5>
                    <p style={{ fontSize: 14, color: C.muted }}>{alert.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Decorative background element */}
          <div style={{ position: "absolute", top: -20, left: -20, right: 20, bottom: 20, background: C.blueTint, borderRadius: 24, zIndex: 1 }} />
        </div>

      </div>
    </section>
  );
}

function Integrations() {
  const [ref, vis] = useVisible(0.1);
  const connectors = [
    { name: "Stripe", desc: "Revenue & Subscriptions", icon: <CreditCard size={24}/> },
    { name: "PostgreSQL", desc: "Your Core Database", icon: <Database size={24}/> },
    { name: "Shopify", desc: "E-commerce Metrics", icon: <Share2 size={24}/> },
    { name: "AWS S3", desc: "Raw Data Lakes", icon: <Globe size={24}/> },
  ];

  return (
    <section ref={ref} id="integrations" style={{ padding: "100px 24px", background: C.navy }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
        <h2 className="pfd" style={{ color: "#fff", fontSize: 42, marginBottom: 24 }}>Plug and play with your stack.</h2>
        <p style={{ color: C.faint, fontSize: 18, marginBottom: 60, maxWidth: 600, margin: "0 auto 60px" }}>
          Connect your existing tools securely in seconds. DataOmen automatically maps your data so you can start asking questions immediately.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
          {connectors.map((c, i) => (
            <div key={i} className={`fu ${vis ? "vis" : ""}`} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", padding: "32px 24px", borderRadius: 16, transitionDelay: `${i * 100}ms`, textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(59, 154, 232, 0.15)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: C.blueLight, margin: "0 auto 20px" }}>
                {c.icon}
              </div>
              <h4 style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{c.name}</h4>
              <p style={{ color: C.faint, fontSize: 14 }}>{c.desc}</p>
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
    { q: "Do I or my team need to know SQL?", a: "Not at all. DataOmen is designed for business users. You ask questions in plain English, and our AI securely generates the exact analytical queries behind the scenes to deliver your answers." },
    { q: "Is my proprietary data secure?", a: "Yes. We operate with strict multi-tenant isolation. Your data is encrypted at rest and in transit, and our AI models only process necessary schema metadata, never your raw sensitive customer data." },
    { q: "How long does setup take?", a: "Usually less than 5 minutes. You securely authenticate your data sources (like Stripe or a read-only Postgres replica), and DataOmen maps the relationships automatically." },
    { q: "Can I embed these charts in my own dashboard?", a: "Yes, DataOmen provides secure share links and a robust API allowing you to surface these insights directly within your own internal tools or customer-facing portals." }
  ];

  return (
    <section id="faq" style={{ padding: "120px 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: 36, textAlign: "center", marginBottom: 64 }}>Frequently Asked Questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item, i) => (
            <div key={i} style={{ border: `1.5px solid ${open === i ? C.blueLight : C.rule}`, borderRadius: 16, overflow: "hidden", transition: "all 0.2s" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", padding: "28px", display: "flex", justifyContent: "space-between", alignItems: "center", background: open === i ? C.bluePale : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontWeight: 700, color: C.navy, fontSize: 16 }}>{item.q}</span>
                <ChevronDown style={{ transform: open === i ? "rotate(180deg)" : "none", transition: "0.2s", color: open === i ? C.blue : C.navy }} />
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
      <Benefits />
      <Integrations />
      <FAQ />
      
      {/* Conversion Anchor */}
      <section style={{ padding: "120px 24px", background: C.blue, textAlign: "center", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 }} className="dot-grid" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 className="pfd" style={{ fontSize: 56, marginBottom: 24, lineHeight: 1.1 }}>Stop guessing. <br/>Start knowing.</h2>
          <p style={{ fontSize: 20, marginBottom: 48, opacity: 0.9, maxWidth: 600, margin: "0 auto 48px" }}>Connect your first source and ask your first question in under 5 minutes. No credit card required.</p>
          <a href="/register" style={{ background: "#fff", color: C.blue, padding: "20px 52px", borderRadius: 12, fontWeight: 800, textDecoration: "none", fontSize: 18, display: "inline-block", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", transition: "transform 0.2s" }} className="hover-scale">
            Start Free Trial
          </a>
        </div>
      </section>

      <footer style={{ padding: "80px 24px", borderTop: `1px solid ${C.rule}`, textAlign: "center" }}>
        <div style={{ marginBottom: 40, display: "flex", justifyContent: "center", gap: 32 }}>
          {["Pricing", "Documentation", "Security", "Terms of Service"].map(l => (
            <a key={l} href="#" style={{ color: C.muted, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>{l}</a>
          ))}
        </div>
        <p style={{ fontSize: 13, color: C.faint }}>© 2026 DataOmen Inc. | SOC2 Type II Certified</p>
      </footer>
    </main>
  );
}