"use client";

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  TrendingUp,
  FileText,
  Plug,
  Bell,
  ShieldCheck,
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
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem { label: string; href: string; }
interface Pillar { icon: React.ReactNode; title: string; description: string; tag: string; }
interface Step { number: string; title: string; description: string; icon: React.ReactNode; }
interface Testimonial { quote: string; name: string; role: string; company: string; stars: number; }
interface FAQItem { question: string; answer: string; }
interface TrustLogo { name: string; acronym: string; }

// ─── Data ─────────────────────────────────────────────────────────────────────

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
    icon: <MessageSquare size={20} />,
    title: "Natural Language Queries",
    description: "Ask questions in plain English and receive precise, structured answers. No SQL expertise, no formula dependencies — just direct access to your data.",
    tag: "Conversational AI",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "Predictive Revenue Forecasting",
    description: "Surface forward-looking signals from your historical data. Identify revenue trends weeks before they appear in monthly reports.",
    tag: "Predictive Analytics",
  },
  {
    icon: <FileText size={20} />,
    title: "Automated Executive Summaries",
    description: "Every dashboard generates board-ready narratives automatically. Distribute insights across your organisation without manual write-ups.",
    tag: "Auto-Reporting",
  },
  {
    icon: <Plug size={20} />,
    title: "One-Click Integrations",
    description: "Connect Stripe, PostgreSQL, Shopify, or Excel in under 60 seconds. No engineering resource required — your data is live immediately.",
    tag: "Data Connectors",
  },
  {
    icon: <Bell size={20} />,
    title: "Threshold-Based Alerting",
    description: "Define KPI thresholds for revenue, churn, or inventory. DataOmen monitors continuously and notifies the right stakeholders in real time.",
    tag: "Smart Alerts",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "Enterprise-Grade Security",
    description: "Strict data isolation, SOC 2 Type II compliance, and GDPR-ready infrastructure. The same security architecture trusted by global financial institutions.",
    tag: "Security & Compliance",
  },
];

const STEPS: Step[] = [
  {
    number: "01",
    title: "Connect",
    description: "Upload a spreadsheet, connect your database, or link a SaaS platform. DataOmen is operational in under 60 seconds.",
    icon: <Upload size={22} />,
  },
  {
    number: "02",
    title: "Query",
    description: "Ask any business question in plain English. DataOmen interprets intent, not just syntax, and delivers structured insights immediately.",
    icon: <Search size={22} />,
  },
  {
    number: "03",
    title: "Decide",
    description: "Act on evidence, not assumptions. Track outcomes and refine strategy as your data compounds into competitive advantage.",
    icon: <BarChart3 size={22} />,
  },
];

const TESTIMONIALS: Testimonial[] = [
  {
    quote: "I used to spend my Sunday nights building Excel models. Now I ask DataOmen a question and have the answer before my coffee is done.",
    name: "Sarah Chen",
    role: "Head of Growth",
    company: "Meridian Capital",
    stars: 5,
  },
  {
    quote: "We identified a 23% drop in repeat purchases three weeks before it surfaced in our monthly report. That lead time saved us six figures.",
    name: "Marcus Webb",
    role: "Co-Founder",
    company: "Apex Retail",
    stars: 5,
  },
  {
    quote: "Data isolation was the only requirement our legal team had. DataOmen met it without compromise. Worth every penny of the subscription.",
    name: "Priya Nair",
    role: "VP Operations",
    company: "Stratos Group",
    stars: 5,
  },
];

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Does implementation require engineering resources?",
    answer: "No. DataOmen is purpose-built for decision-makers and operators. If you can write a sentence, you can use the platform — no SQL, no scripting, no developer involvement required.",
  },
  {
    question: "Which data sources are supported?",
    answer: "Excel, CSV, Google Sheets, Stripe, Shopify, PostgreSQL, MySQL, and more. New connectors are released on a two-week cadence based on customer demand.",
  },
  {
    question: "What does 'blazing fast' mean in practice?",
    answer: "Our query engine processes tables with 50+ million rows in under two seconds — approximately 10× faster than equivalent operations in traditional BI tools or spreadsheet environments.",
  },
  {
    question: "Is our data used to train AI models?",
    answer: "Never. Your data remains exclusively yours. It is never used for model training, never shared with third parties, and never accessible to other customers on the platform.",
  },
  {
    question: "What happens at the end of the trial period?",
    answer: "Nothing changes unless you choose to upgrade. No automatic charges. No credit card required to begin. Cancel at any point — no lock-in, no penalty.",
  },
];

