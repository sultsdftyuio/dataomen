"use client";

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  TrendingUp,
  FileText,
  Plug,
  Bell,
  ShieldCheck,
  Zap,
  Upload,
  Search,
  BarChart3,
  ChevronDown,
  ArrowRight,
  Check,
  Star,
  Menu,
  X,
  Database,
  Activity,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
}

interface Pillar {
  icon: React.ReactNode;
  title: string;
  description: string;
  tag: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  stars: number;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface TrustLogo {
  name: string;
  acronym: string;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "FAQ", href: "#faq" },
];

const TRUST_LOGOS: TrustLogo[] = [
  { name: "Meridian Capital", acronym: "MC" },
  { name: "Vortex Labs", acronym: "VL" },
  { name: "Apex Retail", acronym: "AR" },
  { name: "NovaTech", acronym: "NT" },
  { name: "Stratos Group", acronym: "SG" },
  { name: "Helix AI", acronym: "HX" },
];

const PILLARS: Pillar[] = [
  {
    icon: <MessageSquare size={22} />,
    title: "Talk to Your Data Like a Person",
    description:
      "Type a question in plain English. Get a precise chart or number back in seconds — no SQL, no formulas, no frustration.",
    tag: "Conversational Chat",
  },
  {
    icon: <TrendingUp size={22} />,
    title: "See Revenue Trends Before They Hit",
    description:
      "Our engine reads your historical data and tells you what's coming next week, next month, next quarter. Stay ahead, always.",
    tag: "Predictive Growth",
  },
  {
    icon: <FileText size={22} />,
    title: "Reports That Explain Themselves",
    description:
      "Every dashboard auto-generates a plain-English summary. Share it with your board without writing a single word yourself.",
    tag: "Auto-Summaries",
  },
  {
    icon: <Plug size={22} />,
    title: "Connect Stripe or Excel in One Click",
    description:
      "No engineering team needed. Plug in your existing tools in under 60 seconds and your data is live instantly.",
    tag: "Easy Connection",
  },
  {
    icon: <Bell size={22} />,
    title: "We Watch Your Data 24/7",
    description:
      "Set a threshold — revenue dips, churn spikes, inventory drops — and we'll alert you the moment something needs attention.",
    tag: "Smart Alerts",
  },
  {
    icon: <ShieldCheck size={22} />,
    title: "Your Secrets Stay Yours",
    description:
      "Your data is completely invisible to other companies on the platform. Same security architecture trusted by global banks.",
    tag: "Bank-Level Security",
  },
];

const STEPS: Step[] = [
  {
    number: "01",
    title: "Upload",
    description:
      "Drop in your spreadsheet, connect Stripe, or link your database. We're ready in under a minute.",
    icon: <Upload size={28} />,
  },
  {
    number: "02",
    title: "Ask",
    description:
      "Type any question about your business. \"What drove churn last month?\" — we'll answer it instantly.",
    icon: <Search size={28} />,
  },
  {
    number: "03",
    title: "Grow",
    description:
      "Act on real insights, not gut feelings. Watch your decisions compound into results.",
    icon: <BarChart3 size={28} />,
  },
];

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I used to spend my Sunday nights building Excel models. Now I just ask Data Omen a question and get the answer before my coffee's done.",
    name: "Sarah Chen",
    role: "Head of Growth",
    company: "Meridian Capital",
    stars: 5,
  },
  {
    quote:
      "We spotted a 23% drop in repeat purchases three weeks before it would have showed up in our monthly report. That window saved us six figures.",
    name: "Marcus Webb",
    role: "Co-Founder",
    company: "Apex Retail",
    stars: 5,
  },
  {
    quote:
      "The fact that our data never touches another company's environment was the only thing that got this past our legal team. Worth every penny.",
    name: "Priya Nair",
    role: "VP Operations",
    company: "Stratos Group",
    stars: 5,
  },
];

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Do I need to know how to code or write SQL?",
    answer:
      "Not at all. Data Omen is built for decision-makers, not engineers. If you can type a sentence, you can use Data Omen.",
  },
  {
    question: "What data sources can I connect?",
    answer:
      "Excel, CSV, Google Sheets, Stripe, Shopify, PostgreSQL, MySQL, and more. New connectors ship every two weeks.",
  },
  {
    question: "How fast is 'blazing fast' exactly?",
    answer:
      "Our engine processes queries on tables with 50+ million rows in under two seconds. That's roughly 10x faster than running the same query in a traditional spreadsheet or BI tool.",
  },
  {
    question: "Is my data ever used to train AI models?",
    answer:
      "Never. Your data is yours. It is never used for training, never shared, and never visible to other customers. Full stop.",
  },
  {
    question: "What happens after the free trial?",
    answer:
      "Nothing unless you choose to upgrade. No surprise charges. No credit card required to start. Cancel the moment it stops working for you.",
  },
];

