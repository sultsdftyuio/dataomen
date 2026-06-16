import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { CTA } from "@/components/landing/cta";
import { C } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "SaaS Revenue Attribution & Churn Recovery Metrics | Arcli",
  description:
    "Stop guessing your recovery ROI. Arcli provides deterministic SaaS revenue attribution, tracing recovered MRR directly from transactional workflows to paid Stripe invoices.",
  alternates: {
    canonical: "https://arcli.tech/saas-revenue-attribution",
  },
  openGraph: {
    title: "SaaS Revenue Attribution & Churn Recovery Metrics | Arcli",
    description: "Arcli provides deterministic SaaS revenue attribution, tracing recovered MRR directly from transactional workflows to paid Stripe invoices.",
    url: "https://arcli.tech/saas-revenue-attribution",
    siteName: "Arcli",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SaaS Revenue Attribution & Churn Recovery Metrics | Arcli",
    description: "Stop guessing your recovery ROI. Trace recovered MRR deterministically to finalized Stripe billing state.",
  },
};

export default function SaasRevenueAttributionPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": "Arcli Revenue Attribution",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Application",
        "description": "Deterministic SaaS revenue attribution, bridging the gap between transactional workflows and finalized Stripe MRR.",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
        },
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://arcli.tech"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Solutions",
            "item": "https://arcli.tech/solutions"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "SaaS Revenue Attribution",
            "item": "https://arcli.tech/saas-revenue-attribution"
          }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How does Arcli differ from standard CDP attribution?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Generic marketing platforms measure top-of-funnel engagement, such as clicks and opens. Arcli measures finalized financial state by tracing recovery interactions directly to successful Stripe invoice.paid webhooks, eliminating phantom MRR reporting.",
            },
          },
          {
            "@type": "Question",
            "name": "What happens if a user organically renews without interacting with a recovery flow?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Arcli enforces strict, time-bound attribution windows combined with interaction checks. If a user updates their billing information organically without triggering or interacting with a dispatched flow, Arcli does not falsely claim the recovered revenue.",
            },
          },
          {
            "@type": "Question",
            "name": "Can we export this attribution data to our data warehouse?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Arcli maintains immutable audit logs for every state change. Data and Finance teams can export this pipeline into Snowflake, BigQuery, or Redshift for unified ledger reconciliation.",
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
        {/* 1. HERO SECTION */}
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
            Financial Traceability & MRR Attribution
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
            Deterministic Revenue Attribution <br />
            <span style={{ color: C.blue }}>for SaaS Recovery.</span>
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
            Open rates are vanity metrics. Paid invoices are facts. Arcli traces recovered MRR from workflow dispatch to finalized Stripe billing state with explicit attribution windows.
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
              Calculate Recoverable Revenue
            </Link>
            <Link
              href="/docs/attribution"
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
              Explore the Data Model
            </Link>
          </div>
        </header>

        {/* 2. THE PROBLEM (Engagement vs Financial State) */}
        <section
          style={{
            marginBottom: 96,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          <div style={{ border: surfaceBorder, background: C.offWhite, borderRadius: 16, padding: "32px" }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Engagement is Not Revenue
            </h2>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Generic marketing automation platforms are built to measure top-of-funnel engagement—clicks, opens, and page views. But in subscription SaaS, an "opened email" does not equal revenue. If a user clicks a dunning warning but their bank subsequently declines the transaction, marketing tools often falsely claim a "conversion."
            </p>
            <div
              style={{
                color: C.blue,
                fontFamily: "monospace",
                fontSize: 13,
                borderLeft: `2px solid ${C.blue}`,
                paddingLeft: 12,
              }}
            >
              Arcli connects communication data strictly to payment gateway facts.
            </div>
          </div>

          <div style={{ border: surfaceBorder, background: C.offWhite, borderRadius: 16, padding: "32px" }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              The Ledger Reality
            </h2>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              True attribution requires infrastructure that listens to the source of truth. If you cannot tie a specific recovery flow deterministically to a cleared <code>invoice.paid</code> webhook, your financial reporting is built on assumptions. This fragments data between your Growth team and your Finance department.
            </p>
            <div
              style={{
                color: C.blue,
                fontFamily: "monospace",
                fontSize: 13,
                borderLeft: `2px solid ${C.blue}`,
                paddingLeft: 12,
              }}
            >
              Arcli provides finance-grade attribution you can reconcile.
            </div>
          </div>
        </section>

        {/* 3. THE ECONOMICS OF DATA INTEGRITY (Math Hook) */}
        <section style={{ marginBottom: 96, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px" }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 32 }}>The Cost of "Phantom MRR"</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
            <div>
              <p style={{ color: C.navySoft, marginBottom: 24, lineHeight: 1.7 }}>
                When Growth teams rely on engagement-based attribution for retention workflows, they optimize for the wrong metrics. A SaaS company spending $2,000/month on generic retention tools often looks at a dashboard showing "15% Conversion." 
              </p>
              <p style={{ color: C.navySoft, lineHeight: 1.7 }}>
                But when Finance reconciles the Stripe ledger, the actual MRR gained is obscured by double-counting, organic renewals, and false positives.
              </p>
            </div>
            <div
              style={{
                background: C.bluePale,
                border: "1px solid rgba(27,110,191,0.2)",
                padding: 24,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <h3 style={{ color: C.blue, fontWeight: 700, marginBottom: 16, fontFamily: "monospace", fontSize: 13 }}>Deterministic Reconciliation</h3>
              <p style={{ fontSize: 14, color: C.navy, marginBottom: 16, lineHeight: 1.6 }}>
                By proving which workflows resulted in cleared Stripe invoices, teams can optimize for actual ARR.
              </p>
              <div style={{ fontSize: 20, color: C.navy, fontWeight: 600 }}>
                Stop double-counting organic renewals. Prove infrastructure ROI.
              </div>
            </div>
          </div>
        </section>

        {/* 4. THE ATTRIBUTION PIPELINE */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
            The Full-Cycle Attribution Pipeline
          </h2>
          <p style={{ fontSize: 18, color: C.navySoft, marginBottom: 48, maxWidth: 760, lineHeight: 1.7 }}>
            Because our <Link href="/saas-billing-infrastructure" style={{ color: C.blue, textDecoration: "underline" }}>billing infrastructure</Link> strictly locks state, we can trace the exact progression of a customer from failure back to active status.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <div style={{ width: 48, height: 48, flexShrink: 0, background: C.bluePale, border: "1px solid rgba(27,110,191,0.2)", color: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "monospace" }}>1</div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Workflow Dispatch</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
                  Every transactional message is tagged with strict tenant and event identifiers, originating from the rules defined in the <Link href="/saas-churn-risk-scoring" style={{ color: C.blue, textDecoration: "underline" }}>deterministic scoring engine</Link>.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <div style={{ width: 48, height: 48, flexShrink: 0, background: C.bluePale, border: "1px solid rgba(27,110,191,0.2)", color: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "monospace" }}>2</div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Behavioral Re-entry</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>The system observes when the user re-authenticates and updates billing details, tying product analytics to the recovery payload.</p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", padding: 24, background: C.bluePale, border: "1px solid rgba(27,110,191,0.2)", borderRadius: 12 }}>
              <div style={{ width: 48, height: 48, flexShrink: 0, background: C.white, border: "1px solid rgba(27,110,191,0.2)", color: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "monospace" }}>3</div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>State Reconciliation & MRR Logging</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
                  Arcli waits for the absolute source of truth. We only evaluate whether a <Link href="/saas-dunning-software" style={{ color: C.blue, textDecoration: "underline" }}>failed payment</Link> was resolved when the <code>invoice.paid</code> webhook clears. Only then is MRR mapped back to the campaign.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. CODE SNIPPET (Immutable Audit Log) */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 32 }}>
            Built for Engineering and Finance
          </h2>
          <p style={{ color: C.navySoft, marginBottom: 32, maxWidth: 760, lineHeight: 1.7 }}>
            If the VP of Finance asks, "Why are we claiming $12,000 in recovered revenue this month?", your engineering team can export a clean, timestamped pipeline showing the exact progression of every dollar.
          </p>
          <div style={{ padding: 24, background: C.offWhite, border: surfaceBorder, borderRadius: 12 }}>
            <div style={{ color: C.faint, marginBottom: 16, borderBottom: surfaceBorder, paddingBottom: 8, fontFamily: "monospace", fontSize: 12 }}>
              // Arcli Immutable Attribution Audit Trail
            </div>
            <pre style={{ color: C.navySoft, fontFamily: "monospace", fontSize: 13, overflowX: "auto", margin: 0 }}>
{`[
  {
    "timestamp": "2024-05-24T08:01:12Z",
    "event": "stripe.invoice.payment_failed",
    "state": "risk_detected",
    "tenant_mrr": 249.00
  },
  {
    "timestamp": "2024-05-24T08:01:13Z",
    "event": "arcli.workflow.dispatched",
    "campaign_id": "dunning_tier_1",
    "idempotency_key": "req_8f72k_dun1"
  },
  {
    "timestamp": "2024-05-25T14:22:05Z",
    "event": "stripe.invoice.paid",
    "state": "resolved",
    "attribution": {
      "status": "confirmed",
      "recovered_mrr": 249.00,
      "credited_to": "dunning_tier_1"
    }
  }
]`}
            </pre>
          </div>
        </section>

        {/* 6. BELIEVABLE SOCIAL PROOF */}
        <section style={{ marginBottom: 128, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, padding: 32, opacity: 0.1, fontSize: 96, color: C.ruleDark, fontFamily: "serif" }}>
            "
          </div>
          <blockquote style={{ position: "relative", zIndex: 2, fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 500, color: C.navySoft, lineHeight: 1.6, marginBottom: 32 }}>
            "We were double-counting our retention metrics for months because our generic email tool claimed credit for organic renewals. Arcli gave us our first mathematically sound, reliable view of true recovered MRR."
          </blockquote>
          <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.white, borderRadius: "50%", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.blue }}>
              HG
            </div>
            <div>
              <div style={{ color: C.navy, fontWeight: 600 }}>Head of Growth</div>
              <div style={{ color: C.faint, fontSize: 14 }}>B2B Fintech • ~$8M ARR</div>
            </div>
          </div>
        </section>

        {/* 7. FAQ SECTION */}
        <section style={{ marginBottom: 96 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, borderBottom: surfaceBorder, paddingBottom: 16, marginBottom: 48 }}>
            Attribution & Data FAQ
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 48 }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How does Arcli differ from standard CDP attribution?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Generic marketing platforms measure top-of-funnel engagement, such as clicks. Arcli measures finalized financial state by tracing recovery interactions directly to successful Stripe <code>invoice.paid</code> webhooks, eliminating phantom MRR reporting.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Can we export this data to our data warehouse?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Yes. Arcli maintains immutable audit logs for every state change. Data and Finance teams can export this pipeline into Snowflake, BigQuery, or Redshift for unified ledger reconciliation.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>What if a user organically renews?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Arcli enforces strict, time-bound attribution windows combined with interaction checks. If a user updates their billing information organically without triggering or interacting with a dispatched flow, Arcli does not falsely claim the recovered revenue.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Is the attribution model customizable?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Yes. While we default to strict last-touch financial resolution, your data team can adjust attribution windows (e.g., 24 hours vs 7 days) to match your internal finance department's reconciliation logic.
                </p>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* 8. BOTTOM CTA */}
      <CTA />

      <Footer />
    </div>
  );
}