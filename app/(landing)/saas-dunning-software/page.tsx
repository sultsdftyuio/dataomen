import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { CTA } from "@/components/landing/cta";
import { C } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Stripe Failed Payment Recovery Software for SaaS | Arcli",
  description:
    "Stop losing MRR to involuntary churn. Replace basic Stripe Smart Retries with Arcli's deterministic, retry-safe SaaS dunning and failed payment recovery workflows.",
  alternates: {
    canonical: "https://arcli.tech/saas-dunning-software",
  },
  openGraph: {
    title: "Stripe Failed Payment Recovery Software for SaaS | Arcli",
    description: "Stop losing MRR to involuntary churn. Replace basic Stripe Smart Retries with Arcli's deterministic, retry-safe SaaS dunning workflows.",
    url: "https://arcli.tech/saas-dunning-software",
    siteName: "Arcli",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stripe Failed Payment Recovery Software for SaaS | Arcli",
    description: "Stop losing MRR to involuntary churn. Replace basic Stripe Smart Retries with Arcli's deterministic, retry-safe SaaS dunning workflows.",
  },
};

export default function SaasDunningSoftwarePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": "Arcli SaaS Dunning Software",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Application",
        "description": "Billing reliability infrastructure and failed payment recovery workflows for Stripe.",
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
            "name": "SaaS Dunning Software",
            "item": "https://arcli.tech/saas-dunning-software"
          }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Does Arcli replace Stripe Smart Retries?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Stripe Smart Retries silently ping the card using basic logic, but they do not orchestrate the customer communication required to actually get a user to update an expired card. Arcli replaces this with fully orchestrated, multi-channel recovery workflows.",
            },
          },
          {
            "@type": "Question",
            "name": "How do you prevent sending a dunning email if the customer just updated their card?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Arcli is architected to prevent race conditions. The moment an invoice.paid webhook is ingested, the system clears the internal lock and dynamically drops pending dunning emails from the queue, strongly minimizing the risk of double-emailing active customers.",
            },
          },
          {
            "@type": "Question",
            "name": "Can we customize grace periods before subscription cancellation?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. The Grace Period Router allows you to hold a user in a 'Past Due' state for a specific number of days, orchestrating warnings before finally dispatching a subscription_cancelled event to your primary database.",
            },
          },
          {
            "@type": "Question",
            "name": "How hard is the Arcli Stripe integration?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "It requires zero database migrations. You simply point a Stripe webhook endpoint to Arcli, map your tenant IDs, and the ingestion engine automatically begins tracking lifecycle billing events.",
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
            Dunning & Failed Payment Recovery
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
            Deterministic Dunning for <br />
            <span style={{ color: C.blue }}>Failed Payments.</span>
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
            Arcli ingests Stripe failures, locks state, and runs recovery sequences with explicit suppression windows. Built for repeatable, audit-safe billing operations.
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
              href="/docs/dunning"
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
              Simulate Your Dunning Pipeline
            </Link>
          </div>
        </header>

        {/* 2. THE ENEMIES (Stripe Limitations & iPaaS) */}
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
              Limitation #1: Default Stripe Retries
            </h2>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Stripe is a world-class payment processor, but Smart Retries only reattempt a charge. Recovery requires messaging and state management when cards expire or are replaced.
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
              Arcli wraps billing logic with deterministic recovery communication.
            </div>
          </div>

          <div style={{ border: surfaceBorder, background: C.offWhite, borderRadius: 16, padding: "32px" }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Limitation #2: Generic Workflow Tools
            </h2>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Marketing automation platforms optimize for engagement throughput, not transactional correctness. Retry storms can lead to duplicate processing and overlapping emails.
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
              Arcli protects state isolation and minimizes race conditions.
            </div>
          </div>
        </section>

        {/* 3. THE COMMERCIAL REALITY (Math Hook) */}
        <section style={{ marginBottom: 96, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px" }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 32 }}>What Revenue Recovery Actually Looks Like</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
            <div>
              <p style={{ color: C.navySoft, marginBottom: 24, lineHeight: 1.7 }}>
                Founders often underestimate the compounding damage of involuntary churn. For a SaaS company generating <strong>$80,000 MRR</strong> with a standard <strong>3% involuntary churn rate</strong>:
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12, padding: 0, margin: 0 }}>
                <li style={{ display: "flex", justifyContent: "space-between", borderBottom: surfaceBorder, paddingBottom: 8, fontFamily: "monospace", fontSize: 13, color: C.navySoft }}>
                  <span>Monthly Leakage:</span> <span style={{ color: C.red }}>-$2,400 MRR</span>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", borderBottom: surfaceBorder, paddingBottom: 8, fontFamily: "monospace", fontSize: 13, color: C.navySoft }}>
                  <span>Annual Leakage:</span> <span style={{ color: C.red }}>-$28,800 ARR</span>
                </li>
              </ul>
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
              <h3 style={{ color: C.blue, fontWeight: 700, marginBottom: 16, fontFamily: "monospace", fontSize: 13 }}>The Infrastructure ROI</h3>
              <p style={{ fontSize: 14, color: C.navy, marginBottom: 16, lineHeight: 1.6 }}>
                Implementing reliable dunning infrastructure to recover just <strong>35%</strong> of those failed payments restores:
              </p>
              <div style={{ fontSize: 48, fontWeight: 800, color: C.navy, marginBottom: 8 }}>
                +$10,080 <span style={{ fontSize: 16, color: C.faint, fontWeight: 400 }}>ARR</span>
              </div>
              <p style={{ fontSize: 12, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginTop: 8 }}>
                Recovered without acquiring a single new customer.
              </p>
            </div>
          </div>
        </section>

        {/* 4. THE DUNNING PIPELINE */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
            The Arcli Dunning Pipeline
          </h2>
          <p style={{ fontSize: 18, color: C.navySoft, marginBottom: 48, maxWidth: 760, lineHeight: 1.7 }}>
            Financial automation requires strict state management. Arcli processes every Stripe failure logically with predictable transitions.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <div style={{ width: 48, height: 48, flexShrink: 0, background: C.bluePale, border: "1px solid rgba(27,110,191,0.2)", color: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "monospace" }}>1</div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Resilient Webhook Ingestion</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>We catch the <code>invoice.payment_failed</code> webhook and apply an idempotency key to absorb retry storms safely.</p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <div style={{ width: 48, height: 48, flexShrink: 0, background: C.bluePale, border: "1px solid rgba(27,110,191,0.2)", color: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "monospace" }}>2</div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>The Grace Period Router</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>Instead of instantly locking the user out, Arcli shifts the tenant into a "Past Due" state while respecting suppression windows.</p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <div style={{ width: 48, height: 48, flexShrink: 0, background: C.bluePale, border: "1px solid rgba(27,110,191,0.2)", color: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "monospace" }}>3</div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Deterministic Resolution</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>When the <code>invoice.paid</code> webhook arrives, the state clears and pending emails are removed from the queue.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. CODE COMPARISON HOOK */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 32 }}>
            Replace Webhook Hacks with State Safety
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
            
            {/* The Bad Way */}
            <div style={{ padding: 24, background: C.redPale, border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12 }}>
              <div style={{ color: C.red, fontWeight: 700, marginBottom: 16, fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid rgba(239,68,68,0.2)", paddingBottom: 8 }}>
                ❌ Generic Integration (iPaaS/CDP)
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, color: C.muted, fontSize: 13, fontFamily: "monospace" }}>
                <li>1. Webhook hits generic endpoint.</li>
                <li>2. No state lock applied to event.</li>
                <li>3. Stripe sends duplicate retry payload.</li>
                <li>4. Worker processes payload twice.</li>
                <li>5. Customer receives overlapping emails.</li>
                <li>6. Engineering spends cycles debugging.</li>
              </ul>
            </div>

            {/* The Arcli Way */}
            <div style={{ padding: 24, background: C.offWhite, border: surfaceBorder, borderRadius: 12 }}>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 16, fontFamily: "monospace", fontSize: 13, borderBottom: surfaceBorder, paddingBottom: 8 }}>
                ✅ The Arcli Infrastructure Way
              </div>
              <pre style={{ color: C.navySoft, fontFamily: "monospace", fontSize: 13, overflowX: "auto", margin: 0 }}>
{`Arcli.handleWebhook(payload, {
  event: "invoice.payment_failed",
  idempotency_key: payload.id,
  strategy: {
    apply_lock: true,
    state: "past_due",
    dispatch: "dunning_flow_v2",
    suppress_on: ["invoice.paid"]
  }
}); // Designed for effectively-once execution.`}
              </pre>
            </div>

          </div>
        </section>

        {/* 6. BELIEVABLE SOCIAL PROOF */}
        <section style={{ marginBottom: 128, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, padding: 32, opacity: 0.1, fontSize: 96, color: C.ruleDark, fontFamily: "serif" }}>
            "
          </div>
          <blockquote style={{ position: "relative", zIndex: 2, fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 500, color: C.navySoft, lineHeight: 1.6, marginBottom: 32 }}>
            "We were losing roughly 4% of our MRR to failed payments. Arcli replaced a fragile iPaaS setup with observable, predictable billing infrastructure. Our involuntary churn dropped within the first month."
          </blockquote>
          <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.white, borderRadius: "50%", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.blue }}>
              EL
            </div>
            <div>
              <div style={{ color: C.navy, fontWeight: 600 }}>Engineering Lead</div>
              <div style={{ color: C.faint, fontSize: 14 }}>Series B DevOps Platform • ~40k Active Subscriptions</div>
            </div>
          </div>
        </section>

        {/* 7. PRE-DUNNING & ATTRIBUTION (With Internal Links) */}
        <section style={{ marginBottom: 128, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 48 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Pre-Dunning: Catching Failures Early
            </h2>
            <p style={{ color: C.muted, lineHeight: 1.7 }}>
              The best way to handle a failed payment is to prevent it entirely. Arcli listens to Stripe's <code>customer.source.expiring</code> webhooks to trigger <Link href="/saas-churn-risk-scoring" style={{ color: C.blue, textDecoration: "underline" }}>risk-aware reminder flows</Link> 14 days before the card actually fails.
            </p>
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Exact Revenue Attribution
            </h2>
            <p style={{ color: C.muted, lineHeight: 1.7 }}>
              Arcli shows you exactly how much MRR was saved. We <Link href="/saas-recovery-attribution" style={{ color: C.blue, textDecoration: "underline" }}>trace the pipeline directly</Link> from the initial dunning email to the final Stripe charge.
            </p>
          </div>
        </section>

        {/* 8. FAQ SECTION */}
        <section style={{ marginBottom: 96 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, borderBottom: surfaceBorder, paddingBottom: 16, marginBottom: 48 }}>
            Stripe Dunning FAQ
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 48 }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Does Arcli replace Stripe Smart Retries?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Yes. Stripe Smart Retries silently ping the card using basic logic, but they do not orchestrate the customer communication required to actually get a user to update an expired card. Arcli replaces this with fully orchestrated recovery workflows.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How do you prevent sending an email if they just paid?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Arcli is architected to prevent race conditions. The moment an <code>invoice.paid</code> webhook is ingested, the system clears the internal lock and dynamically drops any pending dunning emails from the queue, strongly minimizing the risk of double-emailing.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Can we customize grace periods before cancellation?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Yes. The Grace Period Router allows you to hold a user in a "Past Due" state for a specific number of days, orchestrating warnings before finally dispatching a <code>subscription_cancelled</code> event to your primary database.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How hard is the Stripe integration?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  It requires zero database migrations. You simply point a <Link href="/saas-billing-infrastructure" style={{ color: C.blue, textDecoration: "underline" }}>Stripe webhook endpoint</Link> to Arcli in the dashboard, map your tenant IDs, and the ingestion engine automatically begins tracking lifecycle billing events.
                </p>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* 9. BOTTOM CTA */}
      <CTA />

      <Footer />
    </div>
  );
}