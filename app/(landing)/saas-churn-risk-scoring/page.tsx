import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { CTA } from "@/components/landing/cta";
import { C } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "SaaS Churn Risk Scoring | Deterministic vs. Predictive Models",
  description:
    "Calculate SaaS churn risk deterministically. Stop relying on black-box AI. Use explicit Stripe billing events and product analytics to trigger safe recovery workflows.",
  alternates: {
    canonical: "https://arcli.tech/saas-churn-risk-scoring",
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
            Deterministic Scoring Engine
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
            Calculate SaaS Churn Risk <br />
            <span style={{ color: C.blue }}>Deterministically.</span>
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
            Arcli evaluates Stripe billing events and product signals against explicit thresholds. Scores are explainable, reversible, and safe to automate.
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
              Calculate Risk Thresholds
            </Link>
            <Link
              href="/docs/scoring"
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
              Read the Scoring Docs
            </Link>
          </div>
        </header>

        {/* 2. THE FAILURE NARRATIVE (Attacking AI/ML) */}
        <section style={{ marginBottom: 96, border: surfaceBorder, background: C.offWhite, borderRadius: 16, padding: "32px" }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
            Where Probabilistic Models Break
          </h2>
          <p style={{ color: C.navySoft, marginBottom: 32, maxWidth: 760, lineHeight: 1.7 }}>
            Billing automation requires explicit state. Probability scores are useful for analytics, but they are unsafe as triggers for financial workflows.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            <div>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8 }}>False Positives</div>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
                A probabilistic alert can trigger outreach to active users. That erodes trust and creates noise in your recovery pipeline.
              </p>
            </div>
            <div>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8 }}>Low Explainability</div>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
                Support teams need clear, human-readable event logs to explain why a message was sent.
              </p>
            </div>
          </div>
        </section>

        {/* 3. CORE ARCHITECTURE / CODE PROOF */}
        <section style={{ marginBottom: 128 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
            Rules, Not Guesses
          </h2>
          <p style={{ fontSize: 18, color: C.navySoft, marginBottom: 48, maxWidth: 760, lineHeight: 1.7 }}>
            Arcli relies on explicit thresholds inside the <code>churn_scoring_service</code>. We separate involuntary churn (billing failures) from voluntary churn (inactivity) to trigger precise recovery flows.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
                  1. Involuntary Churn (Stripe State)
                </h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  There is no "prediction" needed for a failed credit card. If a Stripe <code>invoice_payment_failed</code> webhook is received, the risk score is automatically maximized, bypassing all behavioral checks to trigger an immediate dunning flow.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
                  2. Voluntary Churn (Behavioral State)
                </h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Threshold-based scoring defines exact parameters for feature abandonment. If a user's <code>last_seen_at</code> timestamp exceeds your explicit limit, they transition deterministically into an "At Risk" state.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
                  3. Dynamic Suppression
                </h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  If a user pays their Stripe invoice or logs back into the application while in a high-risk state, the score instantly resets. The system drops any pending emails from the queue automatically.
                </p>
              </div>
            </div>

            {/* Brutalist Code Snippet */}
            <div style={{ padding: 24, background: C.offWhite, border: surfaceBorder, borderRadius: 12, fontFamily: "monospace", fontSize: 13, overflowX: "auto" }}>
              <div style={{ color: C.faint, marginBottom: 16, borderBottom: surfaceBorder, paddingBottom: 8 }}>// Arcli Deterministic Risk Payload</div>
              <pre style={{ color: C.navySoft, margin: 0 }}>
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
        <section style={{ marginBottom: 128 }}>
          <div style={{ borderTop: surfaceBorder, paddingTop: 64 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              Engineered for Scale: Evaluating State Without N+1s
            </h2>
            <p style={{ fontSize: 18, color: C.navySoft, maxWidth: 760, marginBottom: 32, lineHeight: 1.7 }}>
              Backend engineers hate marketing tools because querying thousands of users to check <code>last_seen_at</code> thresholds every minute crashes databases.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
              <div style={{ padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
                <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8, fontFamily: "monospace", fontSize: 13 }}>Materialized Views</div>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>Arcli pre-calculates high-risk states using background materialization, avoiding heavy analytical queries on your primary database.</p>
              </div>
              <div style={{ padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
                <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8, fontFamily: "monospace", fontSize: 13 }}>Cursor Pagination</div>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>Batched processing and strict cursor pagination ensure evaluating inactivity limits stays O(1) in memory, regardless of your user base size.</p>
              </div>
              <div style={{ padding: 24, background: C.white, border: surfaceBorder, borderRadius: 12, boxShadow: surfaceShadow }}>
                <div style={{ color: C.blue, fontWeight: 700, marginBottom: 8, fontFamily: "monospace", fontSize: 13 }}>Complete Explainability</div>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>Every score change generates an immutable audit log. You never have to guess <em>why</em> Arcli triggered a recovery email.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. STRONG SOCIAL PROOF */}
        <section style={{ marginBottom: 128, background: C.offWhite, border: surfaceBorder, borderRadius: 16, padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, padding: 32, opacity: 0.1, fontSize: 96, color: C.ruleDark, fontFamily: "serif" }}>
            "
          </div>
          <blockquote style={{ position: "relative", zIndex: 2, fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 500, color: C.navySoft, lineHeight: 1.6, marginBottom: 32 }}>
            "Before Arcli, our generic CDP's 'AI Churn Predictor' sent a 50% off coupon to an Enterprise customer simply because they used the API instead of the UI for a month. We ripped it out the next day. Arcli’s deterministic rules saved our operational sanity."
          </blockquote>
          <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.white, borderRadius: "50%", border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.blue }}>
              DL
            </div>
            <div>
              <div style={{ color: C.navy, fontWeight: 600 }}>Data Lead</div>
              <div style={{ color: C.faint, fontSize: 14 }}>Fintech SaaS • 40,000 Active Tenants</div>
            </div>
          </div>
        </section>

        {/* 6. FAQ SECTION */}
        <section style={{ marginBottom: 96 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.navy, borderBottom: surfaceBorder, paddingBottom: 16, marginBottom: 48 }}>
            Deterministic Scoring FAQ
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 48 }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>What is deterministic churn scoring?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Deterministic churn scoring evaluates absolute facts, such as a Stripe <code>invoice_payment_failed</code> webhook or exactly 14 days of application inactivity, rather than relying on probability-based machine learning models.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Why shouldn't I use AI for churn prediction?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  AI provides probabilities, not facts. Triggering automated billing recovery emails based on a 78% "chance" of churn leads to false positives, spamming active users, and damaging brand trust. Financial automation requires determinism.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>How does Arcli combine Stripe data with app events?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Arcli ingests both raw application activity (e.g., logins) and Stripe lifecycle events into a unified, tenant-isolated data layer. The scoring engine evaluates thresholds across both datasets simultaneously.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Can I adjust thresholds for different customer tiers?</h3>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>
                  Yes. Arcli allows you to configure specific rule sets based on MRR or plan type. You can set a tighter 7-day inactivity threshold for Enterprise users, while giving basic tier subscribers a 30-day window.
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