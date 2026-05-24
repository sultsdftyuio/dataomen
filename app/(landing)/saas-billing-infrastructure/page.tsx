import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { BrutalistCTA } from "@/components/landing/brutalist-cta";

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
    <div className="min-h-screen bg-black text-slate-200 selection:bg-indigo-500/30 font-sans">
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
          <div className="inline-block px-3 py-1 mb-6 text-xs font-mono font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            Idempotent Webhook Processing
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
            Reliable Billing Infrastructure <br className="hidden sm:block" />
            <span className="text-indigo-400">for SaaS Revenue Recovery.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 leading-relaxed mb-10 max-w-3xl sm:mx-0 mx-auto">
            Standard background queues optimize for throughput. Arcli optimizes for transactional correctness. Protect your MRR with infrastructure designed for effectively-once execution under severe webhook retry conditions.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <Link
              href="/calculate-mrr"
              className="px-6 py-3 bg-white text-black font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              Calculate Engineering ROI
            </Link>
            <Link
              href="/docs/architecture"
              className="px-6 py-3 bg-transparent border border-slate-700 text-white font-semibold rounded-md hover:bg-slate-900 transition-colors"
            >
              Read the Architecture Docs
            </Link>
          </div>
        </header>

        {/* 2. THE PROBLEM (Calm, Factual Narrative) */}
        <section className="mb-24 grid lg:grid-cols-2 gap-8">
          <div className="border border-slate-800 bg-slate-900/50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-white mb-4">
              The Limits of Standard Queues
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Background workers like Sidekiq, Celery, or BullMQ are incredible tools for sending newsletters or processing images. However, Stripe webhooks utilize probabilistic, "at-least-once" delivery. If a standard queue lacks strict, database-level locking tied to billing state, concurrent retries will cause race conditions.
            </p>
            <div className="text-indigo-400 font-mono text-sm border-l-2 border-indigo-500 pl-4">
              Arcli converts at-least-once webhooks into effectively-once execution.
            </div>
          </div>

          <div className="border border-slate-800 bg-slate-900/50 rounded-2xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-white mb-4">
              The Reality of Retry Storms
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              When endpoints time out, Stripe automatically re-transmits payloads. If your infrastructure processes an <code>invoice.payment_failed</code> payload multiple times, your customers receive duplicate, overlapping dunning warnings. This breaks user trust and generates unnecessary support tickets.
            </p>
            <div className="text-indigo-400 font-mono text-sm border-l-2 border-indigo-500 pl-4">
              Arcli is architected to isolate state, strongly minimizing duplicate processing.
            </div>
          </div>
        </section>

        {/* 3. ARCHITECTURE DEEP DIVE (Spaced out jargon) */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-white mb-4">
            Architected for Effectively-Once Execution
          </h2>
          <p className="text-lg text-slate-400 mb-12 max-w-3xl">
            We built Arcli to handle financial events safely, allowing your engineering team to focus on core product features instead of debugging webhook anomalies. Built for high-volume subscription platforms handling thousands of concurrent billing events.
          </p>

          <div className="grid sm:grid-cols-3 gap-8">
            <div className="p-8 bg-[#0d1117] border border-slate-800 rounded-xl">
              <h3 className="text-xl font-bold text-white mb-3">1. Decoupled Ingestion</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Arcli quickly absorbs Stripe webhook storms, responding immediately to Stripe while asynchronously processing events. The payload is pushed to an isolated holding queue, protecting your primary database from load spikes.
              </p>
            </div>

            <div className="p-8 bg-[#0d1117] border border-slate-800 rounded-xl">
              <h3 className="text-xl font-bold text-white mb-3">2. Distributed Locking</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Before evaluating state, Arcli generates an idempotency key from the Stripe event ID and request metadata, then applies a database mutex. This lock strongly mitigates the risk of concurrent worker execution during retry conditions.
              </p>
            </div>

            <div className="p-8 bg-[#0d1117] border border-slate-800 rounded-xl">
              <h3 className="text-xl font-bold text-white mb-3">3. Graceful Degradation</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                If an email provider API experiences a network partition, Arcli safely routes the workflow to a dead-letter queue (DLQ). Recovery attempts pause securely and resume safely once the network stabilizes.
              </p>
            </div>
          </div>
        </section>

        {/* 4. THE COMMERCIAL REALITY (Build vs. Buy) */}
        <section className="mb-24 bg-gradient-to-br from-slate-900 to-black border border-slate-800 rounded-2xl p-8 sm:p-12">
          <h2 className="text-3xl font-bold text-white mb-8">The Economics of Billing Infrastructure</h2>
          <div className="grid sm:grid-cols-2 gap-12">
            <div>
              <p className="text-slate-400 mb-6 leading-relaxed">
                CTOs often face the "Build vs. Buy" decision for handling Stripe events. Building a robust, multi-tenant webhook consumer with strict idempotency and DLQs requires significant resource allocation:
              </p>
              <p className="text-slate-400 mb-6 leading-relaxed text-sm">
                Industry benchmarks estimate that many SaaS products lose roughly <strong>1-3% of MRR</strong> to involuntary churn from failed payments. At <strong>$150k MRR</strong>, that is about <strong>$1,500-$4,500/month</strong>, with a midpoint near <strong>$3,750/month</strong> in recoverable revenue.
              </p>
              <ul className="space-y-4 text-slate-300 font-mono text-sm">
                <li className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Engineering Time:</span> <span className="text-slate-100">~3 to 4 Sprints</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Resource Cost:</span> <span className="text-red-400">$15,000 - $25,000</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Ongoing Maintenance:</span> <span className="text-slate-100">High</span>
                </li>
              </ul>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/30 p-6 rounded-xl flex flex-col justify-center">
              <h3 className="text-indigo-400 font-bold mb-4 font-mono text-sm">The "Buy" Math</h3>
              <p className="text-sm text-slate-300 mb-4">While waiting months to build and test this internally, a SaaS generating $150k MRR can lose <strong>$1,500-$4,500 each month</strong> from avoidable failed-payment churn.</p>
              <div className="text-xl text-white font-medium">
                Buying dedicated infrastructure pays for itself within the first 30 days of recovered MRR.
              </div>
            </div>
          </div>
        </section>

        <section className="mb-24 bg-slate-100 text-slate-900 rounded-2xl p-8 sm:p-12 border border-slate-300">
          <h2 className="text-3xl font-bold mb-8">Operational Snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            <div className="rounded-xl bg-white border border-slate-300 p-4">
              <div className="text-2xl font-bold">1-3%</div>
              <p className="text-xs text-slate-600 mt-1">Typical involuntary churn range</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-300 p-4">
              <div className="text-2xl font-bold">$1.5k-$4.5k</div>
              <p className="text-xs text-slate-600 mt-1">Monthly leakage at $150k MRR</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-300 p-4">
              <div className="text-2xl font-bold">3-4 sprints</div>
              <p className="text-xs text-slate-600 mt-1">Typical in-house build timeline</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-300 p-4">
              <div className="text-2xl font-bold">10 min</div>
              <p className="text-xs text-slate-600 mt-1">Fast webhook ingestion setup</p>
            </div>
          </div>

          <h3 className="text-xl font-bold mb-4">How It Works</h3>
          <div className="grid lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-300 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 1</p>
              <p className="font-semibold">Ingest</p>
              <p className="text-sm text-slate-600">Receive Stripe event and verify signature.</p>
            </div>
            <div className="bg-white border border-slate-300 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 2</p>
              <p className="font-semibold">Lock</p>
              <p className="text-sm text-slate-600">Apply idempotency key and distributed mutex.</p>
            </div>
            <div className="bg-white border border-slate-300 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 3</p>
              <p className="font-semibold">Process</p>
              <p className="text-sm text-slate-600">Execute deterministic scoring and recovery logic.</p>
            </div>
            <div className="bg-white border border-slate-300 rounded-xl p-4">
              <p className="text-xs font-mono text-slate-500 mb-1">Step 4</p>
              <p className="font-semibold">Recover</p>
              <p className="text-sm text-slate-600">Handle retries safely or route to DLQ if needed.</p>
            </div>
          </div>
        </section>

        {/* 5. CODE SNIPPET (Idempotency Proof) */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-white mb-8">
            How Arcli Handles State Isolation
          </h2>
          <div className="p-6 bg-[#0d1117] border border-slate-800 rounded-lg">
            <div className="text-slate-500 mb-4 border-b border-slate-800 pb-2 font-mono text-sm">
              // Arcli Webhook Ingestion & Lock Strategy
            </div>
            <pre className="text-slate-300 font-mono text-sm overflow-x-auto">
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
        <section className="mb-32 bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl text-white font-serif">"</div>
          <blockquote className="relative z-10 text-xl sm:text-2xl font-medium text-slate-300 leading-relaxed mb-8">
            "Before Arcli, our custom webhook ingestion script dropped payloads constantly during Stripe API latency spikes. Arcli replaced that fragile script with stable, observable infrastructure. Our engineers no longer have to debug state mismatches."
          </blockquote>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center font-bold text-indigo-400">
              SL
            </div>
            <div>
              <div className="text-white font-semibold">Staff Engineer</div>
              <div className="text-slate-500 text-sm">Series A SaaS • ~12k Active Subscriptions</div>
            </div>
          </div>
        </section>

        <section className="mb-32">
          <h2 className="text-3xl font-bold text-white mb-6">Capability Comparison</h2>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Capability</th>
                  <th className="px-4 py-3 font-semibold">Generic Queue</th>
                  <th className="px-4 py-3 font-semibold">Arcli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                <tr>
                  <td className="px-4 py-3">Stripe idempotency awareness</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-emerald-400">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Distributed billing locks</td>
                  <td className="px-4 py-3">Manual</td>
                  <td className="px-4 py-3 text-emerald-400">Built-in</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">DLQ handling</td>
                  <td className="px-4 py-3">Partial</td>
                  <td className="px-4 py-3 text-emerald-400">Native</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Revenue attribution</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-emerald-400">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Multi-tenant isolation</td>
                  <td className="px-4 py-3">Manual</td>
                  <td className="px-4 py-3 text-emerald-400">Built-in</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 7. SEMANTIC INTERNAL LINKS */}
        <section className="mb-32 grid sm:grid-cols-2 gap-12 border-t border-slate-800 pt-16">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Deterministic Scoring
            </h2>
            <p className="text-slate-400 leading-relaxed text-sm">
              Once an event is safely ingested and locked, Arcli routes the payload to the <Link href="/saas-churn-risk-scoring" className="text-indigo-400 hover:underline">deterministic churn scoring engine</Link>. This ensures that recovery workflows are only triggered by explicit, observable facts, not opaque AI probabilities.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Dunning Orchestration
            </h2>
            <p className="text-slate-400 leading-relaxed text-sm">
              Effectively-once execution ensures that when a payment fails, the system triggers the appropriate <Link href="/saas-dunning-software" className="text-indigo-400 hover:underline">SaaS dunning workflow</Link> with strong safeguards against duplicate recovery messaging, protecting your brand reputation during recovery.
            </p>
          </div>
        </section>

        {/* 8. FAQ SECTION */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-white border-b border-slate-800 pb-4 mb-12">
            Infrastructure FAQ
          </h2>
          <div className="grid sm:grid-cols-2 gap-12">
            
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How does Arcli handle network partitions?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  If an external API experiences a timeout, Arcli gracefully routes the workflow to a dead-letter queue (DLQ) while maintaining the distributed lock. This ensures the revenue recovery attempt is safely retried once the network stabilizes.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">What makes this different from Celery or Sidekiq?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Standard background queues optimize for throughput. Arcli optimizes for state isolation and transactional correctness. We natively handle Stripe payload idempotency, ensuring execution is effectively-once.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How long does it take to implement?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  You can connect your Stripe webhooks to Arcli's ingestion layer in under 10 minutes. Mapping tenant IDs and activating pre-configured recovery flows typically takes a single afternoon sprint.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Do we need to migrate our database to use Arcli?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  No. Arcli acts as an external state machine that sits alongside your existing stack. We do not require you to migrate your primary Postgres, user tables, or auth layers.
                </p>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* 9. BOTTOM CTA */}
      <BrutalistCTA 
        title="Stop building custom webhook handlers."
        subtitle="Protect your engineering time and your MRR with dedicated billing infrastructure."
        primaryActionText="Calculate Engineering ROI"
        primaryActionUrl="/calculate-mrr"
      />

      <Footer />
    </div>
  );
}