import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { BrutalistCTA } from "@/components/landing/brutalist-cta";

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

  return (
    <div className="min-h-screen bg-black text-slate-200 selection:bg-indigo-500/30 font-sans">
      <Navbar />
      
      {/* JSON-LD Schema Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-24 sm:pt-40 sm:pb-32">
        {/* 1. HERO SECTION (Outcome-Driven, Keyword-Rich) */}
        <header className="mb-24 text-center sm:text-left">
          <div className="inline-block px-3 py-1 mb-6 text-xs font-mono font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            Revenue Recovery Infrastructure for SaaS
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
            Recover Failed Payments and <br className="hidden sm:block" />
            Prevent SaaS Churn <span className="text-indigo-400">Automatically.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 leading-relaxed mb-10 max-w-3xl sm:mx-0 mx-auto">
            Deterministic recovery infrastructure for subscription SaaS companies using Stripe. 
            Stop bleeding MRR to involuntary churn and abandoned accounts with retry-safe billing automation.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <Link
              href="/calculate-mrr"
              className="px-6 py-3 bg-white text-black font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              Calculate Recoverable MRR
            </Link>
            <Link
              href="/docs"
              className="px-6 py-3 bg-transparent border border-slate-700 text-white font-semibold rounded-md hover:bg-slate-900 transition-colors"
            >
              View Infrastructure Docs
            </Link>
          </div>
        </header>

        {/* 2. THE FAILURE NARRATIVE (Why Competitors Fail) */}
        <section className="mb-24 border border-red-900/30 bg-red-950/10 rounded-2xl p-8 sm:p-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Why Marketing Platforms Fail at Revenue Recovery
          </h2>
          <p className="text-slate-400 mb-8 max-w-3xl">
            You cannot fix a billing problem with a marketing tool. Generic CDPs and email marketing platforms lack the infrastructural rigor to handle critical Stripe dunning events safely. 
          </p>
          <div className="grid sm:grid-cols-3 gap-8">
            <div>
              <div className="text-red-400 font-bold mb-2">The Danger of Duplicate Sends</div>
              <p className="text-sm text-slate-300">Marketing tools blindly process webhooks. When Stripe sends retry storms, marketing tools double-email your customers, destroying trust.</p>
            </div>
            <div>
              <div className="text-red-400 font-bold mb-2">Attribution Corruption</div>
              <p className="text-sm text-slate-300">Most platforms measure "open rates" or "clicks." They cannot deterministically tie a transactional message directly to a successfully recovered Stripe invoice.</p>
            </div>
            <div>
              <div className="text-red-400 font-bold mb-2">Async Race Conditions</div>
              <p className="text-sm text-slate-300">Without distributed locks or backpressure management, overlapping dunning campaigns and voluntary churn triggers cause database deadlocks and dropped payloads.</p>
            </div>
          </div>
        </section>

        {/* 3. BUSINESS OUTCOMES / VISUAL PIPELINE */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-white text-center mb-16">
            The Deterministic Recovery Pipeline
          </h2>
          
          {/* Brutalist Diagram using Tailwind */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-16 font-mono text-sm">
            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg text-center w-full sm:w-1/4">
              <span className="block text-indigo-400 mb-1">Stripe Webhook</span>
              <span className="text-xs text-slate-500">invoice.payment_failed</span>
            </div>
            <div className="hidden sm:block text-slate-600">→</div>
            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg text-center w-full sm:w-1/4">
              <span className="block text-indigo-400 mb-1">Idempotent Queue</span>
              <span className="text-xs text-slate-500">Distributed Lock Applied</span>
            </div>
            <div className="hidden sm:block text-slate-600">→</div>
            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg text-center w-full sm:w-1/4">
              <span className="block text-indigo-400 mb-1">Recovery Engine</span>
              <span className="text-xs text-slate-500">Workflow Dispatched</span>
            </div>
            <div className="hidden sm:block text-slate-600">→</div>
            <div className="p-4 bg-indigo-950 border border-indigo-500/50 rounded-lg text-center w-full sm:w-1/4">
              <span className="block text-indigo-300 mb-1">MRR Attributed</span>
              <span className="text-xs text-slate-500">Exact Revenue Traced</span>
            </div>
          </div>
        </section>

        {/* 4. THE INFRASTRUCTURE PROOF (Technical Credibility) */}
        <section className="mb-24 space-y-16">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-white mb-4">
              Built for Revenue. Engineered like Infrastructure.
            </h2>
            <p className="text-lg text-slate-400">
              Arcli treats recovery execution as a critical financial system. We don't guess with black-box AI. We give you full operational sanity over your SaaS retention automation.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-12 gap-y-16">
            <div>
              <h3 className="text-xl font-bold text-white mb-3">
                Deterministic Stripe Dunning
              </h3>
              <p className="text-slate-400 mb-4">
                Stop relying on basic Stripe Smart Retries. Arcli provides fully orchestrated, multi-channel payment retry workflows. We instantly react to <code>invoice_payment_failed</code> webhooks to capture involuntary churn before it compounds.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">
                Zero Duplicate Sends (Idempotency)
              </h3>
              <p className="text-slate-400 mb-4">
                We prioritize queue reliability. Distributed locks and deduplication guards guarantee that a recovery flow executes exactly once, safely absorbing Stripe webhook retry storms without ever spamming a user.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">
                Exact Revenue Attribution
              </h3>
              <p className="text-slate-400 mb-4">
                Trace recovered MRR directly to specific automation flows. We bridge the gap between transactional messaging and billing by confirming when the customer returns and validating the final <code>invoice_paid</code> event.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">
                Fault-Tolerant Architecture
              </h3>
              <p className="text-slate-400 mb-4">
                Built to survive outages. Background workers utilize dead-letter queues (DLQs) and backpressure management. If an email provider drops, your recurring revenue recovery campaigns pause securely and resume safely.
              </p>
            </div>
          </div>
        </section>

        {/* 5. STRONGER SOCIAL PROOF */}
        <section className="mb-32 bg-gradient-to-br from-slate-900 to-black border border-slate-800 rounded-2xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl text-white font-serif">"</div>
          <blockquote className="relative z-10 text-xl sm:text-2xl font-medium text-slate-300 leading-relaxed mb-8">
            "Arcli replaced five fragile, overlapping recovery scripts handling over 2M Stripe events a month. It completely eliminated our webhook race conditions. It is the only platform we trust to touch our billing data idempotently."
          </blockquote>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center font-bold text-indigo-400">
              CTO
            </div>
            <div>
              <div className="text-white font-semibold">VP of Engineering</div>
              <div className="text-slate-500 text-sm">Series B B2B SaaS • Processed $1.2M Recovered MRR</div>
            </div>
          </div>
        </section>

        {/* 6. EXPANDED FOUNDER & DEVELOPER FAQ */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-white border-b border-slate-800 pb-4 mb-12">
            Frequent Questions from Technical Founders
          </h2>
          <div className="grid sm:grid-cols-2 gap-12">
            
            {/* Business / ROI Questions */}
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Does Arcli replace Stripe Smart Retries?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Yes. Stripe Smart Retries use basic machine learning to retry cards, but they don't orchestrate the transactional messaging or multi-channel workflows required to actually win the user back. Arcli replaces basic retries with fully orchestrated recovery infrastructure.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How quickly can Arcli recover failed payments?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Webhooks are ingested in milliseconds. Depending on the rules engine you configure, pre-dunning warnings or immediate failure notifications are dispatched instantly, often recovering failed invoices within the first 12 hours of failure.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How is recovered MRR calculated?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  We don't guess. We trace the exact pipeline: <em>Email Sent → User Returned → Stripe invoice_paid webhook received</em>. We attribute the recovered MRR deterministically to the specific automation flow that triggered it.
                </p>
              </div>
            </div>

            {/* Technical / Infra Questions */}
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How do you prevent duplicate recovery emails?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Arcli relies on strict idempotency keys generated from the webhook payload and event IDs, combined with distributed locks at the database layer. If a webhook retry storm occurs, the lock ensures the system ignores duplicates safely.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Can Arcli integrate with our existing SaaS stack?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Yes. We sit alongside your existing database and act purely on Stripe webhooks and specific raw lifecycle events (via our API). We don't require you to rip out your primary database or authentication layer.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Is Arcli multi-tenant safe?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Absolutely. We built this for enterprise-grade SaaS. Arcli enforces strict <code>tenant_id</code> scoping at every database, cache, and queue layer, guaranteeing zero cross-tenant data leakage.
                </p>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* 7. BOTTOM CTA */}
      <BrutalistCTA 
        title="Stop losing MRR to bad infrastructure."
        subtitle="Replace generic marketing tools with deterministic revenue recovery infrastructure."
        primaryActionText="Connect Stripe in Development Mode"
        primaryActionUrl="/sandbox"
      />

      <Footer />
    </div>
  );
}