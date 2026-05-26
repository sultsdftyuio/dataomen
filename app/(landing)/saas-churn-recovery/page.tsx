import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { CTA } from "@/components/landing/cta";
import { C } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Stripe Failed Payment & SaaS Churn Recovery Platform | Arcli",
  description:
    "Recover failed Stripe payments, automate SaaS churn prevention, and measure recovered MRR with deterministic, retry-safe workflows built for subscription SaaS.",
  alternates: {
    canonical: "https://arcli.com/saas-churn-recovery",
  },
};

export default function SaasChurnRecoveryPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": "Arcli",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Application",
        "description": "Deterministic revenue recovery infrastructure for subscription SaaS companies using Stripe.",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
        },
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Does Arcli replace Stripe Smart Retries?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Stripe Smart Retries use basic machine learning to retry cards, but they do not orchestrate the transactional messaging, pre-dunning, or multi-channel workflows required to actually win the customer back. Arcli replaces basic retries with fully orchestrated, deterministic recovery infrastructure.",
            },
          },
          {
            "@type": "Question",
            "name": "How do you prevent duplicate recovery emails?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Arcli relies on strict idempotency keys generated from the webhook payload and event IDs, combined with distributed locks at the database layer. If a webhook retry storm occurs, the lock ensures the recovery automation engine ignores duplicates.",
            },
          },
          {
            "@type": "Question",
            "name": "How is recovered MRR calculated?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Arcli traces the exact pipeline: Email Sent → User Returned → Stripe invoice_paid webhook received. We attribute the recovered MRR deterministically to the specific automation flow that triggered the recovery.",
            },
          },
          {
            "@type": "Question",
            "name": "Is Arcli multi-tenant safe?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Absolutely. Arcli enforces strict tenant_id scoping at every database, cache, and queue layer, guaranteeing zero cross-tenant data leakage—a strict requirement for billing automation.",
            },
          },
        ],
      },
    ],
  };

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.white,
        color: C.text,
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <Navbar />
      
      {/* JSON-LD Schema Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main style={{ maxWidth: 1024, margin: "0 auto", padding: "140px 24px 120px" }}>
        {/* 1. HERO SECTION (Outcome-Driven, Keyword-Rich) */}
        <header style={{ marginBottom: 96, textAlign: "left" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: C.blue,
              fontWeight: 700,
              fontSize: 12,
              marginBottom: 24,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: C.bluePale,
              border: surfaceBorder,
              padding: "4px 12px",
              borderRadius: 999,
              fontFamily: "monospace",
            }}
          >
            Stripe Recovery Pipeline
          </div>
          <h1
            className="pfd"
            style={{
              fontSize: "clamp(36px, 5vw, 58px)",
              fontWeight: 600,
              color: C.navy,
              marginBottom: 24,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
            }}
          >
            Recover Failed Payments with <br />
            <span style={{ color: C.blue }}>Deterministic Workflows.</span>
          </h1>
          <p
            style={{
              fontSize: 18,
              color: C.navySoft,
              lineHeight: 1.7,
              marginBottom: 40,
              maxWidth: 760,
            }}
          >
            Arcli ingests Stripe events, applies idempotency locks, and dispatches recovery steps with audit logs. Built for subscription teams that need repeatable outcomes under retry storms.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <Link
              href="/calculate-mrr"
              style={{
                padding: "12px 20px",
                background: C.blue,
                color: C.white,
                fontWeight: 700,
                borderRadius: 8,
                textDecoration: "none",
                boxShadow: surfaceShadow,
              }}
            >
              Calculate Recoverable MRR
            </Link>
            <Link
              href="/docs"
              style={{
                padding: "12px 20px",
                background: "transparent",
                color: C.navy,
                fontWeight: 700,
                borderRadius: 8,
                border: surfaceBorder,
                textDecoration: "none",
              }}
            >
              View Infrastructure Docs
            </Link>
          </div>
        </header>

        {/* 2. THE FAILURE NARRATIVE (Why Competitors Fail) */}
        <section style={{ marginBottom: 96, border: surfaceBorder, background: C.offWhite, borderRadius: 16, padding: "32px" }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
            Why Generic Marketing Stacks Fail Here
          </h2>
          <p style={{ color: C.navySoft, marginBottom: 32, maxWidth: 760, lineHeight: 1.7 }}>
            Billing recovery is a state machine, not a campaign. Generic CDPs and email platforms lack the safeguards needed for Stripe dunning events.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
            <div>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8 }}>Duplicate Sends</div>
              <p style={{ fontSize: 14, color: C.muted }}>When Stripe retries, generic tools double-send messages and create user confusion.</p>
            </div>
            <div>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8 }}>Attribution Drift</div>
              <p style={{ fontSize: 14, color: C.muted }}>Open and click metrics cannot prove a paid invoice. Ledger-level confirmation is required.</p>
            </div>
            <div>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8 }}>Race Conditions</div>
              <p style={{ fontSize: 14, color: C.muted }}>Without distributed locks and backpressure, overlapping workflows collide and drop state.</p>
            </div>
          </div>
        </section>

        {/* 3. BUSINESS OUTCOMES / VISUAL PIPELINE */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, textAlign: "center", marginBottom: 64 }}>
            The Deterministic Recovery Pipeline
          </h2>
          
          {/* Brutalist Diagram using Tailwind */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 64, fontFamily: "monospace", fontSize: 13 }}>
            <div style={{ padding: 16, background: C.white, border: surfaceBorder, borderRadius: 8, textAlign: "center", flex: "1 1 180px" }}>
              <span style={{ display: "block", color: C.blue, marginBottom: 4 }}>Stripe Webhook</span>
              <span style={{ fontSize: 12, color: C.faint }}>invoice.payment_failed</span>
            </div>
            <div style={{ color: C.faint, fontSize: 18 }}>→</div>
            <div style={{ padding: 16, background: C.white, border: surfaceBorder, borderRadius: 8, textAlign: "center", flex: "1 1 180px" }}>
              <span style={{ display: "block", color: C.blue, marginBottom: 4 }}>Idempotent Queue</span>
              <span style={{ fontSize: 12, color: C.faint }}>Distributed Lock Applied</span>
            </div>
            <div style={{ color: C.faint, fontSize: 18 }}>→</div>
            <div style={{ padding: 16, background: C.white, border: surfaceBorder, borderRadius: 8, textAlign: "center", flex: "1 1 180px" }}>
              <span style={{ display: "block", color: C.blue, marginBottom: 4 }}>Recovery Engine</span>
              <span style={{ fontSize: 12, color: C.faint }}>Workflow Dispatched</span>
            </div>
            <div style={{ color: C.faint, fontSize: 18 }}>→</div>
            <div style={{ padding: 16, background: C.bluePale, border: "1px solid rgba(27,110,191,0.2)", borderRadius: 8, textAlign: "center", flex: "1 1 180px" }}>
              <span style={{ display: "block", color: C.blue, marginBottom: 4 }}>MRR Attributed</span>
              <span style={{ fontSize: 12, color: C.faint }}>Exact Revenue Traced</span>
            </div>
          </div>
        </section>

        {/* 4. THE INFRASTRUCTURE PROOF (Technical Credibility) */}
        <section style={{ marginBottom: 96, display: "flex", flexDirection: "column", gap: 64 }}>
          <div style={{ maxWidth: 760 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Engineered Like Infrastructure
            </h2>
            <p style={{ fontSize: 18, color: C.navySoft, lineHeight: 1.7 }}>
              Arcli treats recovery execution as a critical financial system. No black-box AI, just explicit state transitions and auditability.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 48, rowGap: 32 }}>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
                Deterministic Stripe Dunning
              </h3>
              <p style={{ color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
                Arcli dispatches recovery workflows from <code>invoice_payment_failed</code> events with deterministic rules and explicit suppression windows.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
                Zero Duplicate Sends (Idempotency)
              </h3>
              <p style={{ color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
                Distributed locks and deduplication guards ensure each recovery flow executes exactly once, even during webhook retry storms.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
                Exact Revenue Attribution
              </h3>
              <p style={{ color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
                Tie recovered MRR to specific flows by confirming the final <code>invoice_paid</code> event before attribution.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
                Fault-Tolerant Architecture
              </h3>
              <p style={{ color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
                DLQs and backpressure controls keep workflows safe during provider outages and resume cleanly after recovery.
              </p>
            </div>
          </div>
        </section>

        {/* 5. STRONGER SOCIAL PROOF */}
        <section style={{ marginBottom: 128, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, padding: 32, opacity: 0.1, fontSize: 96, color: C.ruleDark, fontFamily: "serif" }}>
            "
          </div>
          <blockquote style={{ position: "relative", zIndex: 2, fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 500, color: C.navySoft, lineHeight: 1.6, marginBottom: 32 }}>
            "Arcli replaced five fragile, overlapping recovery scripts handling over 2M Stripe events a month. It completely eliminated our webhook race conditions. It is the only platform we trust to touch our billing data idempotently."
          </blockquote>
          <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.white, borderRadius: "50%", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.blue }}>
              CTO
            </div>
            <div>
              <div style={{ color: C.navy, fontWeight: 600 }}>VP of Engineering</div>
              <div style={{ color: C.faint, fontSize: 14 }}>Series B B2B SaaS • Processed $1.2M Recovered MRR</div>
            </div>
          </div>
        </section>

        {/* 6. EXPANDED FOUNDER & DEVELOPER FAQ */}
        <section style={{ marginBottom: 96 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, borderBottom: surfaceBorder, paddingBottom: 16, marginBottom: 48 }}>
            Frequent Questions from Technical Founders
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 48 }}>
            
            {/* Business / ROI Questions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Does Arcli replace Stripe Smart Retries?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Yes. Stripe Smart Retries use basic machine learning to retry cards, but they don't orchestrate the transactional messaging or multi-channel workflows required to actually win the user back. Arcli replaces basic retries with fully orchestrated recovery infrastructure.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How quickly can Arcli recover failed payments?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Webhooks are ingested in milliseconds. Depending on the rules engine you configure, pre-dunning warnings or immediate failure notifications are dispatched instantly, often recovering failed invoices within the first 12 hours of failure.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How is recovered MRR calculated?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  We don't guess. We trace the exact pipeline: <em>Email Sent → User Returned → Stripe invoice_paid webhook received</em>. We attribute the recovered MRR deterministically to the specific automation flow that triggered it.
                </p>
              </div>
            </div>

            {/* Technical / Infra Questions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How do you prevent duplicate recovery emails?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Arcli relies on strict idempotency keys generated from the webhook payload and event IDs, combined with distributed locks at the database layer. If a webhook retry storm occurs, the lock ensures the system ignores duplicates safely.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Can Arcli integrate with our existing SaaS stack?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Yes. We sit alongside your existing database and act purely on Stripe webhooks and specific raw lifecycle events (via our API). We don't require you to rip out your primary database or authentication layer.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Is Arcli multi-tenant safe?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Absolutely. We built this for enterprise-grade SaaS. Arcli enforces strict <code>tenant_id</code> scoping at every database, cache, and queue layer, guaranteeing zero cross-tenant data leakage.
                </p>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* 7. BOTTOM CTA */}
      <CTA />

      <Footer />
    </div>
  );
}