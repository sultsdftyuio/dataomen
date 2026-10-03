"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, ShieldCheck } from "lucide-react";

import Logo from "@/components/ui/logo";
import { freeBriefHref, normalizeWebsite, pilotHref } from "./website-link";

const freeFeatures = [
  "Learn from one website",
  "Review and edit your matching brief",
  "Prepare one buyer and problem profile",
  "Standard email support",
];
const proFeatures = [
  "Ongoing search across supported public sources",
  "Source-linked conversation review queue",
  "Buyer groups and reusable matching criteria",
  "Refresh your brief as your product evolves",
];
const faqs = [
  [
    "What do I need to get started?",
    "Start with your website. Arcli drafts your offer and likely audience for you to review. You approve the target accounts, buyer roles, and exclusions before a founding pilot begins.",
  ],
  [
    "What is the founding prospect pilot?",
    "It is a separately scoped, service-assisted prospect feed for selected markets. We check source coverage and agree on targeting, delivery scope, and price before starting. Pilot access is separate from the $35 Pro plan.",
  ],
  [
    "Does every prospect have a recent buying signal?",
    "No. We label direct buyer intent, timely opportunities, and high-fit prospects separately. A high-fit account can be useful without a fresh event, and its file says when no recent buying signal was observed.",
  ],
  [
    "Does Arcli automate cold outreach?",
    "No. Arcli helps you find and understand useful opportunities. It does not send mass messages, read your inbox, or make outreach decisions for you.",
  ],
  [
    "Is there a weekly prospect guarantee?",
    "There is no general weekly-volume promise. We assess your market and agree on realistic scope before a pilot starts, then report shortfalls rather than filling a target with weak accounts.",
  ],
];

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="ac-feature-list">
      {items.map((item) => (
        <li key={item}>
          <Check size={16} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Pricing() {
  return (
    <section className="ac-pricing" id="pricing">
      <div className="ah-container">
        <div className="ac-pricing-heading">
          <span className="ah-eyebrow">Ways to start</span>
          <h2>Start with a brief. Choose the research path that fits.</h2>
          <p>
            Free helps shape your buyer brief. Pro scans supported public
            conversations. A separately scoped founding pilot adds reviewed
            account research after a coverage check.
          </p>
        </div>
        <div className="ac-pricing-grid">
          <article className="ac-price-card">
            <span className="ah-badge ah-badge-neutral">Free</span>
            <h3>Prepare your brief.</h3>
            <p>
              Let Arcli read your public website, then correct its picture of
              your offer and buyer. Free does not search public conversations.
            </p>
            <div className="ac-price">
              <strong>$0</strong>
              <span>/ forever</span>
            </div>
            <FeatureList items={freeFeatures} />
            <Link
              href={freeBriefHref()}
              className="ac-price-action ac-price-outline"
            >
              Build free brief <ArrowRight size={16} />
            </Link>
          </article>
          <article className="ac-price-card ac-pro-card">
            <span className="ah-badge ah-badge-blue">Pro</span>
            <h3>Scan public conversations.</h3>
            <p>
              Review matched public discussions with source context. Useful
              results vary by market and source coverage.
            </p>
            <div className="ac-price">
              <strong>$35</strong>
              <span>/ month</span>
              <small>Cancel any time.</small>
            </div>
            <FeatureList items={proFeatures} />
            <Link
              href="/register?next=%2Fsettings%3Fupgrade%3Dpro"
              className="ac-price-action ah-button"
            >
              Explore Pro <ArrowRight size={16} />
            </Link>
            <div className="ac-pro-note">
              <ShieldCheck size={15} /> No commission on revenue
            </div>
          </article>
        </div>
        <Link className="ac-pilot-strip" href="/pilot">
          <span>
            <small>Founding prospect pilot</small>
            <strong>A reviewed prospect feed for a defined market.</strong>
            <span>
              Coverage, targeting, delivery scope, and price are agreed before
              the pilot begins.
            </span>
          </span>
          <b>
            Request coverage review <ArrowRight size={17} />
          </b>
        </Link>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="ac-faq" id="faq">
      <div className="ah-container ac-faq-grid">
        <div>
          <span className="ah-eyebrow">FAQ</span>
          <h2>Questions before you start.</h2>
          <p>
            Still unsure whether your market is a fit? A coverage review answers
            that before any commitment.
          </p>
          <Link href="/pilot">
            Request a Coverage Review <ArrowRight size={15} />
          </Link>
        </div>
        <div className="ac-faq-list">
          {faqs.map(([question, answer], index) => (
            <div className="ac-faq-item" key={question}>
              <button
                type="button"
                aria-expanded={open === index}
                aria-controls={`ac-faq-answer-${index}`}
                onClick={() => setOpen(open === index ? null : index)}
              >
                {question}
                <ChevronDown
                  size={18}
                  className={open === index ? "open" : ""}
                />
              </button>
              {open === index && <p id={`ac-faq-answer-${index}`}>{answer}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoverageCta() {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const normalized = normalizeWebsite(website);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized) {
      setError("Enter a valid website, such as yourcompany.com.");
      return;
    }
    setError("");
    router.push(pilotHref(normalized));
  }

  return (
    <section className="ac-cta" id="cta">
      <div className="ac-cta-box">
        <div className="ac-cta-inner">
          <h2>Find out what your market can support.</h2>
          <p>
            Tell us what you sell and who you want to reach. We’ll assess
            coverage before discussing a reviewed prospect pilot.
          </p>
          <form onSubmit={submit} className="ac-cta-form">
            <label className="sr-only" htmlFor="coverage-website">
              Your company website
            </label>
            <span>https://</span>
            <input
              id="coverage-website"
              value={website}
              onChange={(event) => {
                setWebsite(event.target.value);
                setError("");
              }}
              placeholder="yourcompany.com"
              autoComplete="url"
            />
            <button type="submit">
              Request a Review <ArrowRight size={16} />
            </button>
          </form>
          {error && (
            <span className="ac-cta-error" role="alert">
              {error}
            </span>
          )}
          {normalized ? (
            <div className="ac-cta-preview">
              <div>
                <strong>Coverage review</strong>
                <small>{new URL(normalized).hostname}</small>
                <span>Preview</span>
              </div>
              <div className="ac-cta-preview-grid">
                <span>
                  <b>Offer</b>Drafted from your site
                </span>
                <span>
                  <b>Sources</b>Coverage checked first
                </span>
                <span>
                  <b>Buyers</b>You confirm them
                </span>
                <span>
                  <b>Volume</b>Reported honestly
                </span>
              </div>
            </div>
          ) : (
            <small>Type your website to preview what we’ll review.</small>
          )}
          <div className="ac-cta-notes">
            <span>No obligation to apply</span>
            <span>Scope agreed before payment</span>
            <span>Human-reviewed pilot</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="ac-footer">
      <div className="ah-container ac-footer-grid">
        <div className="ac-footer-brand">
          <Link href="/" aria-label="Arcli home">
            <Logo />
          </Link>
          <p>Evidence-backed prospect research for B2B founders.</p>
        </div>
        <div>
          <strong>Product</strong>
          <a href="#evidence">Prospect file</a>
          <a href="#workflow">Workflow</a>
          <a href="#standards">Standards</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div>
          <strong>Start</strong>
          <Link href="/pilot">Coverage review</Link>
          <Link href={freeBriefHref()}>Free brief</Link>
          <a href="#faq">FAQ</a>
        </div>
        <div>
          <strong>Legal</strong>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/security">Security</Link>
        </div>
      </div>
      <div className="ah-container ac-footer-bottom">
        <span>© {new Date().getFullYear()} Arcli · arcli.tech</span>
        <span>Results vary by market and source coverage.</span>
      </div>
    </footer>
  );
}

export function LandingConversion() {
  return (
    <>
      <Pricing />
      <Faq />
      <CoverageCta />
      <LandingFooter />
    </>
  );
}
