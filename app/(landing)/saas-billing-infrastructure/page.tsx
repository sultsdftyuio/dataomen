import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { CTA } from "@/components/landing/cta";

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
    canonical: "https://arcli.com/saas-billing-infrastructure",
  },
  openGraph: {
    title: "Stripe Billing Infrastructure & Idempotent Webhooks | Arcli",
    description: "Protect your SaaS revenue with reliable billing infrastructure. Arcli provides effectively-once webhook processing, distributed locks, and idempotent queues for Stripe.",
    url: "https://arcli.com/saas-billing-infrastructure",
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
            "name": "SaaS Billing Infrastructure",
            "item": "https://arcli.com/saas-billing-infrastructure"
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

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-blue-200/60 font-sans">
      <Navbar />
      
      {/* JSON-LD Schema Injection */}
      <Script
        id="arcli-billing-infra-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-24 sm:pt-40 sm:pb-32">
        {/* 1. HERO SECTION */}
        <header className="mb-24 text-center sm:text-left">
          <div className="inline-block px-3 py-1 mb-6 text-xs font-mono font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
            Stripe Billing Pipeline
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.1]">
            Idempotent Billing Infrastructure <br className="hidden sm:block" />
            <span className="text-blue-700">for Stripe Events.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 leading-relaxed mb-10 max-w-3xl sm:mx-0 mx-auto">
            Arcli turns at-least-once Stripe webhooks into effectively-once execution with idempotency keys, distributed locks, and queue isolation. Built for high-volume subscription systems.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <Link
              href="/calculate-mrr"
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
            >
              Calculate Engineering ROI
            </Link>
            <Link
              href="/docs/architecture"
              className="px-6 py-3 bg-transparent border border-slate-300 text-slate-700 font-semibold rounded-md hover:bg-slate-100 transition-colors"
            >
              Read the Architecture Docs
            </Link>
          </div>
        </header>

        {/* 2. THE PROBLEM (Calm, Factual Narrative) */}
        <section className="mb-24 grid lg:grid-cols-2 gap-8">
          <div className="border border-slate-200 bg-slate-50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Where Standard Queues Break
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Queues like Sidekiq, Celery, or BullMQ are great for best-effort jobs. Stripe webhooks are at-least-once. Without database-level state locks, concurrent retries collide and ordering breaks.
            </p>
            <div className="text-blue-700 font-mono text-sm border-l-2 border-blue-500 pl-4">
              Arcli converts at-least-once webhooks into effectively-once execution.
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Retry Storms Create Duplicate State
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Timeouts trigger automatic retries. If <code>invoice.payment_failed</code> processes twice, customers receive overlapping dunning warnings and support volume spikes.
            </p>
            <div className="text-blue-700 font-mono text-sm border-l-2 border-blue-500 pl-4">
              Arcli isolates billing state to suppress duplicate processing.
            </div>
          </div>
        </section>

        {/* 3. ARCHITECTURE DEEP DIVE (Spaced out jargon) */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Deterministic Execution, By Design
          </h2>
          <p className="text-lg text-slate-600 mb-12 max-w-3xl">
            A simple pipeline: ingest fast, lock state, execute safely, and resume on failure. Designed for subscription platforms running thousands of concurrent billing events.
          </p>

          <div className="grid sm:grid-cols-3 gap-8">
            <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">1. Decoupled Ingestion</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Stripe webhook storms are acknowledged immediately while events move to an isolated queue that shields your primary database from load spikes.
              </p>
            </div>

            <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">2. Distributed Locking</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                We generate idempotency keys from Stripe event metadata and apply a database mutex before any state transition.
              </p>
            </div>

            <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">3. Graceful Degradation</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                External timeouts route the workflow to a dead-letter queue with locks held so retries remain safe.
              </p>
            </div>
          </div>
        </section>

        {/* 4. THE COMMERCIAL REALITY (Build vs. Buy) */}
        <section className="mb-24 bg-slate-50 border border-slate-200 rounded-2xl p-8 sm:p-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">The Economics of Billing Infrastructure</h2>
          <div className="grid sm:grid-cols-2 gap-12">
            <div>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Building a multi-tenant Stripe consumer with strict idempotency and DLQs requires significant engineering time:
              </p>
              <p className="text-slate-600 mb-6 leading-relaxed text-sm">
                Industry benchmarks estimate that many SaaS products lose roughly <strong>1-3% of MRR</strong> to involuntary churn from failed payments. At <strong>$150k MRR</strong>, that is about <strong>$1,500-$4,500/month</strong>, with a midpoint near <strong>$3,750/month</strong> in recoverable revenue.
              </p>
              <ul className="space-y-4 text-slate-700 font-mono text-sm">
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <span>Engineering Time:</span> <span className="text-slate-900">~3 to 4 Sprints</span>
                </li>
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <span>Resource Cost:</span> <span className="text-rose-600">$15,000 - $25,000</span>
                </li>
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <span>Ongoing Maintenance:</span> <span className="text-slate-900">High</span>
                </li>
              </ul>
            </div>
            <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl flex flex-col justify-center">
              <h3 className="text-blue-700 font-bold mb-4 font-mono text-sm">The Payback Window</h3>
              <p className="text-sm text-slate-700 mb-4">While waiting months to build and test internally, a SaaS generating $150k MRR can lose <strong>$1,500-$4,500 each month</strong> from avoidable failed-payment churn.</p>
              <div className="text-xl text-slate-900 font-medium">
                Dedicated infrastructure pays for itself within the first 30 days of recovered MRR.
              </div>
            </div>
          </div>
        </section>

        <section className="mb-24 bg-slate-50 text-slate-900 rounded-2xl p-8 sm:p-12 border border-slate-200">
          <h2 className="text-3xl font-bold mb-8">Operational Snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            <div className="rounded-xl bg-white border border-slate-200 p-4">
              <div className="text-2xl font-bold">1-3%</div>
              <p className="text-xs text-slate-600 mt-1">Typical involuntary churn range</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-4">
              <div className="text-2xl font-bold">$1.5k-$4.5k</div>
              <p className="text-xs text-slate-600 mt-1">Monthly leakage at $150k MRR</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-4">
              <div className="text-2xl font-bold">3-4 sprints</div>
              <p className="text-xs text-slate-600 mt-1">Typical in-house build timeline</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-4">
              <div className="text-2xl font-bold">10 min</div>
              <p className="text-xs text-slate-600 mt-1">Fast webhook ingestion setup</p>
            </div>
          </div>

          <h3 className="text-xl font-bold mb-4">How It Works</h3>
          <div className="grid lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 1</p>
              <p className="font-semibold">Ingest</p>
              <p className="text-sm text-slate-600">Receive Stripe event and verify signature.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 2</p>
              <p className="font-semibold">Lock</p>
              <p className="text-sm text-slate-600">Apply idempotency key and distributed mutex.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 3</p>
              <p className="font-semibold">Process</p>
              <p className="text-sm text-slate-600">Execute deterministic scoring and recovery logic.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 4</p>
              <p className="font-semibold">Recover</p>
              <p className="text-sm text-slate-600">Handle retries safely or route to DLQ if needed.</p>
            </div>
          </div>
        </section>

        {/* 5. CODE SNIPPET (Idempotency Proof) */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">
            State Isolation Example
          </h2>
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-slate-500 mb-4 border-b border-slate-200 pb-2 font-mono text-sm">
              // Arcli Webhook Ingestion & Lock Strategy
            </div>
            <pre className="text-slate-700 font-mono text-sm overflow-x-auto">
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
        <section className="mb-32 bg-slate-50 border border-slate-200 rounded-2xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 text-9xl text-slate-200 font-serif">"</div>
          <blockquote className="relative z-10 text-xl sm:text-2xl font-medium text-slate-700 leading-relaxed mb-8">
            "Before Arcli, our custom webhook ingestion script dropped payloads constantly during Stripe API latency spikes. Arcli replaced that fragile script with stable, observable infrastructure. Our engineers no longer have to debug state mismatches."
          </blockquote>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-full border border-slate-200 flex items-center justify-center font-bold text-blue-700">
              SL
            </div>
            <div>
              <div className="text-slate-900 font-semibold">Staff Engineer</div>
              <div className="text-slate-500 text-sm">Series A SaaS • ~12k Active Subscriptions</div>
            </div>
          </div>
        </section>

        <section className="mb-32">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Capability Comparison</h2>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Capability</th>
                  <th className="px-4 py-3 font-semibold">Generic Queue</th>
                  <th className="px-4 py-3 font-semibold">Arcli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                <tr>
                  <td className="px-4 py-3">Stripe idempotency awareness</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-emerald-600">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Distributed billing locks</td>
                  <td className="px-4 py-3">Manual</td>
                  <td className="px-4 py-3 text-emerald-600">Built-in</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">DLQ handling</td>
                  <td className="px-4 py-3">Partial</td>
                  <td className="px-4 py-3 text-emerald-600">Native</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Revenue attribution</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-emerald-600">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Multi-tenant isolation</td>
                  <td className="px-4 py-3">Manual</td>
                  <td className="px-4 py-3 text-emerald-600">Built-in</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 7. SEMANTIC INTERNAL LINKS */}
        <section className="mb-32 grid sm:grid-cols-2 gap-12 border-t border-slate-200 pt-16">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Deterministic Scoring
            </h2>
            <p className="text-slate-600 leading-relaxed text-sm">
              Once an event is safely ingested and locked, Arcli routes the payload to the <Link href="/saas-churn-risk-scoring" className="text-blue-700 hover:underline">deterministic churn scoring engine</Link>. Recovery workflows trigger on explicit, observable facts.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Dunning Orchestration
            </h2>
            <p className="text-slate-600 leading-relaxed text-sm">
              Effectively-once execution ensures that when a payment fails, the system triggers the appropriate <Link href="/saas-dunning-software" className="text-blue-700 hover:underline">SaaS dunning workflow</Link> with strong safeguards against duplicate recovery messaging.
            </p>
          </div>
        </section>

        {/* 8. FAQ SECTION */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-slate-900 border-b border-slate-200 pb-4 mb-12">
            Infrastructure FAQ
          </h2>
          <div className="grid sm:grid-cols-2 gap-12">
            
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">How does Arcli handle network partitions?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  If an external API experiences a timeout, Arcli gracefully routes the workflow to a dead-letter queue (DLQ) while maintaining the distributed lock. This ensures the revenue recovery attempt is safely retried once the network stabilizes.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">What makes this different from Celery or Sidekiq?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Standard background queues optimize for throughput. Arcli optimizes for state isolation and transactional correctness. We natively handle Stripe payload idempotency, ensuring execution is effectively-once.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">How long does it take to implement?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  You can connect your Stripe webhooks to Arcli's ingestion layer in under 10 minutes. Mapping tenant IDs and activating pre-configured recovery flows typically takes a single afternoon sprint.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Do we need to migrate our database to use Arcli?</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
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