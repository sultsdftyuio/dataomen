import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { CTA } from "@/components/landing/cta";
import { C } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Stripe Billing Infrastructure & Idempotent Webhooks | Arcli",
  description:
    "Protect your SaaS revenue with reliable billing infrastructure. Arcli provides effectively-once webhook processing, distributed locks, and idempotent queues for Stripe.",
  keywords: [
    "Stripe webhooks",
    "idempotent webhook processing",
    "SaaS billing infrastructure",
    "Stripe retry handling",
    "distributed locking",
    "effectively-once execution",
    "Stripe dunning infrastructure",
    "dead-letter queues",
    "billing state machine",
  ],
  alternates: {
    canonical: "https://arcli.tech/saas-billing-infrastructure",
  },
  openGraph: {
    title: "Stripe Billing Infrastructure & Idempotent Webhooks | Arcli",
    description: "Protect your SaaS revenue with reliable billing infrastructure. Arcli provides effectively-once webhook processing, distributed locks, and idempotent queues for Stripe.",
    url: "https://arcli.tech/saas-billing-infrastructure",
    siteName: "Arcli",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stripe Billing Infrastructure & Idempotent Webhooks | Arcli",
    description: "Protect your SaaS revenue with reliable billing infrastructure. Designed for effectively-once webhook execution.",
  },
};

export default function SaasBillingInfrastructurePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": "Arcli Billing Infrastructure",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Application",
        "description": "Idempotent webhook processing and effectively-once execution queues for Stripe billing events.",
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
            "name": "SaaS Billing Infrastructure",
            "item": "https://arcli.tech/saas-billing-infrastructure"
          }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How does Arcli handle network partitions during recovery flows?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "If an external API (like an email provider) experiences a timeout, Arcli gracefully routes the workflow to a dead-letter queue (DLQ) while maintaining the distributed lock. This prevents the worker from dropping the payload and ensures the revenue recovery attempt can be safely retried once the network stabilizes.",
            },
          },
          {
            "@type": "Question",
            "name": "What makes Arcli different from our existing Celery or Sidekiq queues?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Standard background queues optimize for throughput. Arcli optimizes for state isolation and transactional correctness. We natively handle Stripe payload idempotency, ensuring that even under severe webhook retry conditions, financial communications are executed effectively-once.",
            },
          },
          {
            "@type": "Question",
            "name": "How long does it take to implement this infrastructure?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "You can connect your Stripe webhooks to Arcli's ingestion layer in under 10 minutes. Mapping tenant IDs and activating pre-configured dunning flows typically takes a single afternoon sprint.",
            },
          },
          {
            "@type": "Question",
            "name": "Do we need to migrate our database to use Arcli?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. Arcli acts as an external state machine that sits alongside your existing stack. We do not require you to migrate your primary Postgres or auth layers.",
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
      <Script
        id="arcli-billing-infra-schema"
        type="application/ld+json"
        strategy="afterInteractive"
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
            Stripe Billing Pipeline
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
            Idempotent Billing Infrastructure <br />
            <span style={{ color: C.blue }}>for Stripe Events.</span>
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
            Arcli turns at-least-once Stripe webhooks into effectively-once execution with idempotency keys, distributed locks, and queue isolation. Built for high-volume subscription systems.
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
              Calculate Engineering ROI
            </Link>
            <Link
              href="/docs/architecture"
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
              Read the Architecture Docs
            </Link>
          </div>
        </header>

        {/* 2. THE PROBLEM (Calm, Factual Narrative) */}
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
              Where Standard Queues Break
            </h2>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Queues like Sidekiq, Celery, or BullMQ are great for best-effort jobs. Stripe webhooks are at-least-once. Without database-level state locks, concurrent retries collide and ordering breaks.
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
              Arcli converts at-least-once webhooks into effectively-once execution.
            </div>
          </div>

          <div style={{ border: surfaceBorder, background: C.offWhite, borderRadius: 16, padding: "32px" }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Retry Storms Create Duplicate State
            </h2>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Timeouts trigger automatic retries. If <code>invoice.payment_failed</code> processes twice, customers receive overlapping dunning warnings and support volume spikes.
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
              Arcli isolates billing state to suppress duplicate processing.
            </div>
          </div>
        </section>

        {/* 3. ARCHITECTURE DEEP DIVE (Spaced out jargon) */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
            Deterministic Execution, By Design
          </h2>
          <p style={{ fontSize: 18, color: C.navySoft, marginBottom: 48, maxWidth: 760, lineHeight: 1.7 }}>
            A simple pipeline: ingest fast, lock state, execute safely, and resume on failure. Designed for subscription platforms running thousands of concurrent billing events.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            <div style={{ padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>1. Decoupled Ingestion</h3>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
                Stripe webhook storms are acknowledged immediately while events move to an isolated queue that shields your primary database from load spikes.
              </p>
            </div>

            <div style={{ padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>2. Distributed Locking</h3>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
                We generate idempotency keys from Stripe event metadata and apply a database mutex before any state transition.
              </p>
            </div>

            <div style={{ padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>3. Graceful Degradation</h3>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
                External timeouts route the workflow to a dead-letter queue with locks held so retries remain safe.
              </p>
            </div>
          </div>
        </section>

        {/* 4. THE COMMERCIAL REALITY (Build vs. Buy) */}
        <section style={{ marginBottom: 96, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px" }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 32 }}>The Economics of Billing Infrastructure</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
            <div>
              <p style={{ color: C.navySoft, marginBottom: 24, lineHeight: 1.7 }}>
                Building a multi-tenant Stripe consumer with strict idempotency and DLQs requires significant engineering time:
              </p>
              <p style={{ color: C.navySoft, marginBottom: 24, lineHeight: 1.7, fontSize: 14 }}>
                Industry benchmarks estimate that many SaaS products lose roughly <strong>1-3% of MRR</strong> to involuntary churn from failed payments. At <strong>$150k MRR</strong>, that is about <strong>$1,500-$4,500/month</strong>, with a midpoint near <strong>$3,750/month</strong> in recoverable revenue.
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12, padding: 0, margin: 0 }}>
                <li style={{ display: "flex", justifyContent: "space-between", borderBottom: surfaceBorder, paddingBottom: 8, fontFamily: "monospace", fontSize: 13, color: C.navySoft }}>
                  <span>Engineering Time:</span> <span style={{ color: C.navy }}>~3 to 4 Sprints</span>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", borderBottom: surfaceBorder, paddingBottom: 8, fontFamily: "monospace", fontSize: 13, color: C.navySoft }}>
                  <span>Resource Cost:</span> <span style={{ color: C.red }}>$15,000 - $25,000</span>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", borderBottom: surfaceBorder, paddingBottom: 8, fontFamily: "monospace", fontSize: 13, color: C.navySoft }}>
                  <span>Ongoing Maintenance:</span> <span style={{ color: C.navy }}>High</span>
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
              <h3 style={{ color: C.blue, fontWeight: 700, marginBottom: 16, fontFamily: "monospace", fontSize: 13 }}>The Payback Window</h3>
              <p style={{ fontSize: 14, color: C.navy, marginBottom: 16, lineHeight: 1.6 }}>
                While waiting months to build and test internally, a SaaS generating $150k MRR can lose <strong>$1,500-$4,500 each month</strong> from avoidable failed-payment churn.
              </p>
              <div style={{ fontSize: 20, color: C.navy, fontWeight: 600 }}>
                Dedicated infrastructure pays for itself within the first 30 days of recovered MRR.
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 96, background: C.offWhite, color: C.navy, borderRadius: 16, padding: "32px", border: surfaceBorder }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 32 }}>Operational Snapshot</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 40 }}>
            <div style={{ borderRadius: 12, background: C.white, border: surfaceBorder, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>1-3%</div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Typical involuntary churn range</p>
            </div>
            <div style={{ borderRadius: 12, background: C.white, border: surfaceBorder, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>$1.5k-$4.5k</div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Monthly leakage at $150k MRR</p>
            </div>
            <div style={{ borderRadius: 12, background: C.white, border: surfaceBorder, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>3-4 sprints</div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Typical in-house build timeline</p>
            </div>
            <div style={{ borderRadius: 12, background: C.white, border: surfaceBorder, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>10 min</div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Fast webhook ingestion setup</p>
            </div>
          </div>

          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>How It Works</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div style={{ background: C.white, border: surfaceBorder, borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, fontFamily: "monospace", color: C.faint, marginBottom: 6 }}>Step 1</p>
              <p style={{ fontWeight: 600 }}>Ingest</p>
              <p style={{ fontSize: 14, color: C.muted }}>Receive Stripe event and verify signature.</p>
            </div>
            <div style={{ background: C.white, border: surfaceBorder, borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, fontFamily: "monospace", color: C.faint, marginBottom: 6 }}>Step 2</p>
              <p style={{ fontWeight: 600 }}>Lock</p>
              <p style={{ fontSize: 14, color: C.muted }}>Apply idempotency key and distributed mutex.</p>
            </div>
            <div style={{ background: C.white, border: surfaceBorder, borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, fontFamily: "monospace", color: C.faint, marginBottom: 6 }}>Step 3</p>
              <p style={{ fontWeight: 600 }}>Process</p>
              <p style={{ fontSize: 14, color: C.muted }}>Execute deterministic scoring and recovery logic.</p>
            </div>
            <div style={{ background: C.white, border: surfaceBorder, borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, fontFamily: "monospace", color: C.faint, marginBottom: 6 }}>Step 4</p>
              <p style={{ fontWeight: 600 }}>Recover</p>
              <p style={{ fontSize: 14, color: C.muted }}>Handle retries safely or route to DLQ if needed.</p>
            </div>
          </div>
        </section>

        {/* 5. CODE SNIPPET (Idempotency Proof) */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 32 }}>
            State Isolation Example
          </h2>
          <div style={{ padding: 24, background: C.offWhite, border: surfaceBorder, borderRadius: 12 }}>
            <div style={{ color: C.faint, marginBottom: 16, borderBottom: surfaceBorder, paddingBottom: 8, fontFamily: "monospace", fontSize: 12 }}>
              // Arcli Webhook Ingestion & Lock Strategy
            </div>
            <pre style={{ color: C.navySoft, fontFamily: "monospace", fontSize: 13, overflowX: "auto", margin: 0 }}>
{`export async function handleStripeEvent(req, res) {
  // 1. Ingest & verify signature instantly
  const event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
  
  // 2. Generate a stable key from event id with request metadata when present
  const idempotencyKey = event.request?.id
    ? \`req_\${event.request.id}_\${event.id}\`
    : \`evt_\${event.id}\`;

  // 3. Attempt to acquire distributed database lock
  const lockAcquired = await Arcli.Mutex.acquire(idempotencyKey, { timeout: 5000 });
  
  if (!lockAcquired) {
    // 4. Safely ignore retry storms if worker is already executing
    return res.status(200).send("State locked. Duplicate suppressed.");
  }

  // 5. Route to deterministic scoring engine safely
  await Arcli.Worker.dispatch(event);
  
  return res.status(200).send("Acknowledged");
}`}
            </pre>
          </div>
        </section>

        {/* 6. BELIEVABLE SOCIAL PROOF */}
        <section style={{ marginBottom: 128, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, padding: 32, opacity: 0.1, fontSize: 96, color: C.ruleDark, fontFamily: "serif" }}>
            "
          </div>
          <blockquote style={{ position: "relative", zIndex: 2, fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 500, color: C.navySoft, lineHeight: 1.6, marginBottom: 32 }}>
            "Before Arcli, our custom webhook ingestion script dropped payloads constantly during Stripe API latency spikes. Arcli replaced that fragile script with stable, observable infrastructure. Our engineers no longer have to debug state mismatches."
          </blockquote>
          <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.white, borderRadius: "50%", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.blue }}>
              SL
            </div>
            <div>
              <div style={{ color: C.navy, fontWeight: 600 }}>Staff Engineer</div>
              <div style={{ color: C.faint, fontSize: 14 }}>Series A SaaS • ~12k Active Subscriptions</div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 24 }}>Capability Comparison</h2>
          <div style={{ overflowX: "auto", border: surfaceBorder, borderRadius: 12 }}>
            <table style={{ width: "100%", textAlign: "left", fontSize: 13, borderCollapse: "collapse" }}>
              <thead style={{ background: C.offWhite, color: C.navySoft }}>
                <tr>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Capability</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Generic Queue</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Arcli</th>
                </tr>
              </thead>
              <tbody style={{ color: C.navySoft }}>
                <tr>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>Stripe idempotency awareness</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>No</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder, color: C.green, fontWeight: 600 }}>Yes</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>Distributed billing locks</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>Manual</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder, color: C.green, fontWeight: 600 }}>Built-in</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>DLQ handling</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>Partial</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder, color: C.green, fontWeight: 600 }}>Native</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>Revenue attribution</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>No</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder, color: C.green, fontWeight: 600 }}>Yes</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>Multi-tenant isolation</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder }}>Manual</td>
                  <td style={{ padding: "12px 16px", borderTop: surfaceBorder, color: C.green, fontWeight: 600 }}>Built-in</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 7. SEMANTIC INTERNAL LINKS */}
        <section
          style={{
            marginBottom: 128,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 48,
            borderTop: surfaceBorder,
            paddingTop: 64,
          }}
        >
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Deterministic Scoring
            </h2>
            <p style={{ color: C.muted, lineHeight: 1.7, fontSize: 14 }}>
              Once an event is safely ingested and locked, Arcli routes the payload to the <Link href="/saas-churn-risk-scoring" style={{ color: C.blue, textDecoration: "underline" }}>deterministic churn scoring engine</Link>. Recovery workflows trigger on explicit, observable facts.
            </p>
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Dunning Orchestration
            </h2>
            <p style={{ color: C.muted, lineHeight: 1.7, fontSize: 14 }}>
              Effectively-once execution ensures that when a payment fails, the system triggers the appropriate <Link href="/saas-dunning-software" style={{ color: C.blue, textDecoration: "underline" }}>SaaS dunning workflow</Link> with strong safeguards against duplicate recovery messaging.
            </p>
          </div>
        </section>

        {/* 8. FAQ SECTION */}
        <section style={{ marginBottom: 96 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, borderBottom: surfaceBorder, paddingBottom: 16, marginBottom: 48 }}>
            Infrastructure FAQ
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 48 }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How does Arcli handle network partitions?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  If an external API experiences a timeout, Arcli gracefully routes the workflow to a dead-letter queue (DLQ) while maintaining the distributed lock. This ensures the revenue recovery attempt is safely retried once the network stabilizes.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>What makes this different from Celery or Sidekiq?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Standard background queues optimize for throughput. Arcli optimizes for state isolation and transactional correctness. We natively handle Stripe payload idempotency, ensuring execution is effectively-once.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How long does it take to implement?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  You can connect your Stripe webhooks to Arcli's ingestion layer in under 10 minutes. Mapping tenant IDs and activating pre-configured recovery flows typically takes a single afternoon sprint.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Do we need to migrate our database to use Arcli?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  No. Arcli acts as an external state machine that sits alongside your existing stack. We do not require you to migrate your primary Postgres, user tables, or auth layers.
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