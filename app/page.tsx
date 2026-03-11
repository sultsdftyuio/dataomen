"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare, TrendingUp, Bell, ShieldCheck, Search, ArrowRight,
  Database, Activity, Lock, Globe, Share2, Sparkles, Server, CheckCircle2,
  Bot, Briefcase, Zap, LineChart, PieChart, Shield, LayoutDashboard, Command,
  BrainCircuit, Workflow, GitMerge
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
  green:     "#10B981",
  greenPale: "#D1FAE5",
  red:       "#EF4444",
  redPale:   "#FEE2E2",
};

/* ─── Global Styles & Animations ─────────────────────────────────────────── */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; color: ${C.navy}; overflow-x: hidden; -webkit-font-smoothing: antialiased; }

    .pfd { font-family: 'Playfair Display', serif; }
    .jbm { font-family: 'JetBrains Mono', monospace; }

    .nav-scrolled { background: rgba(255,255,255,0.8) !important; backdrop-filter: blur(12px); border-bottom: 1px solid ${C.rule} !important; }

    /* Buttons */
    .btn-navy { background: ${C.navy}; color: #fff; font-weight: 700; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-navy:hover { background: ${C.navyMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(10,22,40,0.1); }

    .btn-blue { background: ${C.blue}; color: #fff; font-weight: 700; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; transition: all 0.2s; white-space: nowrap; }
    .btn-blue:hover { background: ${C.blueMid}; transform: translateY(-1px); box-shadow: 0 10px 20px rgba(27,110,191,0.25); }

    .btn-ghost { background: transparent; color: ${C.navy}; font-weight: 600; font-size: 15px; border: 1.5px solid ${C.ruleDark}; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; transition: all 0.2s; }
    .btn-ghost:hover { border-color: ${C.blue}; background: ${C.bluePale}; color: ${C.blue}; }

    /* Scroll Reveal */
    .fu { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
    .fu.vis { opacity: 1; transform: translateY(0); }

    /* Backgrounds */
    .dot-grid { background-image: radial-gradient(${C.ruleDark} 1px, transparent 1px); background-size: 24px 24px; }
    .blueprint-grid { background-image: linear-gradient(${C.rule} 1px, transparent 1px), linear-gradient(90deg, ${C.rule} 1px, transparent 1px); background-size: 40px 40px; }
    .dark-grid { background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 40px 40px; }

    /* Animations */
    @keyframes float1 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes float2 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(12px); } }
    @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(27,110,191,0.4); } 50% { box-shadow: 0 0 0 8px rgba(27,110,191,0); } }
    @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(400%); } }

    .anim-float-1 { animation: float1 6s ease-in-out infinite; }
    .anim-float-2 { animation: float2 7s ease-in-out infinite reverse; }
    .pulse-indicator { width: 8px; height: 8px; border-radius: 50%; background: ${C.blue}; animation: pulse-glow 2s infinite; }

    /* Layout Grids */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
    .agent-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
    .bento-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
    
    @media (max-width: 992px) { 
      .grid-2, .bento-grid { grid-template-columns: 1fr; gap: 40px; } 
      .hide-mobile { display: none !important; }
      .hero-text { font-size: clamp(40px, 8vw, 56px) !important; }
      .pipeline-line { display: none; }
    }
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Database size={18} color="#fff" />
          </div>
          <span className="pfd" style={{ fontSize: 24, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em" }}>Data<span style={{ color: C.blue }}>Omen</span></span>
        </div>
        <div className="hide-mobile" style={{ display: "flex", gap: 36 }}>
          {["Platform", "Agents", "Integrations", "Security"].map(n => (
            <a key={n} href={`#${n.toLowerCase()}`} style={{ textDecoration: "none", color: C.muted, fontWeight: 600, fontSize: 15, transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = C.navy} onMouseOut={(e) => e.currentTarget.style.color = C.muted}>
              {n}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="/login" className="btn-ghost hide-mobile" style={{ padding: "10px 24px" }}>Log In</a>
          <a href="/register" className="btn-navy" style={{ padding: "10px 24px" }}>Start Free Trial</a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const [ref, vis] = useVisible(0.1);
  return (
    <section className="dot-grid" style={{ paddingTop: 180, paddingBottom: 60, background: C.offWhite, position: "relative", overflow: "hidden" }}>
      {/* Background Decorative Elements */}
      <div style={{ position: "absolute", top: "10%", left: "5%", width: 400, height: 400, background: C.bluePale, borderRadius: "50%", filter: "blur(100px)", opacity: 0.6, zIndex: 0 }} />
      <div style={{ position: "absolute", top: "30%", right: "-5%", width: 500, height: 500, background: C.blueTint, borderRadius: "50%", filter: "blur(120px)", opacity: 0.8, zIndex: 0 }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 60 }} className={`fu ${vis ? "vis" : ""}`} ref={ref}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.ruleDark}`, padding: "6px 16px", borderRadius: 30, marginBottom: 32, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            <Sparkles size={14} color={C.blue} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Meet the Autonomous Data Platform</span>
          </div>
          <h1 className="pfd hero-text" style={{ fontSize: 76, color: C.navy, lineHeight: 1.05, marginBottom: 28, fontWeight: 800, letterSpacing: "-0.04em", maxWidth: 900, margin: "0 auto 28px" }}>
            Talk to your data.<br/><span style={{ color: C.blue }}>Get answers instantly.</span>
          </h1>
          <p style={{ fontSize: 21, color: C.muted, lineHeight: 1.6, marginBottom: 48, maxWidth: 700, margin: "0 auto 48px" }}>
            The analytics platform that turns complex databases into clear, actionable insights. Ask questions in plain English, deploy AI agents, and never write SQL again.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/register" className="btn-blue" style={{ padding: "18px 44px", fontSize: 16 }}>Start Free Trial <ArrowRight size={18} /></a>
            <a href="#platform" className="btn-ghost" style={{ padding: "18px 44px", fontSize: 16, background: "#fff" }}>See How It Works</a>
          </div>
        </div>
        
        {/* User-Centric Product Mockup with Floating Badges */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "200ms", maxWidth: 1000, margin: "0 auto", position: "relative" }}>
            
           {/* Floating Badge 1 */}
           <div className="anim-float-1 hide-mobile" style={{ position: "absolute", top: -20, left: -40, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 20px 40px rgba(10,22,40,0.08)", zIndex: 10 }}>
              <div style={{ width: 32, height: 32, background: C.greenPale, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={16} color={C.green} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Stripe Synced</div>
                <div style={{ fontSize: 11, color: C.muted }}>2.4M rows processed</div>
              </div>
           </div>

           {/* Floating Badge 2 */}
           <div className="anim-float-2 hide-mobile" style={{ position: "absolute", bottom: 60, right: -50, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 20px 40px rgba(10,22,40,0.08)", zIndex: 10 }}>
              <div style={{ width: 32, height: 32, background: C.bluePale, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bot size={16} color={C.blue} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Growth Agent Active</div>
                <div style={{ fontSize: 11, color: C.muted }}>Monitoring CAC/LTV</div>
              </div>
           </div>

           {/* Main App Window */}
           <div style={{ background: "#fff", border: `1.5px solid ${C.ruleDark}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 100px rgba(10,22,40,0.12)" }}>
             <div style={{ height: 48, background: C.offWhite, borderBottom: `1.5px solid ${C.rule}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 8 }}>
               {[1,2,3].map(i => <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: C.ruleDark }} />)}
               <div style={{ flex: 1, height: 28, background: "#fff", borderRadius: 6, border: `1px solid ${C.rule}`, marginLeft: 24, display: "flex", alignItems: "center", padding: "0 12px" }}>
                  <Search size={14} color={C.faint} style={{ marginRight: 8 }} />
                  <span style={{ fontSize: 13, color: C.navy, fontWeight: 500 }}>What was our Monthly Recurring Revenue growth across Europe in Q3?</span>
               </div>
             </div>
             <div style={{ padding: "40px 50px" }}>
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 32 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Sparkles size={20} color="#fff" />
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <h4 style={{ fontSize: 19, fontWeight: 700, color: C.navy, marginBottom: 8 }}>European MRR grew by 24.2% in Q3.</h4>
                    <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>
                      Growth was primarily driven by the Enterprise segment in Germany and the UK. Here is the trajectory breakdown.
                    </p>
                  </div>
                </div>
                
                <div style={{ background: C.offWhite, borderRadius: 16, padding: 32, border: `1px solid ${C.rule}` }}>
                   <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 40, alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 13, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Q3 MRR Trajectory</span>
                        <div style={{ fontSize: 32, fontWeight: 800, color: C.navy, marginTop: 4 }}>$842,500</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.green, background: C.greenPale, padding: "8px 16px", borderRadius: 20, fontWeight: 700, fontSize: 14 }}>
                        <TrendingUp size={16} /> +24.2%
                      </div>
                   </div>
                   {/* Animated Chart visualization */}
                   <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 180 }}>
                      {[40, 45, 42, 55, 60, 58, 70, 75, 85, 82, 95, 100].map((h, i) => (
                        <div key={i} className="group" style={{ flex: 1, position: "relative", height: "100%", display: "flex", alignItems: "flex-end" }}>
                          <div style={{ width: "100%", height: `${h}%`, background: i > 8 ? C.blue : C.blueLight, borderRadius: "6px 6px 0 0", opacity: i > 8 ? 1 : 0.6, transition: "all 0.3s" }} />
                        </div>
                      ))}
                   </div>
                </div>
             </div>
           </div>
        </div>
      </div>

      {/* Trust Anchor */}
      <div style={{ maxWidth: 1000, margin: "80px auto 0", textAlign: "center", borderTop: `1px solid ${C.rule}`, paddingTop: 40 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 24 }}>Trusted by innovative data teams</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap", opacity: 0.5, filter: "grayscale(100%)" }}>
          {["Acme Corp", "GlobalTech", "Nexus", "Quantum", "Vertex"].map((logo, i) => (
            <span key={i} className="pfd" style={{ fontSize: 24, fontWeight: 800 }}>{logo}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function DeepDiveFeatures() {
  const [ref1, vis1] = useVisible(0.1);
  const [ref2, vis2] = useVisible(0.1);

  return (
    <section id="platform" style={{ padding: "140px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        
        {/* Segment A: Speed & Natural Language */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1}>
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Zap size={18} /> THE ENGINE
            </div>
            <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Stop waiting on data tickets. <br/>Ask it yourself.
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              DataOmen's semantic routing engine understands your business context. It translates plain English into perfectly optimized analytical queries in milliseconds, rendering presentation-ready charts instantly.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {["No SQL or Python required", "Understands your unique schema", "Exports directly to PDF/CSV"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={20} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, background: C.offWhite, padding: 40, borderRadius: 24, border: `1px solid ${C.rule}`, position: "relative" }}>
             <div className="jbm" style={{ background: "#1E1E1E", color: "#D4D4D4", padding: 20, borderRadius: 12, fontSize: 13, marginBottom: -20, position: "relative", zIndex: 2, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
                <span style={{ color: "#569CD6" }}>SELECT</span> date_trunc(<span style={{ color: "#CE9178" }}>'month'</span>, created_at), <br/>
                <span style={{ color: "#569CD6" }}>SUM</span>(amount) <span style={{ color: "#569CD6" }}>AS</span> total_revenue <br/>
                <span style={{ color: "#569CD6" }}>FROM</span> core_transactions <br/>
                <span style={{ color: "#569CD6" }}>WHERE</span> status = <span style={{ color: "#CE9178" }}>'captured'</span> <br/>
                <span style={{ color: "#569CD6" }}>GROUP BY</span> 1 <span style={{ color: "#569CD6" }}>ORDER BY</span> 1 <span style={{ color: "#569CD6" }}>DESC</span>;
             </div>
             <div style={{ background: "#fff", padding: "40px 24px 24px", borderRadius: 12, border: `1px solid ${C.rule}`, position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 120 }}>
                  {[20, 35, 30, 60, 80, 90, 100].map((h, i) => (
                    <div key={i} style={{ flex: 1, background: C.blueLight, height: `${h}%`, borderRadius: "4px 4px 0 0" }} />
                  ))}
                </div>
             </div>
          </div>
        </div>

        {/* Segment B: Proactive Alerts */}
        <div className="grid-2" ref={ref2}>
          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.red, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Activity size={18} /> PROACTIVE MONITORING
            </div>
            <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Know before your customers do.
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Don't just stare at dashboards. Our statistical engine continuously watches your connected streams. If conversion rates drop or API errors spike, DataOmen alerts you immediately with the root cause.
            </p>
            <a href="#agents" className="btn-ghost" style={{ padding: "14px 28px" }}>Explore Monitoring Agents</a>
          </div>
          
          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 24, padding: 40, position: "relative", zIndex: 2, color: "#fff", boxShadow: "0 30px 60px rgba(10,22,40,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
                <div className="pulse-indicator" style={{ background: C.red }} />
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.05em" }}>LIVE SYSTEM LOG</span>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.redPale }}>
                      <Bell size={16} color={C.red} /> <span style={{ fontWeight: 600 }}>Anomaly Detected</span>
                    </div>
                    <span style={{ fontSize: 12, color: C.faint }}>Just now</span>
                  </div>
                  <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Checkout Conversion Drop</h5>
                  <p style={{ fontSize: 14, color: C.faint, lineHeight: 1.5 }}>EMEA region conversion fell by 4.2% in the last hour. Correlated with a spike in Payment Gateway latency.</p>
                </div>
                
                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 20, opacity: 0.6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.greenPale, marginBottom: 8 }}>
                    <CheckCircle2 size={16} color={C.green} /> <span style={{ fontWeight: 600 }}>Sync Complete</span>
                  </div>
                  <h5 style={{ fontSize: 15, fontWeight: 700 }}>PostgreSQL Replica Synced</h5>
                </div>
              </div>
            </div>
            {/* Background Blob */}
            <div style={{ position: "absolute", top: -20, left: -20, right: 20, bottom: 20, background: C.blue, borderRadius: 24, zIndex: 1, opacity: 0.1 }} />
          </div>
        </div>

      </div>
    </section>
  );
}

function AIAgents() {
  const [ref, vis] = useVisible(0.1);
  
  const pipelineSteps = [
    {
      id: "01",
      name: "Math Perception",
      role: "Anomaly Detector",
      icon: <Activity size={20} color={C.blueLight} />,
      desc: "Fast, vectorized algorithms constantly monitor data streams to flag statistical deviations in milliseconds."
    },
    {
      id: "02",
      name: "Stateful Memory",
      role: "Context Engine",
      icon: <Database size={20} color={C.blueLight} />,
      desc: "Retrieves historical logs to determine if this is a brand new trend or the continuation of an ongoing issue."
    },
    {
      id: "03",
      name: "Deep Diagnostics",
      role: "RAG Analyst",
      icon: <Search size={20} color={C.blueLight} />,
      desc: "Autonomously writes DuckDB SQL to drill into your schema and locate the exact business dimension driving the change."
    },
    {
      id: "04",
      name: "ML Forecasting",
      role: "Predictive Modeler",
      icon: <LineChart size={20} color={C.blueLight} />,
      desc: "Applies linear regression and EMA smoothing to project how the metric will behave over the next 7 days."
    },
    {
      id: "05",
      name: "Actionable Alert",
      role: "Supervisor Agent",
      icon: <Bell size={20} color={C.blueLight} />,
      desc: "Synthesizes the entire investigation into a clean, executive-level Slack or webhook alert with a deep-link dashboard."
    }
  ];

  return (
    <section id="agents" className="blueprint-grid" style={{ padding: "140px 24px", background: C.navy, position: "relative", borderTop: `1px solid ${C.navyMid}`, borderBottom: `1px solid ${C.navyMid}` }}>
      
      {/* Decorative Glows */}
      <div style={{ position: "absolute", top: "0", left: "20%", width: 600, height: 600, background: C.blue, borderRadius: "50%", filter: "blur(180px)", opacity: 0.15, pointerEvents: "none" }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 80 }} ref={ref} className={`fu ${vis ? "vis" : ""}`}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(59, 154, 232, 0.15)", padding: "6px 16px", borderRadius: 30, marginBottom: 24, color: C.blueLight, border: "1px solid rgba(59, 154, 232, 0.3)" }}>
            <Workflow size={16} /> <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>THE SUPERVISOR ARCHITECTURE</span>
          </div>
          <h2 className="pfd" style={{ fontSize: 48, color: "#fff", marginBottom: 24, lineHeight: 1.1 }}>
            Don't just query your data.<br/>Hire an AI team to watch it.
          </h2>
          <p style={{ color: C.faint, fontSize: 18, maxWidth: 650, margin: "0 auto", lineHeight: 1.6 }}>
            Unlike standard dashboards that require you to actively look for problems, DataOmen utilizes a multi-agent orchestration pattern to proactively detect, diagnose, and predict business outcomes.
          </p>
        </div>

        {/* The Multi-Agent Pipeline Visualization */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "150ms" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
            
            {/* The Connecting Line */}
            <div className="pipeline-line" style={{ position: "absolute", left: "28px", top: "40px", bottom: "40px", width: "2px", background: "linear-gradient(to bottom, rgba(59, 154, 232, 0.5), rgba(59, 154, 232, 0.1))", zIndex: 0 }}></div>

            {pipelineSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 32, position: "relative", zIndex: 1 }}>
                
                {/* Number Node */}
                <div className="hide-mobile" style={{ width: 56, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.navyMid, border: `2px solid ${C.blueSoft || 'rgba(59, 154, 232, 0.4)'}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18, boxShadow: "0 0 20px rgba(59, 154, 232, 0.2)" }}>
                    {step.id}
                  </div>
                </div>

                {/* Content Card */}
                <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 32, transition: "transform 0.2s, background 0.2s", cursor: "default" }} className="hover:bg-white/5 hover:-translate-y-1">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(59, 154, 232, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {step.icon}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <h3 style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{step.name}</h3>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.blueLight, background: "rgba(59, 154, 232, 0.1)", padding: "4px 10px", borderRadius: 20 }}>
                          {step.role}
                        </span>
                      </div>
                      <p style={{ color: C.faint, fontSize: 16, lineHeight: 1.6 }}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IntegrationsAndSecurity() {
  const [ref, vis] = useVisible(0.1);
  return (
    <section id="integrations" style={{ padding: "140px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }} ref={ref}>
        
        {/* Integrations Header */}
        <div style={{ textAlign: "center", marginBottom: 80 }} className={`fu ${vis ? "vis" : ""}`}>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24 }}>Connect your entire stack in 3 clicks.</h2>
          <p style={{ color: C.muted, fontSize: 18, maxWidth: 600, margin: "0 auto" }}>Zero ETL pipelines required. Authenticate securely and our engine automatically maps your schema.</p>
        </div>

        {/* Pipeline Visual */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 24, marginBottom: 120 }}>
          {["Stripe", "PostgreSQL", "Snowflake", "Shopify", "Salesforce"].map((name, i) => (
             <React.Fragment key={i}>
                <div style={{ padding: "16px 24px", background: "#fff", border: `1.5px solid ${C.ruleDark}`, borderRadius: 12, fontWeight: 700, color: C.navy, boxShadow: "0 10px 20px rgba(0,0,0,0.03)" }}>
                  {name}
                </div>
                {i !== 4 && <ArrowRight size={24} color={C.ruleDark} className="hide-mobile" />}
             </React.Fragment>
          ))}
        </div>

        {/* Security Bento */}
        <div id="security" className="bento-grid">
          <div className={`fu ${vis ? "vis" : ""}`} style={{ background: C.navy, borderRadius: 24, padding: 48, color: "#fff", position: "relative", overflow: "hidden" }}>
             <Shield size={48} color={C.blueLight} style={{ marginBottom: 24 }} />
             <h3 className="pfd" style={{ fontSize: 32, marginBottom: 16 }}>Bank-Grade Security</h3>
             <p style={{ color: C.faint, fontSize: 16, lineHeight: 1.6, maxWidth: 400 }}>
               Your data is isolated and encrypted. DataOmen connects via read-only credentials, and our AI models only process metadata—never your raw sensitive customer data.
             </p>
             <div style={{ position: "absolute", right: -20, bottom: -20, opacity: 0.1 }}>
               <Shield size={200} />
             </div>
          </div>
          <div className={`fu ${vis ? "vis" : ""}`} style={{ background: C.offWhite, borderRadius: 24, padding: 48, border: `1px solid ${C.rule}` }}>
             <Lock size={40} color={C.navy} style={{ marginBottom: 24 }} />
             <h3 className="pfd" style={{ fontSize: 24, color: C.navy, marginBottom: 12 }}>Compliance First</h3>
             <ul style={{ listStyle: "none", padding: 0, color: C.muted, fontSize: 15, display: "flex", flexDirection: "column", gap: 12 }}>
               <li style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle2 size={16} color={C.blue}/> SOC2 Type II Certified</li>
               <li style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle2 size={16} color={C.blue}/> GDPR Compliant</li>
               <li style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle2 size={16} color={C.blue}/> Zero Data Retention</li>
             </ul>
          </div>
        </div>

      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const items = [
    { q: "What if my database schema is messy or undocumented?", a: "DataOmen's semantic layer is designed for the real world. During setup, it scans your schema and allows you to add plain-English descriptions to tables or columns. It learns your business logic quickly." },
    { q: "Do you train your AI on my proprietary data?", a: "Absolutely not. We use enterprise-grade LLM endpoints with zero-data-retention policies. Furthermore, only structural metadata (like column names) is sent to the LLM to generate the SQL query. Your actual row data stays in your infrastructure." },
    { q: "How long does setup really take?", a: "Usually less than 5 minutes. You securely authenticate your data sources (like Stripe or a read-only Postgres replica), DataOmen maps the relationships, and you can start asking questions immediately." },
    { q: "How does the pricing scale?", a: "Pricing is based on compute (queries run) rather than per-seat licenses. This means you can invite your entire organization to use DataOmen without paying arbitrary license fees per user." }
  ];

  return (
    <section style={{ padding: "100px 24px", background: C.offWhite, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: 36, textAlign: "center", marginBottom: 64, color: C.navy }}>Frequently Asked Questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item, i) => (
            <div key={i} style={{ border: `1px solid ${open === i ? C.blueLight : C.ruleDark}`, borderRadius: 16, overflow: "hidden", transition: "all 0.2s", background: "#fff" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", padding: "28px", display: "flex", justifyContent: "space-between", alignItems: "center", background: open === i ? C.bluePale : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontWeight: 700, color: C.navy, fontSize: 16 }}>{item.q}</span>
                <span style={{ color: open === i ? C.blue : C.navy, fontSize: 24, fontWeight: 300 }}>{open === i ? "−" : "+"}</span>
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

/* ─── Main Execution ─────────────────────────────────────────────────────── */
export default function Page() {
  return (
    <main>
      <Styles />
      <Navbar />
      <Hero />
      <DeepDiveFeatures />
      <AIAgents />
      <IntegrationsAndSecurity />
      <FAQ />
      
      {/* Conversion Anchor */}
      <section style={{ padding: "120px 24px", background: C.blue, textAlign: "center", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 }} className="dark-grid" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 className="pfd" style={{ fontSize: 56, marginBottom: 24, lineHeight: 1.1 }}>Stop guessing. <br/>Start knowing.</h2>
          <p style={{ fontSize: 20, marginBottom: 48, opacity: 0.9, maxWidth: 600, margin: "0 auto" }}>
            Connect your first source and deploy your first AI agent in under 5 minutes.
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            <a href="/register" style={{ background: "#fff", color: C.blue, padding: "20px 52px", borderRadius: 12, fontWeight: 800, textDecoration: "none", fontSize: 18, display: "inline-block", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", transition: "transform 0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.02)"} onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}>
              Start Free Trial
            </a>
            
            <div style={{ display: "flex", gap: 24, fontSize: 14, fontWeight: 600, opacity: 0.9, flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={16} /> 14-day free trial</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={16} /> No credit card required</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={16} /> Setup in 5 minutes</span>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ padding: "80px 24px", borderTop: `1px solid ${C.rule}`, textAlign: "center", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 40 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Database size={12} color="#fff" />
          </div>
          <span className="pfd" style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>Data<span style={{ color: C.blue }}>Omen</span></span>
        </div>
        <div style={{ marginBottom: 40, display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
          {["Pricing", "Documentation", "Security", "Terms of Service", "Privacy Policy"].map(l => (
            <a key={l} href="#" style={{ color: C.muted, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>{l}</a>
          ))}
        </div>
        <p style={{ fontSize: 13, color: C.faint }}>© 2026 DataOmen Inc. | SOC2 Type II Certified</p>
      </footer>
    </main>
  );
}