// ─── Utility Components ───────────────────────────────────────────────────────

const BlueprintGrid = () => (
  <div
    className="absolute inset-0 opacity-[0.04] pointer-events-none"
    style={{
      backgroundImage: `
        linear-gradient(rgba(0, 229, 255, 1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 229, 255, 1) 1px, transparent 1px)
      `,
      backgroundSize: "60px 60px",
    }}
  />
);

const BlueprintDotGrid = () => (
  <div
    className="absolute inset-0 opacity-[0.06] pointer-events-none"
    style={{
      backgroundImage: `radial-gradient(rgba(0, 229, 255, 0.8) 1px, transparent 1px)`,
      backgroundSize: "32px 32px",
    }}
  />
);

const GlowOrb = ({
  className,
  color = "cyan",
}: {
  className?: string;
  color?: "cyan" | "amber";
}) => {
  const gradient =
    color === "cyan"
      ? "radial-gradient(circle, rgba(0,229,255,0.15) 0%, transparent 70%)"
      : "radial-gradient(circle, rgba(255,176,0,0.12) 0%, transparent 70%)";
  return (
    <div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{ background: gradient }}
    />
  );
};

// ─── Navbar ───────────────────────────────────────────────────────────────────

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { background: #070710; }
        .font-syne { font-family: 'Syne', sans-serif; }
        .font-dm { font-family: 'DM Sans', sans-serif; }
        .font-mono-jet { font-family: 'JetBrains Mono', monospace; }
        .text-cyan { color: #00E5FF; }
        .text-amber { color: #FFB000; }
        .border-cyan { border-color: rgba(0,229,255,0.2); }
        .border-cyan-bright { border-color: rgba(0,229,255,0.5); }
        .bg-cyan { background-color: #00E5FF; }
        .cyan-glow { box-shadow: 0 0 40px rgba(0,229,255,0.25), 0 0 80px rgba(0,229,255,0.08); }
        .cyan-glow-sm { box-shadow: 0 0 20px rgba(0,229,255,0.2); }
        .amber-glow { box-shadow: 0 0 40px rgba(255,176,0,0.2); }
        .btn-primary {
          background: #00E5FF;
          color: #070710;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          letter-spacing: 0.02em;
          transition: all 0.2s ease;
        }
        .btn-primary:hover {
          background: #fff;
          box-shadow: 0 0 30px rgba(0,229,255,0.4);
          transform: translateY(-1px);
        }
        .btn-ghost {
          color: rgba(255,255,255,0.7);
          font-family: 'DM Sans', sans-serif;
          border: 1px solid rgba(255,255,255,0.1);
          transition: all 0.2s ease;
        }
        .btn-ghost:hover {
          color: #00E5FF;
          border-color: rgba(0,229,255,0.4);
          background: rgba(0,229,255,0.05);
        }
        .pillar-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.3s ease;
        }
        .pillar-card:hover {
          background: rgba(0,229,255,0.04);
          border-color: rgba(0,229,255,0.2);
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(0,229,255,0.06);
        }
        .pillar-card:hover .pillar-icon {
          color: #00E5FF;
          background: rgba(0,229,255,0.1);
        }
        .pillar-icon {
          color: rgba(255,255,255,0.4);
          background: rgba(255,255,255,0.05);
          transition: all 0.3s ease;
        }
        .faq-item {
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .faq-item:last-child { border-bottom: none; }
        .schematic-line {
          stroke: rgba(0,229,255,0.15);
          stroke-dasharray: 4 8;
        }
        .fade-up {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .fade-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .tag-badge {
          background: rgba(0,229,255,0.08);
          border: 1px solid rgba(0,229,255,0.2);
          color: #00E5FF;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .number-display {
          font-family: 'Syne', sans-serif;
          font-size: clamp(80px, 10vw, 140px);
          font-weight: 800;
          line-height: 1;
          color: transparent;
          -webkit-text-stroke: 1px rgba(0,229,255,0.12);
          user-select: none;
        }
        .hero-headline {
          font-family: 'Syne', sans-serif;
          font-size: clamp(44px, 7vw, 96px);
          font-weight: 800;
          line-height: 1.0;
          letter-spacing: -0.03em;
        }
        .section-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #00E5FF;
          opacity: 0.7;
        }
        .section-title {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          letter-spacing: -0.025em;
        }
        .testimonial-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          transition: border-color 0.3s ease;
        }
        .testimonial-card:hover {
          border-color: rgba(0,229,255,0.2);
        }
        .speed-bar {
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .speed-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 1.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .chat-bubble-user {
          background: rgba(0,229,255,0.1);
          border: 1px solid rgba(0,229,255,0.2);
          border-radius: 16px 16px 4px 16px;
        }
        .chat-bubble-ai {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 4px 16px 16px 16px;
        }
        .mock-chart-bar {
          background: linear-gradient(180deg, #00E5FF 0%, rgba(0,229,255,0.3) 100%);
          border-radius: 3px 3px 0 0;
          transition: height 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .mock-chart-bar.amber-bar {
          background: linear-gradient(180deg, #FFB000 0%, rgba(255,176,0,0.3) 100%);
        }
        .cta-section {
          background: radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,229,255,0.07) 0%, transparent 100%);
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .float-anim { animation: float 4s ease-in-out infinite; }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .cursor-blink { animation: blink-cursor 1s step-end infinite; }
        .navbar-glass {
          background: rgba(7, 7, 16, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .gradient-text {
          background: linear-gradient(135deg, #ffffff 0%, #00E5FF 50%, rgba(0,229,255,0.6) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .connector-pill {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          transition: all 0.2s ease;
        }
        .connector-pill:hover {
          background: rgba(0,229,255,0.06);
          border-color: rgba(0,229,255,0.2);
        }
        .tick-item { display: flex; align-items: flex-start; gap: 12px; }
        .tick-icon {
          width: 20px; height: 20px;
          background: rgba(0,229,255,0.1);
          border: 1px solid rgba(0,229,255,0.3);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 1px;
          color: #00E5FF;
        }
      `}</style>

      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "navbar-glass border-b border-white/[0.06]" : ""
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3">
            <div className="relative">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)" }}
              >
                <Database size={16} className="text-cyan" />
              </div>
              <div
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan pulse-dot"
                style={{ boxShadow: "0 0 8px #00E5FF" }}
              />
            </div>
            <span className="font-syne font-800 text-white text-lg tracking-tight" style={{ fontWeight: 800 }}>
              Data<span className="text-cyan">Omen</span>
            </span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="font-dm text-sm text-white/60 hover:text-white transition-colors duration-200"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <a href="/login" className="btn-ghost px-5 py-2.5 rounded-lg text-sm font-dm">
              Sign In
            </a>
            <a
              href="/register"
              className="btn-primary px-5 py-2.5 rounded-lg text-sm"
            >
              Start Free →
            </a>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-white/60 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden navbar-glass border-t border-white/[0.06] px-6 py-6 flex flex-col gap-4">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="font-dm text-white/70 hover:text-white py-1"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="flex flex-col gap-3 pt-3 border-t border-white/[0.06]">
              <a href="/login" className="btn-ghost px-5 py-3 rounded-lg text-sm text-center">
                Sign In
              </a>
              <a href="/register" className="btn-primary px-5 py-3 rounded-lg text-sm text-center">
                Start Free →
              </a>
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

// ─── Hero Section ─────────────────────────────────────────────────────────────

const Hero = () => {
  const [typed, setTyped] = useState("");
  const query = "What drove revenue growth last quarter?";

  useEffect(() => {
    let i = 0;
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        if (i <= query.length) {
          setTyped(query.slice(0, i));
          i++;
        } else {
          clearInterval(interval);
        }
      }, 55);
      return () => clearInterval(interval);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ background: "#070710" }}>
      <BlueprintGrid />
      <GlowOrb className="w-[800px] h-[800px] -top-40 -left-40" color="cyan" />
      <GlowOrb className="w-[600px] h-[600px] -bottom-20 -right-20" color="amber" />

      {/* Schematic corner marks */}
      {[
        "top-8 left-8",
        "top-8 right-8 rotate-90",
        "bottom-8 left-8 -rotate-90",
        "bottom-8 right-8 rotate-180",
      ].map((pos, i) => (
        <div key={i} className={`absolute ${pos} opacity-20`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M0 8 L0 0 L8 0" stroke="#00E5FF" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      ))}

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24 pb-16">
        {/* Eyebrow */}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
          style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.2)" }}
        >
          <span className="w-2 h-2 rounded-full bg-cyan pulse-dot" />
          <span className="font-mono-jet text-xs text-cyan tracking-widest uppercase">
            AI That Actually Knows Your Business
          </span>
        </div>

        {/* Headline */}
        <h1 className="hero-headline text-white mb-6">
          Chat with your data.
          <br />
          <span className="gradient-text">Get answers in seconds.</span>
        </h1>

        {/* Sub-headline */}
        <p
          className="font-dm text-white/55 mb-12 mx-auto max-w-xl leading-relaxed"
          style={{ fontSize: "clamp(17px, 2.2vw, 22px)" }}
        >
          No dashboards to build. No analysts to wait on.
          Just ask a question — and watch your data speak.
        </p>

        {/* Live Chat Demo */}
        <div
          className="mx-auto max-w-lg mb-12 rounded-2xl overflow-hidden float-anim"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 40px 80px rgba(0,0,0,0.5), 0 0 60px rgba(0,229,255,0.06)",
          }}
        >
          {/* Mock window bar */}
          <div
            className="flex items-center gap-2 px-4 py-3 border-b"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
          >
            <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,80,80,0.6)" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,176,0,0.6)" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "rgba(0,229,255,0.6)" }} />
            <span className="font-mono-jet text-white/20 text-xs ml-3">dataomen — chat</span>
          </div>

          <div className="p-5 space-y-4">
            {/* User message */}
            <div className="flex justify-end">
              <div className="chat-bubble-user px-4 py-3 max-w-xs text-left">
                <p className="font-dm text-white/90 text-sm leading-relaxed">
                  {typed}
                  {typed.length < query.length && (
                    <span className="cursor-blink text-cyan">|</span>
                  )}
                </p>
              </div>
            </div>

            {/* AI response */}
            {typed.length >= query.length - 5 && (
              <div className="flex justify-start">
                <div className="chat-bubble-ai px-4 py-3 max-w-xs text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity size={13} className="text-cyan" />
                    <span className="font-mono-jet text-xs text-cyan/70">DataOmen</span>
                  </div>
                  <p className="font-dm text-white/80 text-sm leading-relaxed">
                    Your Q3 revenue grew <span className="text-cyan font-semibold">+34%</span>,
                    driven primarily by <span className="text-white">Enterprise plan upgrades</span> and a
                    strong <span className="text-amber">EMEA expansion</span> in September.
                  </p>

                  {/* Mini spark chart */}
                  <div className="flex items-end gap-1 mt-3 h-10">
                    {[30, 45, 38, 55, 48, 70, 62, 85, 78, 100, 90, 100].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 mock-chart-bar"
                        style={{
                          height: `${h}%`,
                          opacity: i === 11 ? 1 : 0.5 + (i / 11) * 0.5,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/register"
            className="btn-primary w-full sm:w-auto px-8 py-4 rounded-xl text-base inline-flex items-center justify-center gap-2"
          >
            Start for Free
            <ArrowRight size={17} />
          </a>
          <a
            href="#features"
            className="btn-ghost w-full sm:w-auto px-8 py-4 rounded-xl text-sm inline-flex items-center justify-center gap-2"
          >
            See How It Works
            <ChevronDown size={16} />
          </a>
        </div>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-6 mt-10 flex-wrap">
          {["No credit card required", "Live in under 60 seconds", "Cancel anytime"].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <Check size={14} className="text-cyan opacity-80" />
              <span className="font-dm text-white/40 text-sm">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── Trusted By ───────────────────────────────────────────────────────────────

const TrustedBy = () => (
  <section
    className="py-16 border-y"
    style={{ background: "rgba(0,229,255,0.02)", borderColor: "rgba(255,255,255,0.05)" }}
  >
    <div className="max-w-6xl mx-auto px-6">
      <p className="section-label text-center mb-8">Trusted by teams who run on data</p>
      <div className="flex items-center justify-center gap-10 flex-wrap">
        {TRUST_LOGOS.map((logo) => (
          <div key={logo.name} className="flex items-center gap-2.5 opacity-40 hover:opacity-80 transition-opacity duration-200">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-mono-jet text-xs text-cyan font-bold"
              style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.15)" }}
            >
              {logo.acronym}
            </div>
            <span className="font-syne text-white text-sm font-semibold tracking-tight">{logo.name}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Aha Moment ───────────────────────────────────────────────────────────────

const AhaMoment = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const bars = [55, 70, 45, 90, 65, 80, 75, 95, 60, 85, 72, 100];
  const trend = [30, 38, 35, 50, 48, 62, 58, 75, 70, 82, 80, 95];

  return (
    <section className="relative py-32 overflow-hidden" style={{ background: "#070710" }} id="demo">
      <BlueprintDotGrid />
      <GlowOrb className="w-[700px] h-[700px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="cyan" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="section-label mb-4">The "Aha" Moment</p>
          <h2 className="section-title text-white text-5xl md:text-6xl mb-5">
            One question.
            <br />
            <span className="text-cyan">One beautiful answer.</span>
          </h2>
          <p className="font-dm text-white/50 max-w-md mx-auto leading-relaxed">
            Ask anything about your business. DataOmen understands context,
            history, and intent — not just syntax.
          </p>
        </div>

        <div ref={ref} className={`fade-up ${visible ? "visible" : ""}`}>
          <div
            className="rounded-3xl overflow-hidden mx-auto max-w-3xl"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 60px 120px rgba(0,0,0,0.6), 0 0 80px rgba(0,229,255,0.06)",
            }}
          >
            {/* Window chrome */}
            <div
              className="flex items-center justify-between px-5 py-3.5 border-b"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,80,80,0.5)" }} />
                <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,176,0,0.5)" }} />
                <div className="w-3 h-3 rounded-full" style={{ background: "rgba(0,229,255,0.5)" }} />
              </div>
              <span className="font-mono-jet text-white/20 text-xs">Revenue Analysis · Q3 2024</span>
              <div className="w-16" />
            </div>

            <div className="p-8 space-y-6">
              {/* Question */}
              <div className="flex items-start gap-4">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)" }}
                >
                  <span className="font-syne text-cyan text-xs font-bold">You</span>
                </div>
                <div className="chat-bubble-user px-5 py-3">
                  <p className="font-dm text-white/90 text-sm">
                    Which products had the biggest revenue jump last quarter, and why?
                  </p>
                </div>
              </div>

              {/* Answer + chart */}
              <div className="flex items-start gap-4">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)" }}
                >
                  <Activity size={14} className="text-cyan" />
                </div>
                <div className="flex-1 chat-bubble-ai px-5 py-4 space-y-5">
                  <p className="font-dm text-white/80 text-sm leading-relaxed">
                    <span className="text-white font-semibold">Enterprise licenses</span> led Q3 with{" "}
                    <span className="text-cyan font-semibold">+47% growth</span>, fueled by 3 major account
                    expansions in September. <span className="text-white">API add-ons</span> came in second
                    at <span className="text-amber font-semibold">+31%</span>, correlating with
                    your new developer docs launch in late July.
                  </p>

                  {/* Chart */}
                  <div
                    className="rounded-xl p-5"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono-jet text-white/40 text-xs">Revenue by product line · Jul–Sep</span>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-sm" style={{ background: "#00E5FF" }} />
                          <span className="font-dm text-white/40 text-xs">Enterprise</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-sm" style={{ background: "#FFB000" }} />
                          <span className="font-dm text-white/40 text-xs">API</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-end gap-1.5 h-28">
                      {bars.map((h, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div
                            className="mock-chart-bar w-full"
                            style={{ height: visible ? `${h}%` : "0%" }}
                          />
                          <div
                            className="mock-chart-bar amber-bar w-full"
                            style={{ height: visible ? `${trend[i] * 0.6}%` : "0%" }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between mt-2">
                      {["Jul", "Aug", "Sep"].map((m) => (
                        <span key={m} className="font-mono-jet text-white/20 text-xs">{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Six Pillars ──────────────────────────────────────────────────────────────

const SixPillars = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-32 overflow-hidden" id="features" style={{ background: "#060610" }}>
      <BlueprintGrid />
      <GlowOrb className="w-[900px] h-[600px] top-0 right-0 translate-x-1/3 -translate-y-1/4" color="cyan" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="max-w-xl mb-16">
          <p className="section-label mb-4">What DataOmen does for you</p>
          <h2 className="section-title text-white text-5xl md:text-6xl leading-tight mb-5">
            Six ways to make
            <br />
            <span className="text-cyan">smarter decisions.</span>
          </h2>
          <p className="font-dm text-white/50 leading-relaxed">
            We've replaced six different tools — and the analysts running them —
            with one platform that learns your business inside out.
          </p>
        </div>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PILLARS.map((pillar, i) => (
            <div
              key={pillar.title}
              className={`pillar-card rounded-2xl p-7 fade-up ${visible ? "visible" : ""}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between mb-5">
                <div className="pillar-icon w-11 h-11 rounded-xl flex items-center justify-center">
                  {pillar.icon}
                </div>
                <span className="tag-badge px-2.5 py-1 rounded-md">{pillar.tag}</span>
              </div>
              <h3 className="font-syne font-700 text-white text-xl mb-3 leading-snug" style={{ fontWeight: 700 }}>
                {pillar.title}
              </h3>
              <p className="font-dm text-white/50 text-sm leading-relaxed">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── Speed Section ────────────────────────────────────────────────────────────

const SpeedSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const benchmarks = [
    { label: "DataOmen", pct: 95, time: "1.8s", highlight: true },
    { label: "Traditional BI Tool", pct: 38, time: "18s", highlight: false },
    { label: "Spreadsheet Formula", pct: 18, time: "42s", highlight: false },
    { label: "Manual Analysis", pct: 5, time: "3–5 days", highlight: false },
  ];

  return (
    <section className="relative py-32 overflow-hidden" style={{ background: "#070710" }}>
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,176,0,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,176,0,1) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      <GlowOrb className="w-[600px] h-[400px] bottom-0 left-0 -translate-x-1/4" color="amber" />

      <div ref={ref} className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="section-label mb-4">Why we're so fast</p>
            <h2 className="section-title text-white text-5xl leading-tight mb-6">
              10× faster than
              <br />
              <span className="text-amber">everything else.</span>
            </h2>
            <p className="font-dm text-white/55 leading-relaxed mb-6">
              Our engine processes queries on tables with 50 million rows in under 2 seconds.
              Most tools give up and ask you to wait. We don't wait.
            </p>
            <p className="font-dm text-white/35 text-sm leading-relaxed">
              Under the hood, we use a query engine built for in-memory analytics — the same
              technology powering Fortune 500 data teams, now available to you in a chat box.
            </p>

            <div className="flex items-center gap-4 mt-8">
              <div
                className="px-4 py-2 rounded-lg"
                style={{ background: "rgba(255,176,0,0.08)", border: "1px solid rgba(255,176,0,0.2)" }}
              >
                <span className="font-mono-jet text-amber text-xs">50M+ rows</span>
              </div>
              <div
                className="px-4 py-2 rounded-lg"
                style={{ background: "rgba(255,176,0,0.08)", border: "1px solid rgba(255,176,0,0.2)" }}
              >
                <span className="font-mono-jet text-amber text-xs">{'< 2s query time'}</span>
              </div>
              <div
                className="px-4 py-2 rounded-lg"
                style={{ background: "rgba(255,176,0,0.08)", border: "1px solid rgba(255,176,0,0.2)" }}
              >
                <span className="font-mono-jet text-amber text-xs">Always-on</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {benchmarks.map((b, i) => (
              <div
                key={b.label}
                className={`fade-up ${visible ? "visible" : ""}`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    {b.highlight && (
                      <div className="w-2 h-2 rounded-full bg-cyan pulse-dot" />
                    )}
                    <span
                      className={`font-dm text-sm ${b.highlight ? "text-white font-semibold" : "text-white/50"}`}
                    >
                      {b.label}
                    </span>
                  </div>
                  <span
                    className={`font-mono-jet text-sm ${b.highlight ? "text-cyan" : "text-white/30"}`}
                  >
                    {b.time}
                  </span>
                </div>
                <div className="speed-bar">
                  <div
                    className="speed-bar-fill"
                    style={{
                      width: visible ? `${b.pct}%` : "0%",
                      background: b.highlight
                        ? "linear-gradient(90deg, #00E5FF, rgba(0,229,255,0.5))"
                        : "rgba(255,255,255,0.15)",
                      boxShadow: b.highlight ? "0 0 12px rgba(0,229,255,0.4)" : "none",
                      transitionDelay: `${i * 150}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="font-mono-jet text-white/20 text-xs pt-2">
              * Based on internal benchmarks. Results vary by dataset size.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── How It Works ─────────────────────────────────────────────────────────────

const HowItWorks = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-32 overflow-hidden" id="how-it-works" style={{ background: "#060610" }}>
      <BlueprintDotGrid />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-20">
          <p className="section-label mb-4">How it works</p>
          <h2 className="section-title text-white text-5xl md:text-6xl mb-5">
            Three steps.
            <br />
            <span className="text-cyan">Zero friction.</span>
          </h2>
        </div>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div
            className="hidden md:block absolute top-16 left-1/3 right-1/3 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.3), transparent)" }}
          />

          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className={`fade-up ${visible ? "visible" : ""} text-center`}
              style={{ transitionDelay: `${i * 120}ms` }}
            >
              <div className="relative inline-flex mb-8">
                <div className="number-display">{step.number}</div>
                <div
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center cyan-glow-sm"
                    style={{
                      background: "rgba(0,229,255,0.08)",
                      border: "1px solid rgba(0,229,255,0.25)",
                    }}
                  >
                    <span className="text-cyan">{step.icon}</span>
                  </div>
                </div>
              </div>
              <h3 className="font-syne text-white text-3xl font-bold mb-3">{step.title}</h3>
              <p className="font-dm text-white/50 text-sm leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <a href="/register" className="btn-primary inline-flex items-center gap-2 px-8 py-4 rounded-xl">
            Try It Free — No Card Required
            <ArrowRight size={17} />
          </a>
        </div>
      </div>
    </section>
  );
};

// ─── Testimonials ─────────────────────────────────────────────────────────────

const Testimonials = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-32 overflow-hidden" id="testimonials" style={{ background: "#070710" }}>
      <BlueprintGrid />
      <GlowOrb className="w-[800px] h-[500px] top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" color="cyan" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Real stories, real results</p>
          <h2 className="section-title text-white text-5xl md:text-6xl mb-5">
            People who stopped
            <br />
            <span className="text-cyan">guessing.</span>
          </h2>
        </div>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              className={`testimonial-card rounded-2xl p-7 fade-up ${visible ? "visible" : ""}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex gap-1 mb-5">
                {[...Array(t.stars)].map((_, j) => (
                  <Star key={j} size={14} className="text-amber fill-current" style={{ fill: "#FFB000" }} />
                ))}
              </div>
              <p className="font-dm text-white/70 text-sm leading-relaxed mb-7 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)" }}
                >
                  <span className="font-syne text-cyan text-xs font-bold">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <p className="font-syne text-white text-sm font-semibold">{t.name}</p>
                  <p className="font-dm text-white/35 text-xs">{t.role} · {t.company}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats Row */}
        <div
          className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 rounded-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {[
            { value: "2,400+", label: "Teams making faster decisions" },
            { value: "< 90s", label: "Average time to first insight" },
            { value: "4.9 / 5", label: "Average customer rating" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-syne text-white text-4xl font-bold mb-1 tracking-tight" style={{ color: "#00E5FF" }}>
                {stat.value}
              </p>
              <p className="font-dm text-white/40 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="relative py-32" id="faq" style={{ background: "#060610" }}>
      <BlueprintDotGrid />
      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="section-label mb-4">Common questions</p>
          <h2 className="section-title text-white text-5xl mb-5">
            We've heard these before.
            <br />
            <span className="text-cyan">Here's the truth.</span>
          </h2>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="faq-item">
              <button
                className="w-full text-left px-7 py-6 flex items-center justify-between gap-4"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                <span className="font-syne text-white font-semibold text-base">{item.question}</span>
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200"
                  style={{
                    background: openIndex === i ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.04)",
                    border: openIndex === i ? "1px solid rgba(0,229,255,0.3)" : "1px solid rgba(255,255,255,0.1)",
                    transform: openIndex === i ? "rotate(180deg)" : "none",
                  }}
                >
                  <ChevronDown size={14} className={openIndex === i ? "text-cyan" : "text-white/40"} />
                </div>
              </button>
              {openIndex === i && (
                <div className="px-7 pb-6">
                  <p className="font-dm text-white/55 text-sm leading-relaxed">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── Final CTA ────────────────────────────────────────────────────────────────

const FinalCTA = () => (
  <section className="relative py-40 overflow-hidden cta-section" style={{ background: "#070710" }}>
    <BlueprintGrid />

    {/* Schematic frame */}
    {[
      "top-12 left-12",
      "top-12 right-12 rotate-90",
      "bottom-12 left-12 -rotate-90",
      "bottom-12 right-12 rotate-180",
    ].map((pos, i) => (
      <div key={i} className={`absolute ${pos} opacity-30`}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M0 14 L0 0 L14 0" stroke="#00E5FF" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    ))}

    <GlowOrb className="w-[700px] h-[700px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="cyan" />

    <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
      <p className="section-label mb-6">Your move</p>

      <h2
        className="font-syne text-white font-extrabold mb-6"
        style={{ fontSize: "clamp(40px, 6vw, 80px)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
      >
        Stop running on
        <br />
        <span className="gradient-text">gut feelings.</span>
      </h2>

      <p className="font-dm text-white/55 mb-12 mx-auto max-w-md leading-relaxed" style={{ fontSize: "18px" }}>
        DataOmen is live in 60 seconds. No credit card. No setup call.
        No learning curve. Just answers.
      </p>

      {/* Zero-friction ticks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-12 text-left">
        {[
          "No credit card required",
          "Cancel anytime, for any reason",
          "Full platform access from day one",
          "Onboarding support included",
          "GDPR & SOC 2 compliant",
          "Data never used for AI training",
        ].map((item) => (
          <div key={item} className="tick-item">
            <div className="tick-icon">
              <Check size={11} />
            </div>
            <span className="font-dm text-white/60 text-sm">{item}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a
          href="/register"
          className="btn-primary w-full sm:w-auto px-10 py-5 rounded-xl text-base inline-flex items-center justify-center gap-2 cyan-glow"
          style={{ fontSize: "17px" }}
        >
          Start for Free — No Card Needed
          <ArrowRight size={18} />
        </a>
        <a href="/login" className="btn-ghost w-full sm:w-auto px-8 py-5 rounded-xl text-sm inline-flex items-center justify-center gap-2">
          Already have an account? Sign in
        </a>
      </div>
    </div>
  </section>
);

// ─── Footer ───────────────────────────────────────────────────────────────────

const Footer = () => (
  <footer
    className="py-10 border-t"
    style={{ background: "#040408", borderColor: "rgba(255,255,255,0.06)" }}
  >
    <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)" }}
        >
          <Database size={13} className="text-cyan" />
        </div>
        <span className="font-syne font-bold text-white/70 text-sm">
          Data<span className="text-cyan">Omen</span>
        </span>
      </div>
      <p className="font-dm text-white/25 text-xs">
        © {new Date().getFullYear()} DataOmen. All rights reserved.
      </p>
      <div className="flex items-center gap-6">
        {["Privacy", "Terms", "Security", "Contact"].map((item) => (
          <a key={item} href={`/${item.toLowerCase()}`} className="font-dm text-white/30 hover:text-white/60 text-xs transition-colors">
            {item}
          </a>
        ))}
      </div>
    </div>
  </footer>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <main style={{ background: "#070710" }}>
      <Navbar />
      <Hero />
      <TrustedBy />
      <AhaMoment />
      <SixPillars />
      <SpeedSection />
      <HowItWorks />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}