import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { CTA } from "@/components/landing/cta";

export const metadata: Metadata = {
  title: "Stripe Failed Payment Recovery Software for SaaS | Arcli",
  description:
    "Stop losing MRR to involuntary churn. Replace basic Stripe Smart Retries with Arcli's deterministic, retry-safe SaaS dunning and failed payment recovery workflows.",
  alternates: {
    canonical: "https://arcli.com/saas-dunning-software",
  },
  openGraph: {
    title: "Stripe Failed Payment Recovery Software for SaaS | Arcli",
    description: "Stop losing MRR to involuntary churn. Replace basic Stripe Smart Retries with Arcli's deterministic, retry-safe SaaS dunning workflows.",
    url: "https://arcli.com/saas-dunning-software",
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
            "name": "SaaS Dunning Software",
            "item": "https://arcli.com/saas-dunning-software"
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

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-blue-200/60 font-sans">
      <Navbar />
      
      {/* JSON-LD Schema Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-24 sm:pt-40 sm:pb-32">
        {/* 1. HERO SECTION */}
        <header className="mb-24 text-center sm:text-left">
          <div className="inline-block px-3 py-1 mb-6 text-xs font-mono font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
            Dunning & Failed Payment Recovery
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.1]">
            Deterministic Dunning for <br className="hidden sm:block" />
            <span className="text-blue-700">Failed Payments.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 leading-relaxed mb-10 max-w-3xl sm:mx-0 mx-auto">
            Arcli ingests Stripe failures, locks state, and runs recovery sequences with explicit suppression windows. Built for repeatable, audit-safe billing operations.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <Link
              href="/calculate-mrr"
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
            >
              Calculate Recoverable Revenue
            </Link>
            <Link
              href="/docs/dunning"
              className="px-6 py-3 bg-transparent border border-slate-300 text-slate-700 font-semibold rounded-md hover:bg-slate-100 transition-colors"
            >
              Simulate Your Dunning Pipeline
            </Link>
          </div>
        </header>

        {/* 2. THE ENEMIES (Stripe Limitations & iPaaS) */}
        <section className="mb-24 grid lg:grid-cols-2 gap-8">
          <div className="border border-slate-200 bg-slate-50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Limitation #1: Default Stripe Retries
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Stripe is a world-class payment processor, but Smart Retries only reattempt a charge. Recovery requires messaging and state management when cards expire or are replaced.
            </p>
            <div className="text-blue-700 font-mono text-sm border-l-2 border-blue-500 pl-4">
              Arcli wraps billing logic with deterministic recovery communication.
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Limitation #2: Generic Workflow Tools
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Marketing automation platforms optimize for engagement throughput, not transactional correctness. Retry storms can lead to duplicate processing and overlapping emails.
            </p>
            <div className="text-blue-700 font-mono text-sm border-l-2 border-blue-500 pl-4">
              Arcli protects state isolation and minimizes race conditions.
            </div>
          </div>
        </section>

        {/* 3. THE COMMERCIAL REALITY (Math Hook) */}
        <section className="mb-24 bg-slate-50 border border-slate-200 rounded-2xl p-8 sm:p-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">What Revenue Recovery Actually Looks Like</h2>
          <div className="grid sm:grid-cols-2 gap-12">
            <div>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Founders often underestimate the compounding damage of involuntary churn. For a SaaS company generating <strong>$80,000 MRR</strong> with a standard <strong>3% involuntary churn rate</strong>:
              </p>
              <ul className="space-y-4 text-slate-700 font-mono text-sm">
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <span>Monthly Leakage:</span> <span className="text-rose-600">-$2,400 MRR</span>
                </li>
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <span>Annual Leakage:</span> <span className="text-rose-600">-$28,800 ARR</span>
                </li>
              </ul>
            </div>
            <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl flex flex-col justify-center">
              <h3 className="text-blue-700 font-bold mb-4 font-mono text-sm">The Infrastructure ROI</h3>
              <p className="text-sm text-slate-700 mb-4">Implementing reliable dunning infrastructure to recover just <strong>35%</strong> of those failed payments restores:</p>
              <div className="text-5xl font-extrabold text-slate-900 mb-2">+$10,080 <span className="text-lg text-slate-500 font-normal">ARR</span></div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-2">Recovered without acquiring a single new customer.</p>
            </div>
          </div>
        </section>

        {/* 4. THE DUNNING PIPELINE */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            The Arcli Dunning Pipeline
          </h2>
          <p className="text-lg text-slate-600 mb-12 max-w-3xl">
            Financial automation requires strict state management. Arcli processes every Stripe failure logically with predictable transitions.
          </p>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start p-6 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="w-12 h-12 shrink-0 bg-blue-50 border border-blue-200 text-blue-700 rounded-full flex items-center justify-center font-bold font-mono">1</div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Resilient Webhook Ingestion</h3>
                <p className="text-slate-600 text-sm">We catch the <code>invoice.payment_failed</code> webhook and apply an idempotency key to absorb retry storms safely.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-start p-6 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="w-12 h-12 shrink-0 bg-blue-50 border border-blue-200 text-blue-700 rounded-full flex items-center justify-center font-bold font-mono">2</div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">The Grace Period Router</h3>
                <p className="text-slate-600 text-sm">Instead of instantly locking the user out, Arcli shifts the tenant into a "Past Due" state while respecting suppression windows.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-start p-6 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="w-12 h-12 shrink-0 bg-blue-50 border border-blue-200 text-blue-700 rounded-full flex items-center justify-center font-bold font-mono">3</div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Deterministic Resolution</h3>
                <p className="text-slate-600 text-sm">When the <code>invoice.paid</code> webhook arrives, the state clears and pending emails are removed from the queue.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. CODE COMPARISON HOOK */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">
            Replace Webhook Hacks with State Safety
          </h2>
          <div className="grid lg:grid-cols-2 gap-8">
            
            {/* The Bad Way */}
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-lg">
              <div className="text-rose-600 font-bold mb-4 font-mono text-sm border-b border-rose-200 pb-2">
                ❌ Generic Integration (iPaaS/CDP)
              </div>
              <ul className="text-slate-600 text-sm space-y-3 font-mono">
                <li>1. Webhook hits generic endpoint.</li>
                <li>2. No state lock applied to event.</li>
                <li>3. Stripe sends duplicate retry payload.</li>
                <li>4. Worker processes payload twice.</li>
                <li>5. Customer receives overlapping emails.</li>
                <li>6. Engineering spends cycles debugging.</li>
              </ul>
            </div>

            {/* The Arcli Way */}
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-blue-700 font-bold mb-4 font-mono text-sm border-b border-slate-200 pb-2">
                ✅ The Arcli Infrastructure Way
              </div>
              <pre className="text-slate-700 font-mono text-sm overflow-x-auto">
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
        <section className="mb-32 bg-slate-50 border border-slate-200 rounded-2xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 text-9xl text-slate-200 font-serif">"</div>
          <blockquote className="relative z-10 text-xl sm:text-2xl font-medium text-slate-700 leading-relaxed mb-8">
            "We were losing roughly 4% of our MRR to failed payments. Arcli replaced a fragile iPaaS setup with observable, predictable billing infrastructure. Our involuntary churn dropped within the first month."
          </blockquote>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-full border border-slate-200 flex items-center justify-center font-bold text-blue-700">
              EL
            </div>
            <div>
              <div className="text-slate-900 font-semibold">Engineering Lead</div>
              <div className="text-slate-500 text-sm">Series B DevOps Platform • ~40k Active Subscriptions</div>
            </div>
          </div>
        </section>

        {/* 7. PRE-DUNNING & ATTRIBUTION (With Internal Links) */}
        <section className="mb-32 grid sm:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Pre-Dunning: Catching Failures Early
            </h2>
            <p className="text-slate-600 leading-relaxed">
              The best way to handle a failed payment is to prevent it entirely. Arcli listens to Stripe's <code>customer.source.expiring</code> webhooks to trigger <Link href="/saas-churn-risk-scoring" className="text-blue-700 hover:underline">risk-aware reminder flows</Link> 14 days before the card actually fails.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Exact Revenue Attribution
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Arcli shows you exactly how much MRR was saved. We <Link href="/saas-recovery-attribution" className="text-blue-700 hover:underline">trace the pipeline directly</Link> from the initial dunning email to the final Stripe charge.
            </p>
          </div>
        </section>

        {/* 8. FAQ SECTION */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-slate-900 border-b border-slate-200 pb-4 mb-12">
            Stripe Dunning FAQ
          </h2>
          <div className="grid sm:grid-cols-2 gap-12">
            
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Does Arcli replace Stripe Smart Retries?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Yes. Stripe Smart Retries silently ping the card using basic logic, but they do not orchestrate the customer communication required to actually get a user to update an expired card. Arcli replaces this with fully orchestrated recovery workflows.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">How do you prevent sending an email if they just paid?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Arcli is architected to prevent race conditions. The moment an <code>invoice.paid</code> webhook is ingested, the system clears the internal lock and dynamically drops any pending dunning emails from the queue, strongly minimizing the risk of double-emailing.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Can we customize grace periods before cancellation?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Yes. The Grace Period Router allows you to hold a user in a "Past Due" state for a specific number of days, orchestrating warnings before finally dispatching a <code>subscription_cancelled</code> event to your primary database.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">How hard is the Stripe integration?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  It requires zero database migrations. You simply point a <Link href="/saas-billing-infrastructure" className="text-blue-700 hover:underline">Stripe webhook endpoint</Link> to Arcli in the dashboard, map your tenant IDs, and the ingestion engine automatically begins tracking lifecycle billing events.
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