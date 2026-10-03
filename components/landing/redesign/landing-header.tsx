"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  FileText,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import Logo from "@/components/ui/logo";
import { freeBriefHref, normalizeWebsite } from "./website-link";

const tabs = [
  { label: "Understand", title: "Start with your website", icon: FileText },
  { label: "Find", title: "Check fitting accounts", icon: Search },
  { label: "Review", title: "Decide what to act on", icon: ShieldCheck },
];

const nav = [
  { label: "Product", href: "#product" },
  { label: "Evidence", href: "#evidence" },
  { label: "Workflow", href: "#workflow" },
  { label: "Standards", href: "#standards" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

function BriefPreview({ onNext }: { onNext: () => void }) {
  return (
    <div className="ah-demo-grid">
      <div className="ah-demo-panel">
        <div className="ah-url">
          https:// <strong>yourcompany.com</strong>
        </div>
        <div className="ah-demo-status">
          <span className="ah-status-dot" /> Website understood{" "}
          <span>01 / Understand</span>
        </div>
        <div className="ah-progress">
          <span />
        </div>
        <div className="ah-fact">
          Offer, in plain terms <small>/product</small>
        </div>
        <div className="ah-fact">
          Who appears to buy it <small>/customers</small>
        </div>
        <div className="ah-fact">
          The problem your pages describe <small>/home</small>
        </div>
        <div className="ah-fact ah-fact-unclear">
          Pricing model <small>unclear · you confirm</small>
        </div>
      </div>
      <div className="ah-demo-panel ah-brief">
        <div className="ah-panel-head">
          <strong>Targeting brief</strong>
          <span className="ah-badge ah-badge-amber">Draft</span>
        </div>
        <div className="ah-panel-body">
          <div>
            <span className="ah-mini-label">Buyer roles</span>
            <div className="ah-chips">
              <span>Head of Operations</span>
              <span>Founder</span>
              <span>RevOps lead</span>
            </div>
          </div>
          <div>
            <span className="ah-mini-label">Accounts</span>
            <p>B2B software · 20–200 staff</p>
          </div>
          <div>
            <span className="ah-mini-label">Exclusions</span>
            <div className="ah-chips ah-chips-red">
              <span>Agencies</span>
              <span>Existing customers</span>
            </div>
          </div>
          <div className="ah-demo-actions">
            <button
              type="button"
              className="ah-button ah-button-small"
              onClick={onNext}
            >
              Approve brief
            </button>
            <span>You stay in control of the brief.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearchPreview({ onNext }: { onNext: () => void }) {
  const rows = [
    [
      "Northlane",
      "Official product page + public request",
      "Buyer-intent signal",
      "blue",
    ],
    ["Kestrel", "Dated team expansion", "Timely prospect", "amber"],
    [
      "Example software company",
      "Product fact matches approved brief",
      "High-fit prospect",
      "green",
    ],
    ["Out-of-scope agency", "Excluded by your brief", "Excluded", "neutral"],
  ];
  return (
    <div className="ah-research">
      <div className="ah-demo-status">
        <span className="ah-status-dot" /> Checked against your approved brief{" "}
        <span>permitted sources only</span>
      </div>
      <div className="ah-table">
        <div className="ah-table-head">
          <span>Account</span>
          <span>Evidence found</span>
          <span>Label</span>
        </div>
        {rows.map(([name, evidence, label, tone]) => (
          <div className="ah-table-row" key={name}>
            <strong>{name}</strong>
            <span>{evidence}</span>
            <span className={`ah-badge ah-badge-${tone}`}>{label}</span>
          </div>
        ))}
      </div>
      <div className="ah-research-foot">
        <span>Shortfalls are reported, not filled with weak accounts.</span>
        <button type="button" onClick={onNext}>
          Open a prospect file <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function ReviewPreview() {
  return (
    <div className="ah-demo-grid ah-review-grid">
      <div className="ah-demo-panel ah-review-card">
        <div className="ah-panel-head">
          <strong>Example software company</strong>
          <span className="ah-badge ah-badge-green">High-fit</span>
        </div>
        <div className="ah-panel-body">
          <span className="ah-mini-label">Why it fits</span>
          <p>
            A cited product fact matches the offer and account criteria in your
            approved brief.
          </p>
          <span className="ah-mini-label">Source</span>
          <p className="ah-source-link">
            example.com/product ↗ <small>checked Oct 1, 2026</small>
          </p>
          <span className="ah-mini-label">How to act</span>
          <p>Use the documented workflow as a specific opening angle.</p>
          <span className="ah-mini-label">Still unknown</span>
          <p>Current tooling budget. No recent buying signal observed.</p>
        </div>
      </div>
      <div className="ah-demo-panel ah-source-preview">
        <div className="ah-panel-head">
          <span className="ah-mono">example.com/product</span>
          <span className="ah-mini-label">Fit source</span>
        </div>
        <div className="ah-panel-body">
          <h3>Built for operations teams</h3>
          <p>
            Teams use the workflow builder to{" "}
            <mark>route approvals across departments.</mark> It connects with
            the tools your team already uses.
          </p>
          <div className="ah-source-rule" />
          <div className="ah-source-rule short" />
          <span className="ah-source-confirm">
            <Check size={14} /> Route checked · contact page
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingHeader() {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  function submitWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeWebsite(website);
    if (!normalized) {
      setError("Enter a valid website, such as yourcompany.com.");
      return;
    }
    setError("");
    router.push(freeBriefHref(normalized));
  }

  return (
    <div className="ah-top-wrap" id="product">
      <nav className="ah-nav" aria-label="Main navigation">
        <Link href="/" aria-label="Arcli home" className="ah-brand">
          <Logo />
        </Link>
        <div className="ah-nav-links">
          {nav.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
        <div className="ah-nav-actions">
          <Link href="/login" className="ah-signin">
            Sign in
          </Link>
          <Link href="/pilot" className="ah-button ah-button-small">
            Request a Coverage Review
          </Link>
        </div>
        <button
          type="button"
          className="ah-mobile-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      {menuOpen && (
        <div className="ah-mobile-menu">
          {nav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <Link href="/login">Sign in</Link>
          <Link href="/pilot">Request a Coverage Review</Link>
        </div>
      )}
      <header className="ah-hero">
        <div className="ah-hero-glow" aria-hidden="true" />
        <div className="ah-hero-copy">
          <h1>
            Know who to reach out to.
            <br />
            Know <em>why.</em>
          </h1>
          <p>
            Start with your website. Arcli helps shape your targeting brief,
            then researches prospects with source-linked facts, a reason they
            fit, and a practical next step.
          </p>
          <form onSubmit={submitWebsite} className="ah-hero-form">
            <label className="sr-only" htmlFor="hero-website">
              Your company website
            </label>
            <span>https://</span>
            <input
              id="hero-website"
              value={website}
              onChange={(event) => {
                setWebsite(event.target.value);
                setError("");
              }}
              placeholder="yourcompany.com"
              autoComplete="url"
            />
            <button type="submit" className="ah-button">
              Build a Free Brief <ArrowRight size={16} />
            </button>
          </form>
          {error && (
            <p className="ah-form-error" role="alert">
              {error}
            </p>
          )}
          <div className="ah-hero-notes">
            <span>Free brief on every plan</span>
            <span>No mass messaging</span>
          </div>
          <Link href="/pilot" className="ah-hero-link">
            Request a Coverage Review <ArrowRight size={14} />
          </Link>
        </div>
        <div className="ah-showcase">
          <div
            className="ah-demo-tabs"
            role="tablist"
            aria-label="Product walkthrough"
          >
            {tabs.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="tab"
                  aria-selected={tab === index}
                  onClick={() => setTab(index)}
                  className={tab === index ? "active" : ""}
                >
                  <Icon size={16} />
                  <span>
                    <b>
                      0{index + 1} / {item.label}
                    </b>
                    <small>{item.title}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="ah-frame"
            role="tabpanel"
            aria-label={`${tabs[tab].label} preview`}
          >
            <div className="ah-frame-bar">
              <Logo iconOnly />
              <span className="ah-frame-nav">Brief</span>
              <span className="ah-frame-nav">Discovery</span>
              <span className="ah-frame-nav">Prospects</span>
              <span className="ah-badge ah-badge-neutral">Illustrative</span>
              <span className="ah-avatar">YC</span>
            </div>
            <div className="ah-frame-content">
              {tab === 0 ? (
                <BriefPreview onNext={() => setTab(1)} />
              ) : tab === 1 ? (
                <ResearchPreview onNext={() => setTab(2)} />
              ) : (
                <ReviewPreview />
              )}
            </div>
          </div>
          <div className="ah-showcase-caption">
            Explore the example workspace. Every prospect file keeps its source
            and limits visible.
          </div>
        </div>
      </header>
    </div>
  );
}
