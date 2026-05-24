import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { BrutalistCTA } from "@/components/landing/brutalist-cta";

export const metadata: Metadata = {
  title: "SaaS Churn Risk Scoring | Deterministic vs. Predictive Models",
  description:
    "Calculate SaaS churn risk deterministically. Stop relying on black-box AI. Use explicit Stripe billing events and product analytics to trigger safe recovery workflows.",
  alternates: {
    canonical: "https://arcli.com/saas-churn-risk-scoring",
  },
};

export default function SaasChurnRiskScoringPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": "Arcli Churn Scoring Service",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Application",
        "description": "Deterministic, rules-based SaaS churn risk scoring engine for Stripe and product analytics.",
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
            "name": "What is deterministic churn scoring?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Deterministic churn scoring evaluates absolute facts, such as a Stripe invoice_payment_failed webhook or exactly 14 days of application inactivity, rather than relying on probability-based machine learning models.",
            },
          },
          {
            "@type": "Question",
            "name": "Why shouldn't I use AI for churn prediction?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "AI provides probabilities, not facts. Triggering automated billing recovery emails based on a 78% 'chance' of churn leads to false positives, spamming active users, and damaging brand trust. Financial automation requires determinism.",
            },
          },
          {
            "@type": "Question",
            "name": "How does Arcli combine Stripe data with application events?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Arcli ingests both raw application activity (e.g., logins, feature usage) and Stripe lifecycle events into a unified, tenant-isolated data layer. The scoring engine evaluates thresholds across both datasets simultaneously.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I adjust the risk thresholds for different customer tiers?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Arcli allows you to configure specific rule sets based on MRR. For example, you can set a tighter inactivity threshold for Enterprise users compared to basic tier subscribers.",
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
          <div className="inline-block px-3 py-1 mb-6 text-xs font-mono font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            The Arcli churn_scoring_service
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
            Calculate SaaS Churn Risk <br className="hidden sm:block" />
            <span className="text-indigo-400">Deterministically.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 leading-relaxed mb-10 max-w-3xl sm:mx-0 mx-auto">
            You cannot automate critical revenue recovery based on a probability. Arcli evaluates raw product usage and Stripe billing events to calculate absolute churn state—no black-box AI, no false positives.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <Link
              href="/calculate-mrr"
              className="px-6 py-3 bg-white text-black font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              Calculate Risk Thresholds
            </Link>
            <Link
              href="/docs/scoring"
              className="px-6 py-3 bg-transparent border border-slate-700 text-white font-semibold rounded-md hover:bg-slate-900 transition-colors"
            >
              Read the Scoring Docs
            </Link>
          </div>
        </header>

        {/* 2. THE FAILURE NARRATIVE (Attacking AI/ML) */}
        <section className="mb-24 border border-red-900/30 bg-red-950/10 rounded-2xl p-8 sm:p-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Why Machine Learning Fails at SaaS Billing Automation
          </h2>
          <p className="text-slate-400 mb-8 max-w-3xl">
            Predictive AI models are built for generic marketing segmentation, not infrastructure-grade billing automation. Relying on an algorithm to trigger your dunning or retention campaigns is a direct risk to your brand.
          </p>
          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <div className="text-red-400 font-bold mb-2">False Positives Destroy Trust</div>
              <p className="text-sm text-slate-300 leading-relaxed">
                An AI model flags a user with an "82% churn probability." Your marketing tool automatically emails them a desperate "Please come back!" discount. The customer is confused because they use your app every day—the AI just misinterpreted a missing data point. The customer actually churns out of annoyance.
              </p>
            </div>
            <div>
              <div className="text-red-400 font-bold mb-2">Zero Explainability</div>
              <p className="text-sm text-slate-300 leading-relaxed">
                When a VIP Enterprise customer complains to support about a warning email, your team cannot debug a neural network. You cannot look at a matrix of weights and biases to explain a billing error. You need precise, human-readable event logs.
              </p>
            </div>
          </div>
        </section>

        {/* 3. CORE ARCHITECTURE / CODE PROOF */}
        <section className="mb-32">
          <h2 className="text-3xl font-bold text-white mb-4">
            Rules, Not Guesses.
          </h2>
          <p className="text-lg text-slate-400 mb-12 max-w-3xl">
            Arcli relies on explicit, explainable thresholds inside the <code>churn_scoring_service</code>. We separate involuntary churn (billing failures) from voluntary churn (inactivity) to trigger precise recovery flows.
          </p>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  1. Involuntary Churn (Stripe State)
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  There is no "prediction" needed for a failed credit card. If a Stripe <code>invoice_payment_failed</code> webhook is received, the risk score is automatically maximized, bypassing all behavioral checks to trigger an immediate dunning flow.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  2. Voluntary Churn (Behavioral State)
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Threshold-based scoring defines exact parameters for feature abandonment. If a user's <code>last_seen_at</code> timestamp exceeds your explicit limit, they transition deterministically into an "At Risk" state.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  3. Dynamic Suppression
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  If a user pays their Stripe invoice or logs back into the application while in a high-risk state, the score instantly resets. The system drops any pending emails from the queue automatically.
                </p>
              </div>
            </div>

            {/* Brutalist Code Snippet */}
            <div className="p-6 bg-[#0d1117] border border-slate-800 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-slate-500 mb-4 border-b border-slate-800 pb-2">// Arcli Deterministic Risk Payload</div>
              <pre className="text-slate-300">
{`{
  "tenant_id": "req_8f72k",
  "rule_set": "enterprise_tier",
  "conditions": {
    "involuntary": {
      "stripe_events": ["invoice.payment_failed"],
      "action": "trigger_dunning_flow",
      "priority": "critical"
    },
    "voluntary": {
      "days_inactive": "> 14",
      "core_feature_usage": "== 0",
      "mrr_value": "> 100",
      "action": "trigger_reengagement_flow"
    }
  },
  "suppression": {
    "reset_on": ["invoice.paid", "user.login"]
  }
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* 4. ENGINEERED FOR SCALE */}
        <section className="mb-32">
          <div className="border-t border-slate-800 pt-16">
            <h2 className="text-3xl font-bold text-white mb-4">
              Engineered for Scale: Evaluating State Without N+1s
            </h2>
            <p className="text-lg text-slate-400 max-w-3xl mb-8">
              Backend engineers hate marketing tools because querying thousands of users to check <code>last_seen_at</code> thresholds every minute crashes databases.
            </p>
            <div className="grid sm:grid-cols-3 gap-8">
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="text-indigo-400 font-bold mb-2 font-mono text-sm">Materialized Views</div>
                <p className="text-sm text-slate-400">Arcli pre-calculates high-risk states using background materialization, avoiding heavy analytical queries on your primary database.</p>
              </div>
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="text-indigo-400 font-bold mb-2 font-mono text-sm">Cursor Pagination</div>
                <p className="text-sm text-slate-400">Batched processing and strict cursor pagination ensure evaluating inactivity limits stays O(1) in memory, regardless of your user base size.</p>
              </div>
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="text-indigo-400 font-bold mb-2 font-mono text-sm">Complete Explainability</div>
                <p className="text-sm text-slate-400">Every single score change generates an immutable audit log. You will never have to guess <em>why</em> Arcli triggered a recovery email.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. STRONG SOCIAL PROOF */}
        <section className="mb-32 bg-gradient-to-br from-slate-900 to-black border border-slate-800 rounded-2xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl text-white font-serif">"</div>
          <blockquote className="relative z-10 text-xl sm:text-2xl font-medium text-slate-300 leading-relaxed mb-8">
            "Before Arcli, our generic CDP's 'AI Churn Predictor' sent a 50% off coupon to an Enterprise customer simply because they used the API instead of the UI for a month. We ripped it out the next day. Arcli’s deterministic rules saved our operational sanity."
          </blockquote>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center font-bold text-indigo-400">
              DL
            </div>
            <div>
              <div className="text-white font-semibold">Data Lead</div>
              <div className="text-slate-500 text-sm">Fintech SaaS • 40,000 Active Tenants</div>
            </div>
          </div>
        </section>

        {/* 6. FAQ SECTION */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-white border-b border-slate-800 pb-4 mb-12">
            Deterministic Scoring FAQ
          </h2>
          <div className="grid sm:grid-cols-2 gap-12">
            
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">What is deterministic churn scoring?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Deterministic churn scoring evaluates absolute facts, such as a Stripe <code>invoice_payment_failed</code> webhook or exactly 14 days of application inactivity, rather than relying on probability-based machine learning models.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Why shouldn't I use AI for churn prediction?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  AI provides probabilities, not facts. Triggering automated billing recovery emails based on a 78% "chance" of churn leads to false positives, spamming active users, and damaging brand trust. Financial automation requires determinism.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How does Arcli combine Stripe data with app events?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Arcli ingests both raw application activity (e.g., logins) and Stripe lifecycle events into a unified, tenant-isolated data layer. The scoring engine evaluates thresholds across both datasets simultaneously.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Can I adjust thresholds for different customer tiers?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Yes. Arcli allows you to configure specific rule sets based on MRR or plan type. You can set a tighter 7-day inactivity threshold for Enterprise users, while giving basic tier subscribers a 30-day window.
                </p>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* 7. BOTTOM CTA */}
      <BrutalistCTA 
        title="Stop automating your revenue on guesses."
        subtitle="Switch to deterministic infrastructure and get absolute explainability."
        primaryActionText="Connect Stripe in Development Mode"
        primaryActionUrl="/sandbox"
      />

      <Footer />
    </div>
  );
}