// ─── Global Styles ────────────────────────────────────────────────────────────

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #FFFFFF; color: #0D1B2A; font-family: 'Manrope', sans-serif; -webkit-font-smoothing: antialiased; }

    :root {
      --navy:      #0D1B2A;
      --navy-mid:  #1A3050;
      --navy-soft: #2C4A6E;
      --blue:      #1B6CA8;
      --blue-light:#2D87CC;
      --blue-pale: #E8F4FD;
      --rule:      #E2EAF2;
      --text-muted:#5B7490;
      --text-faint:#8FAFC8;
      --white:     #FFFFFF;
      --off-white: #F7FAFD;
    }

    .font-lora  { font-family: 'Lora', serif; }
    .font-man   { font-family: 'Manrope', sans-serif; }
    .font-mono  { font-family: 'JetBrains Mono', monospace; }

    /* ── Buttons ── */
    .btn-primary {
      background: var(--navy);
      color: #fff;
      font-family: 'Manrope', sans-serif;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.01em;
      border-radius: 6px;
      transition: background 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease;
    }
    .btn-primary:hover {
      background: var(--navy-mid);
      box-shadow: 0 4px 20px rgba(13,27,42,0.18);
      transform: translateY(-1px);
    }
    .btn-outline {
      color: var(--navy);
      font-family: 'Manrope', sans-serif;
      font-weight: 600;
      font-size: 14px;
      border: 1.5px solid var(--rule);
      border-radius: 6px;
      transition: border-color 0.18s, color 0.18s, background 0.18s;
    }
    .btn-outline:hover {
      border-color: var(--navy);
      background: var(--off-white);
    }
    .btn-blue {
      background: var(--blue);
      color: #fff;
      font-family: 'Manrope', sans-serif;
      font-weight: 700;
      font-size: 14px;
      border-radius: 6px;
      transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
    }
    .btn-blue:hover {
      background: var(--blue-light);
      box-shadow: 0 6px 24px rgba(27,108,168,0.28);
      transform: translateY(-1px);
    }

    /* ── Section labels ── */
    .eyebrow {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--blue);
      display: block;
    }

    /* ── Cards ── */
    .pillar-card {
      background: var(--white);
      border: 1.5px solid var(--rule);
      border-radius: 10px;
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    }
    .pillar-card:hover {
      border-color: #b8d4ec;
      box-shadow: 0 8px 32px rgba(27,108,168,0.08);
      transform: translateY(-3px);
    }
    .pillar-icon-wrap {
      background: var(--blue-pale);
      color: var(--blue);
      border-radius: 8px;
      transition: background 0.2s;
    }
    .pillar-card:hover .pillar-icon-wrap {
      background: #d0e9f7;
    }

    /* ── Chat mock ── */
    .chat-user {
      background: var(--navy);
      color: #fff;
      border-radius: 14px 14px 4px 14px;
    }
    .chat-ai {
      background: var(--off-white);
      border: 1.5px solid var(--rule);
      border-radius: 4px 14px 14px 14px;
    }

    /* ── Bar chart mock ── */
    .bar-navy {
      background: linear-gradient(180deg, var(--navy) 0%, #2C4A6E 100%);
      border-radius: 3px 3px 0 0;
      transition: height 1.2s cubic-bezier(0.34, 1.2, 0.64, 1);
    }
    .bar-blue {
      background: linear-gradient(180deg, var(--blue-light) 0%, #93c5e8 100%);
      border-radius: 3px 3px 0 0;
      transition: height 1.2s cubic-bezier(0.34, 1.2, 0.64, 1);
    }

    /* ── Speed bars ── */
    .speed-track {
      height: 5px;
      border-radius: 3px;
      background: var(--rule);
      overflow: hidden;
    }
    .speed-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 1.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* ── Fade-up ── */
    .fade-up {
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .fade-up.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* ── Testimonial ── */
    .tcard {
      background: var(--white);
      border: 1.5px solid var(--rule);
      border-radius: 10px;
      transition: box-shadow 0.2s, border-color 0.2s;
    }
    .tcard:hover {
      border-color: #b8d4ec;
      box-shadow: 0 8px 32px rgba(27,108,168,0.07);
    }

    /* ── FAQ ── */
    .faq-row { border-bottom: 1.5px solid var(--rule); }
    .faq-row:last-child { border-bottom: none; }

    /* ── Nav ── */
    .navbar-scroll {
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1.5px solid var(--rule);
    }

    /* ── Divider rule ── */
    .h-rule { height: 1.5px; background: var(--rule); }

    /* ── Subtle grid bg ── */
    .grid-bg {
      background-image:
        linear-gradient(var(--rule) 1px, transparent 1px),
        linear-gradient(90deg, var(--rule) 1px, transparent 1px);
      background-size: 48px 48px;
    }

    /* ── Cursor blink ── */
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    .cursor { animation: blink 1s step-end infinite; color: var(--blue); }

    /* ── Stat number ── */
    .stat-num {
      font-family: 'Lora', serif;
      font-weight: 700;
      color: var(--navy);
      font-size: clamp(32px, 4vw, 48px);
      line-height: 1;
    }

    /* ── Section title ── */
    .section-heading {
      font-family: 'Lora', serif;
      font-weight: 700;
      color: var(--navy);
      line-height: 1.15;
      letter-spacing: -0.02em;
    }

    /* ── Tag ── */
    .tag {
      background: var(--blue-pale);
      color: var(--blue);
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border-radius: 4px;
      padding: 3px 8px;
    }

    /* ── Step number ── */
    .step-num {
      font-family: 'Lora', serif;
      font-weight: 700;
      font-size: 56px;
      line-height: 1;
      color: var(--rule);
      user-select: none;
    }

    /* ── Window chrome ── */
    .window-bar {
      background: var(--off-white);
      border-bottom: 1.5px solid var(--rule);
      border-radius: 10px 10px 0 0;
    }
    .window-wrap {
      background: var(--white);
      border: 1.5px solid var(--rule);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(13,27,42,0.08), 0 4px 16px rgba(13,27,42,0.06);
    }

    .connector-pill {
      background: var(--white);
      border: 1.5px solid var(--rule);
      border-radius: 6px;
      transition: border-color 0.15s, background 0.15s;
    }
    .connector-pill:hover {
      border-color: #b8d4ec;
      background: var(--blue-pale);
    }
  `}</style>
);

// ─── Navbar ───────────────────────────────────────────────────────────────────

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "navbar-scroll" : ""}`}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--navy)" }}>
            <Database size={15} color="#fff" />
          </div>
          <span className="font-lora font-bold text-navy text-lg tracking-tight" style={{ color: "var(--navy)" }}>
            Data<span style={{ color: "var(--blue)" }}>Omen</span>
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map(item => (
            <a key={item.label} href={item.href}
              className="font-man text-sm font-500 transition-colors duration-150"
              style={{ color: "var(--text-muted)", fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--navy)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
            >{item.label}</a>
          ))}
        </div>

        {/* CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <a href="/login" className="btn-outline px-5 py-2.5 text-sm font-man">Sign In</a>
          <a href="/register" className="btn-primary px-5 py-2.5 text-sm">Request Access →</a>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden" style={{ color: "var(--navy)" }} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden px-6 py-6 flex flex-col gap-4 border-t" style={{ background: "#fff", borderColor: "var(--rule)" }}>
          {NAV_ITEMS.map(item => (
            <a key={item.label} href={item.href} className="font-man text-sm py-1" style={{ color: "var(--navy)" }} onClick={() => setMenuOpen(false)}>{item.label}</a>
          ))}
          <div className="flex flex-col gap-3 pt-3 border-t" style={{ borderColor: "var(--rule)" }}>
            <a href="/login" className="btn-outline px-5 py-3 text-sm text-center">Sign In</a>
            <a href="/register" className="btn-primary px-5 py-3 text-sm text-center">Request Access →</a>
          </div>
        </div>
      )}
    </nav>
  );
};

// ─── Hero ─────────────────────────────────────────────────────────────────────

const Hero = () => {
  const [typed, setTyped] = useState("");
  const query = "What drove revenue growth last quarter?";

  useEffect(() => {
    let i = 0;
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        if (i <= query.length) { setTyped(query.slice(0, i)); i++; }
        else clearInterval(interval);
      }, 55);
      return () => clearInterval(interval);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative overflow-hidden grid-bg" style={{ background: "#F7FAFD", paddingTop: "96px" }}>
      {/* Faint gradient overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(27,108,168,0.07) 0%, transparent 70%)"
      }} />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-28 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Left — copy */}
        <div>
          <span className="eyebrow mb-5 block">Enterprise Data Intelligence</span>

          <h1 className="section-heading mb-6" style={{ fontSize: "clamp(38px, 5vw, 62px)" }}>
            The analytics platform your team will actually use.
          </h1>

          <p className="font-man text-base leading-relaxed mb-8" style={{ color: "var(--text-muted)", maxWidth: "480px" }}>
            Ask any question about your business in plain English.
            DataOmen delivers precise answers — no SQL, no analysts,
            no waiting. Trusted by 2,400+ revenue teams.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-10">
            <a href="/register" className="btn-primary inline-flex items-center justify-center gap-2 px-7 py-3.5">
              Start Free Trial <ArrowRight size={16} />
            </a>
            <a href="#how-it-works" className="btn-outline inline-flex items-center justify-center gap-2 px-7 py-3.5">
              See How It Works
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {["No credit card required", "SOC 2 Type II", "GDPR compliant"].map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <Check size={13} style={{ color: "var(--blue)" }} />
                <span className="font-man text-sm" style={{ color: "var(--text-muted)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — chat window mock */}
        <div className="window-wrap mx-auto w-full max-w-md" style={{ boxShadow: "0 24px 80px rgba(13,27,42,0.12)" }}>
          <div className="window-bar flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-1.5">
              {["#E87070","#E8C070","#70C070"].map((c,i) => (
                <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>DataOmen — Revenue Analysis</span>
            <div className="w-12" />
          </div>

          <div className="p-6 space-y-5">
            <div className="flex justify-end">
              <div className="chat-user px-4 py-3 max-w-xs">
                <p className="font-man text-sm leading-relaxed">
                  {typed}
                  {typed.length < query.length && <span className="cursor">|</span>}
                </p>
              </div>
            </div>

            {typed.length >= query.length - 5 && (
              <div className="flex justify-start">
                <div className="chat-ai px-5 py-4 max-w-xs w-full">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "var(--navy)" }}>
                      <Activity size={11} color="#fff" />
                    </div>
                    <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>DataOmen</span>
                  </div>
                  <p className="font-man text-sm leading-relaxed mb-4" style={{ color: "var(--navy)" }}>
                    Q3 revenue grew <span className="font-bold" style={{ color: "var(--blue)" }}>+34%</span>,
                    driven primarily by <span className="font-semibold">Enterprise plan upgrades</span> and a
                    strong EMEA expansion in September.
                  </p>
                  {/* Spark bars */}
                  <div className="flex items-end gap-1 h-10">
                    {[30,45,38,55,48,70,62,85,78,100,90,100].map((h,i) => (
                      <div key={i} className="bar-navy flex-1" style={{ height: `${h}%`, opacity: 0.4 + (i/11)*0.6 }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Trusted By ───────────────────────────────────────────────────────────────

const TrustedBy = () => (
  <section className="py-14 border-y" style={{ borderColor: "var(--rule)", background: "#fff" }}>
    <div className="max-w-6xl mx-auto px-6">
      <p className="eyebrow text-center mb-8" style={{ opacity: 0.55 }}>Trusted by teams at</p>
      <div className="flex items-center justify-center flex-wrap gap-10">
        {TRUST_LOGOS.map(logo => (
          <div key={logo.name} className="flex items-center gap-2.5 transition-opacity duration-200" style={{ opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}
          >
            <div className="w-8 h-8 rounded-md flex items-center justify-center font-mono text-xs font-bold"
              style={{ background: "var(--navy)", color: "#fff" }}>
              {logo.acronym}
            </div>
            <span className="font-man font-semibold text-sm" style={{ color: "var(--navy)" }}>{logo.name}</span>
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
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.25 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const bars =  [55,70,45,90,65,80,75,95,60,85,72,100];
  const bars2 = [30,38,35,50,48,62,58,75,70,82,80,95];

  return (
    <section className="py-28" style={{ background: "var(--off-white)" }} id="demo">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="eyebrow mb-5 block">Product Demo</span>
            <h2 className="section-heading mb-5" style={{ fontSize: "clamp(30px, 4vw, 46px)" }}>
              One question.<br />One definitive answer.
            </h2>
            <p className="font-man text-base leading-relaxed mb-6" style={{ color: "var(--text-muted)" }}>
              DataOmen understands business context, intent, and history —
              not just data structure. Ask in plain English; receive a
              structured, actionable insight.
            </p>
            <ul className="space-y-3">
              {[
                "Instant answers across all connected data sources",
                "Visualisations generated automatically with every query",
                "Exportable to PDF, Sheets, or Slack in one click",
              ].map(t => (
                <li key={t} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "var(--blue-pale)" }}>
                    <Check size={11} style={{ color: "var(--blue)" }} />
                  </div>
                  <span className="font-man text-sm" style={{ color: "var(--navy)" }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div ref={ref} className={`window-wrap fade-up ${visible ? "visible" : ""}`}>
            <div className="window-bar flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-1.5">
                {["#E87070","#E8C070","#70C070"].map((c,i) => <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
              </div>
              <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>Revenue Analysis · Q3 2024</span>
              <div className="w-12" />
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--navy)" }}>
                  <span className="font-man text-white font-bold" style={{ fontSize: 10 }}>You</span>
                </div>
                <div className="chat-user px-4 py-3 flex-1">
                  <p className="font-man text-sm">Which products had the biggest revenue jump last quarter, and why?</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--blue-pale)" }}>
                  <Activity size={13} style={{ color: "var(--blue)" }} />
                </div>
                <div className="chat-ai px-4 py-4 flex-1 space-y-4">
                  <p className="font-man text-sm leading-relaxed" style={{ color: "var(--navy)" }}>
                    <span className="font-bold">Enterprise licences</span> led Q3 with{" "}
                    <span className="font-bold" style={{ color: "var(--blue)" }}>+47% growth</span>,
                    driven by 3 major account expansions in September.{" "}
                    <span className="font-semibold">API add-ons</span> followed at{" "}
                    <span className="font-semibold">+31%</span>, correlating
                    with the developer docs launch in late July.
                  </p>

                  <div className="rounded-lg p-4" style={{ background: "var(--off-white)", border: "1.5px solid var(--rule)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>Revenue by line · Jul–Sep</span>
                      <div className="flex items-center gap-4">
                        {[["var(--navy)","Enterprise"],["var(--blue-light)","API"]].map(([c,l]) => (
                          <div key={l as string} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm" style={{ background: c as string }} />
                            <span className="font-man text-xs" style={{ color: "var(--text-faint)" }}>{l as string}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-end gap-1.5 h-24">
                      {bars.map((h, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="bar-navy w-full" style={{ height: visible ? `${h}%` : "0%" }} />
                          <div className="bar-blue w-full" style={{ height: visible ? `${bars2[i]*0.55}%` : "0%" }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2">
                      {["Jul","Aug","Sep"].map(m => <span key={m} className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>{m}</span>)}
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
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="py-28" id="features" style={{ background: "#fff" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-xl mb-16">
          <span className="eyebrow mb-4 block">Platform Capabilities</span>
          <h2 className="section-heading mb-5" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            Six capabilities that replace six separate tools.
          </h2>
          <p className="font-man text-base leading-relaxed" style={{ color: "var(--text-muted)" }}>
            DataOmen consolidates your analytics stack into a single, conversational
            interface that your entire organisation can use from day one.
          </p>
        </div>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PILLARS.map((pillar, i) => (
            <div key={pillar.title}
              className={`pillar-card p-7 fade-up ${visible ? "visible" : ""}`}
              style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="flex items-start justify-between mb-5">
                <div className="pillar-icon-wrap w-10 h-10 flex items-center justify-center">
                  {pillar.icon}
                </div>
                <span className="tag">{pillar.tag}</span>
              </div>
              <h3 className="font-man font-bold text-base mb-3 leading-snug" style={{ color: "var(--navy)" }}>
                {pillar.title}
              </h3>
              <p className="font-man text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {pillar.description}
              </p>
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
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const benchmarks = [
    { label: "DataOmen", pct: 95, time: "1.8s", highlight: true },
    { label: "Traditional BI Tool", pct: 38, time: "18s", highlight: false },
    { label: "Spreadsheet Formula", pct: 18, time: "42s", highlight: false },
    { label: "Manual Analysis", pct: 5, time: "3–5 days", highlight: false },
  ];

  return (
    <section className="py-28" style={{ background: "var(--off-white)" }}>
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="eyebrow mb-4 block">Performance</span>
            <h2 className="section-heading mb-5" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
              Query 50 million rows in under 2 seconds.
            </h2>
            <p className="font-man text-base leading-relaxed mb-6" style={{ color: "var(--text-muted)" }}>
              Our in-memory query engine is the same technology powering
              Fortune 500 data teams — now available through a chat interface.
              No infrastructure. No waiting.
            </p>
            <div className="flex flex-wrap gap-2">
              {["50M+ rows supported", "< 2s query time", "99.9% uptime SLA"].map(t => (
                <span key={t} className="tag" style={{ background: "var(--navy)", color: "#fff", borderRadius: "6px", padding: "5px 10px" }}>{t}</span>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {benchmarks.map((b, i) => (
              <div key={b.label} className={`fade-up ${visible ? "visible" : ""}`} style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-man text-sm font-semibold" style={{ color: b.highlight ? "var(--navy)" : "var(--text-muted)" }}>
                    {b.label}
                  </span>
                  <span className="font-mono text-xs" style={{ color: b.highlight ? "var(--blue)" : "var(--text-faint)" }}>
                    {b.time}
                  </span>
                </div>
                <div className="speed-track">
                  <div className="speed-fill" style={{
                    width: visible ? `${b.pct}%` : "0%",
                    background: b.highlight ? "var(--navy)" : "var(--text-faint)",
                    transitionDelay: `${i * 120}ms`,
                  }} />
                </div>
              </div>
            ))}
            <p className="font-mono text-xs pt-1" style={{ color: "var(--text-faint)" }}>
              * Internal benchmarks. Results vary by dataset size.
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
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="py-28 border-y" id="how-it-works" style={{ borderColor: "var(--rule)", background: "#fff" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="eyebrow mb-4 block">Implementation</span>
          <h2 className="section-heading mb-4" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            Operational in three steps.
          </h2>
          <p className="font-man text-base" style={{ color: "var(--text-muted)", maxWidth: "420px", margin: "0 auto" }}>
            DataOmen requires no IT involvement, no data engineering, and no training programme.
          </p>
        </div>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-8 left-1/4 right-1/4 h-px"
            style={{ background: "linear-gradient(90deg, transparent, var(--rule), transparent)", top: "28px" }} />

          {STEPS.map((step, i) => (
            <div key={step.number}
              className={`fade-up ${visible ? "visible" : ""}`}
              style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--navy)", color: "#fff" }}>
                  {step.icon}
                </div>
                <span className="step-num">{step.number}</span>
              </div>
              <h3 className="font-man font-bold text-lg mb-2" style={{ color: "var(--navy)" }}>{step.title}</h3>
              <p className="font-man text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{step.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-14">
          <a href="/register" className="btn-primary inline-flex items-center gap-2 px-8 py-4">
            Begin Free Trial — No Card Required <ArrowRight size={16} />
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
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="py-28" id="testimonials" style={{ background: "var(--off-white)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-14">
          <span className="eyebrow mb-4 block">Customer Outcomes</span>
          <h2 className="section-heading" style={{ fontSize: "clamp(28px, 4vw, 44px)", maxWidth: "520px" }}>
            Real results from revenue teams who switched.
          </h2>
        </div>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={t.name}
              className={`tcard p-7 fade-up ${visible ? "visible" : ""}`}
              style={{ transitionDelay: `${i * 90}ms` }}>
              <div className="flex gap-0.5 mb-5">
                {[...Array(t.stars)].map((_, j) => (
                  <Star key={j} size={13} style={{ fill: "#F59E0B", color: "#F59E0B" }} />
                ))}
              </div>
              <p className="font-lora text-sm leading-relaxed mb-7 italic" style={{ color: "var(--navy)", opacity: 0.75 }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-5 border-t" style={{ borderColor: "var(--rule)" }}>
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--navy)", color: "#fff" }}>
                  <span className="font-man font-bold" style={{ fontSize: 11 }}>
                    {t.name.split(" ").map(n => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <p className="font-man font-semibold text-sm" style={{ color: "var(--navy)" }}>{t.name}</p>
                  <p className="font-man text-xs" style={{ color: "var(--text-muted)" }}>{t.role} · {t.company}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 rounded-xl p-8 border"
          style={{ background: "#fff", borderColor: "var(--rule)" }}>
          {[
            { value: "2,400+", label: "Teams making faster decisions" },
            { value: "< 90 sec", label: "Average time to first insight" },
            { value: "4.9 / 5", label: "Average customer rating" },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <p className="stat-num mb-1">{stat.value}</p>
              <p className="font-man text-sm" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
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
    <section className="py-28 border-y" id="faq" style={{ borderColor: "var(--rule)", background: "#fff" }}>
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-12">
          <span className="eyebrow mb-4 block">FAQ</span>
          <h2 className="section-heading" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            Common questions, direct answers.
          </h2>
        </div>

        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--rule)" }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="faq-row">
              <button
                className="w-full text-left px-7 py-5 flex items-center justify-between gap-4"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                <span className="font-man font-semibold text-sm" style={{ color: "var(--navy)" }}>
                  {item.question}
                </span>
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-transform duration-200"
                  style={{
                    background: openIndex === i ? "var(--navy)" : "var(--off-white)",
                    border: "1.5px solid var(--rule)",
                    transform: openIndex === i ? "rotate(180deg)" : "none",
                  }}>
                  <ChevronDown size={13} style={{ color: openIndex === i ? "#fff" : "var(--text-muted)" }} />
                </div>
              </button>
              {openIndex === i && (
                <div className="px-7 pb-6">
                  <p className="font-man text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {item.answer}
                  </p>
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
  <section className="py-32 grid-bg" style={{ background: "var(--navy)" }}>
    <div className="max-w-3xl mx-auto px-6 text-center">
      <span className="eyebrow mb-6 block" style={{ color: "#93c5e8" }}>
        Begin Today
      </span>
      <h2 className="font-lora font-bold text-white mb-6"
        style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
        Stop running on gut feelings.<br />Start running on evidence.
      </h2>
      <p className="font-man text-base mb-12 mx-auto max-w-md leading-relaxed" style={{ color: "#93c5e8" }}>
        DataOmen is live in 60 seconds. No credit card. No setup call.
        No learning curve. Full platform access from day one.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-12 text-left">
        {[
          "No credit card required",
          "Cancel anytime, no penalties",
          "Full platform access from day one",
          "Onboarding support included",
          "GDPR & SOC 2 Type II compliant",
          "Data never used for AI training",
        ].map(item => (
          <div key={item} className="flex items-start gap-2.5">
            <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "rgba(255,255,255,0.12)" }}>
              <Check size={10} color="#fff" />
            </div>
            <span className="font-man text-sm" style={{ color: "#93c5e8" }}>{item}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a href="/register"
          className="btn-blue w-full sm:w-auto px-10 py-4 inline-flex items-center justify-center gap-2 text-base"
          style={{ fontSize: "16px" }}>
          Start Free Trial <ArrowRight size={17} />
        </a>
        <a href="/login" className="btn-outline w-full sm:w-auto px-8 py-4 inline-flex items-center justify-center text-sm"
          style={{ color: "#93c5e8", borderColor: "rgba(255,255,255,0.15)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.3)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.15)"; }}
        >
          Already have an account? Sign in
        </a>
      </div>
    </div>
  </section>
);

// ─── Footer ───────────────────────────────────────────────────────────────────

const Footer = () => (
  <footer className="py-10 border-t" style={{ background: "#fff", borderColor: "var(--rule)" }}>
    <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "var(--navy)" }}>
          <Database size={13} color="#fff" />
        </div>
        <span className="font-lora font-bold text-sm" style={{ color: "var(--navy)" }}>
          Data<span style={{ color: "var(--blue)" }}>Omen</span>
        </span>
      </div>
      <p className="font-man text-xs" style={{ color: "var(--text-faint)" }}>
        © {new Date().getFullYear()} DataOmen. All rights reserved.
      </p>
      <div className="flex items-center gap-6">
        {["Privacy", "Terms", "Security", "Contact"].map(item => (
          <a key={item} href={`/${item.toLowerCase()}`}
            className="font-man text-xs transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--navy)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
          >{item}</a>
        ))}
      </div>
    </div>
  </footer>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <main>
      <GlobalStyles />
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