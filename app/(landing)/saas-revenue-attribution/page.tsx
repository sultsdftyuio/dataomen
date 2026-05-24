import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { BrutalistCTA } from "@/components/landing/brutalist-cta";

export const metadata: Metadata = {
  title: "SaaS Revenue Attribution & Churn Recovery Metrics | Arcli",
  description:
    "Stop guessing your recovery ROI. Arcli provides deterministic SaaS revenue attribution, tracing recovered MRR directly from transactional workflows to paid Stripe invoices.",
  alternates: {
    canonical: "https://arcli.com/saas-revenue-attribution",
  },
  openGraph: {
    title: "SaaS Revenue Attribution & Churn Recovery Metrics | Arcli",
    description: "Arcli provides deterministic SaaS revenue attribution, tracing recovered MRR directly from transactional workflows to paid Stripe invoices.",
    url: "https://arcli.com/saas-revenue-attribution",
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
            "item": "https://arcli.com"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Solutions",
            "item": "https://arcli.com/solutions"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "SaaS Revenue Attribution",
            "item": "https://arcli.com/saas-revenue-attribution"
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

  return (
    <div className="min-h-screen bg-black text-slate-200 selection:bg-indigo-500/30 font-sans">
      <Navbar />
      
      {/* JSON-LD Schema Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-24 sm:pt-40 sm:pb-32">
        {/* 1. HERO SECTION */}
        <header className="mb-24 text-center sm:text-left">
          <div className="inline-block px-3 py-1 mb-6 text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            Financial Traceability & MRR Attribution
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
            Deterministic Revenue Attribution <br className="hidden sm:block" />
            <span className="text-indigo-400">for SaaS Recovery.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 leading-relaxed mb-10 max-w-3xl sm:mx-0 mx-auto">
            Open rates are vanity metrics. Paid invoices are facts. Arcli traces recovered MRR directly from automated workflows to finalized Stripe billing state, giving you absolute financial traceability.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <Link
              href="/calculate-mrr"
              className="px-6 py-3 bg-white text-black font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              Calculate Recoverable Revenue
            </Link>
            <Link
              href="/docs/attribution"
              className="px-6 py-3 bg-transparent border border-slate-700 text-white font-semibold rounded-md hover:bg-slate-900 transition-colors"
            >
              Explore the Data Model
            </Link>
          </div>
        </header>

        {/* 2. THE PROBLEM (Engagement vs Financial State) */}
        <section className="mb-24 grid lg:grid-cols-2 gap-8">
          <div className="border border-slate-800 bg-slate-900/50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-white mb-4">
              Engagement is Not Revenue
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Generic marketing automation platforms are built to measure top-of-funnel engagement—clicks, opens, and page views. But in subscription SaaS, an "opened email" does not equal revenue. If a user clicks a dunning warning but their bank subsequently declines the transaction, marketing tools often falsely claim a "conversion."
            </p>
            <div className="text-indigo-400 font-mono text-sm border-l-2 border-indigo-500 pl-4">
              Arcli connects communication data strictly to payment gateway facts.
            </div>
          </div>

          <div className="border border-slate-800 bg-slate-900/50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-white mb-4">
              The Ledger Reality
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              True attribution requires infrastructure that listens to the source of truth. If you cannot tie a specific recovery flow deterministically to a cleared <code>invoice.paid</code> webhook, your financial reporting is built on assumptions. This fragments data between your Growth team and your Finance department.
            </p>
            <div className="text-indigo-400 font-mono text-sm border-l-2 border-indigo-500 pl-4">
              Arcli provides mathematically sound ROI that satisfies the VP of Finance.
            </div>
          </div>
        </section>

        {/* 3. THE ECONOMICS OF DATA INTEGRITY (Math Hook) */}
        <section className="mb-24 bg-gradient-to-br from-slate-900 to-black border border-slate-800 rounded-2xl p-8 sm:p-12">
          <h2 className="text-3xl font-bold text-white mb-8">The Cost of "Phantom MRR"</h2>
          <div className="grid sm:grid-cols-2 gap-12">
            <div>
              <p className="text-slate-400 mb-6 leading-relaxed">
                When Growth teams rely on engagement-based attribution for retention workflows, they optimize for the wrong metrics. A SaaS company spending $2,000/month on generic retention tools often looks at a dashboard showing "15% Conversion." 
              </p>
              <p className="text-slate-400 leading-relaxed">
                But when Finance reconciles the Stripe ledger, the actual MRR gained is obscured by double-counting, organic renewals, and false positives.
              </p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-xl flex flex-col justify-center">
              <h3 className="text-emerald-400 font-bold mb-4 font-mono text-sm">Deterministic Reconciliation</h3>
              <p className="text-sm text-slate-300 mb-4">By proving exactly which workflows resulted in cleared Stripe invoices, engineering and growth teams can ruthlessly optimize for actual ARR.</p>
              <div className="text-xl text-white font-medium">
                Stop double-counting organic renewals. Prove absolute infrastructure ROI.
              </div>
            </div>
          </div>
        </section>

        {/* 4. THE ATTRIBUTION PIPELINE */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-white mb-4">
            The Full-Cycle Attribution Pipeline
          </h2>
          <p className="text-lg text-slate-400 mb-12 max-w-3xl">
            Because our <Link href="/saas-billing-infrastructure" className="text-indigo-400 hover:underline">billing infrastructure</Link> strictly locks state, we can trace the exact progression of a customer from failure back to active status.
          </p>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start p-6 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="w-12 h-12 shrink-0 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-full flex items-center justify-center font-bold font-mono">1</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Workflow Dispatch</h3>
                <p className="text-slate-400 text-sm">Every transactional message is tagged with strict tenant and event identifiers, originating from the rules defined in the <Link href="/saas-churn-risk-scoring" className="text-indigo-400 hover:underline">deterministic scoring engine</Link>.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-start p-6 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="w-12 h-12 shrink-0 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-full flex items-center justify-center font-bold font-mono">2</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Behavioral Re-entry</h3>
                <p className="text-slate-400 text-sm">The system observes when the user re-authenticates and updates their billing module, tying product analytics to the specific recovery payload.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-start p-6 bg-emerald-900/20 border border-emerald-900/50 rounded-lg">
              <div className="w-12 h-12 shrink-0 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full flex items-center justify-center font-bold font-mono">3</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">State Reconciliation & MRR Logging</h3>
                <p className="text-slate-400 text-sm">Arcli waits for the absolute source of truth. We only evaluate whether a <Link href="/saas-dunning-software" className="text-indigo-400 hover:underline">failed payment</Link> was successfully resolved the moment the <code>invoice.paid</code> webhook clears. Only then is the exact MRR mapped back to the campaign.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. CODE SNIPPET (Immutable Audit Log) */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-white mb-8">
            Built for Engineering and Finance
          </h2>
          <p className="text-slate-400 mb-8 max-w-3xl">
            If the VP of Finance asks, "Why are we claiming $12,000 in recovered revenue this month?", your engineering team can export a clean, timestamped pipeline showing the exact progression of every dollar.
          </p>
          <div className="p-6 bg-[#0d1117] border border-slate-800 rounded-lg">
            <div className="text-slate-500 mb-4 border-b border-slate-800 pb-2 font-mono text-sm">
              // Arcli Immutable Attribution Audit Trail
            </div>
            <pre className="text-slate-300 font-mono text-sm overflow-x-auto">
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
        <section className="mb-32 bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl text-white font-serif">"</div>
          <blockquote className="relative z-10 text-xl sm:text-2xl font-medium text-slate-300 leading-relaxed mb-8">
            "We were double-counting our retention metrics for months because our generic email tool claimed credit for organic renewals. Arcli gave us our first mathematically sound, reliable view of true recovered MRR."
          </blockquote>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center font-bold text-emerald-400">
              HG
            </div>
            <div>
              <div className="text-white font-semibold">Head of Growth</div>
              <div className="text-slate-500 text-sm">B2B Fintech • ~$8M ARR</div>
            </div>
          </div>
        </section>

        {/* 7. FAQ SECTION */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-white border-b border-slate-800 pb-4 mb-12">
            Attribution & Data FAQ
          </h2>
          <div className="grid sm:grid-cols-2 gap-12">
            
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How does Arcli differ from standard CDP attribution?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Generic marketing platforms measure top-of-funnel engagement, such as clicks. Arcli measures finalized financial state by tracing recovery interactions directly to successful Stripe <code>invoice.paid</code> webhooks, eliminating phantom MRR reporting.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Can we export this data to our data warehouse?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Yes. Arcli maintains immutable audit logs for every state change. Data and Finance teams can export this pipeline into Snowflake, BigQuery, or Redshift for unified ledger reconciliation.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">What if a user organically renews?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Arcli enforces strict, time-bound attribution windows combined with interaction checks. If a user updates their billing information organically without triggering or interacting with a dispatched flow, Arcli does not falsely claim the recovered revenue.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Is the attribution model customizable?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Yes. While we default to strict last-touch financial resolution, your data team can adjust attribution windows (e.g., 24 hours vs 7 days) to match your internal finance department's reconciliation logic.
                </p>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* 8. BOTTOM CTA */}
      <BrutalistCTA 
        title="Stop guessing your recovery ROI."
        subtitle="Implement infrastructure that proves its value in raw, reconciled MRR."
        primaryActionText="Calculate Recoverable Revenue"
        primaryActionUrl="/calculate-mrr"
      />

      <Footer />
    </div>
  );
}