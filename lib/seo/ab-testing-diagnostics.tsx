// lib/seo/ab-testing-diagnostics.tsx

/**
 * SEO v10 SYSTEM: A/B Testing & Root-Cause Diagnostics
 * * SERP Realism Layer: 
 * - Target: We are NOT competing for Position 1 on generic "A/B Testing" (unrealistic vs Optimizely/VWO).
 * - Target: Position 1 for "A/B testing root-cause diagnostics", "SRM detection SQL", and "A/B test statistical significance automated".
 * * Query Prioritization:
 * - Tier 1 (High Intent): "AI A/B testing diagnostics", "automated SRM detection"
 * - Tier 2 (Supporting): "Simpson's paradox product growth", "feature flag analytics integration"
 * - Tier 3 (Long-Tail): "how to slice AB test results by dimension in SQL", "calculating p-value in DuckDB"
 */

export const abTestingDiagnosticsData = {
  path: "/use-cases/ab-testing-diagnostics",
  meta: {
    title: "AI-Powered A/B Testing Diagnostics & SRM Detection | Arcli",
    description: "Automate statistical significance calculations and root-cause analysis. Arcli's AI agents ingest feature flag data to diagnose exactly why an A/B test variant won or lost across deep user dimensions.",
    keywords: [
      "A/B testing root-cause diagnostics", 
      "automated SRM detection",
      "feature flag analytics AI", 
      "statistical significance calculator SQL", 
      "Simpson's paradox product growth"
    ],
    serpRealism: {
      primaryTarget: "A/B testing diagnostics tool",
      difficulty: "Medium",
      intent: "Commercial Investigation & Deep Technical Information"
    }
  },
  blocks: [
    // ------------------------------------------------------------------------
    // 1. HERO BLOCK (Conversion Engine & Tier 1 Query Targeting)
    // ------------------------------------------------------------------------
    {
      type: "Hero",
      payload: {
        badge: "Product Growth Diagnostics",
        title: "Beyond the P-Value: AI Root-Cause Experiment Diagnostics",
        subtitle: "Native feature flag tools tell you Variant B won. Arcli's AI agents tell you *why* it won, autonomously slicing millions of events to find the exact user segments and guardrail metrics driving the result.",
        primaryCta: {
          label: "Analyze Your First Test",
          href: "/register?intent=product_growth"
        },
        secondaryCta: {
          label: "View Diagnostic Engine",
          href: "#architecture"
        },
        trustSignals: [
          "Native LaunchDarkly & Statsig Integrations",
          "Automated Sample Ratio Mismatch (SRM) checks",
          "Sub-second dimensional slicing via DuckDB"
        ]
      }
    },

    // ------------------------------------------------------------------------
    // 2. KEYWORD ANCHOR BLOCK (Anti-Overfitting & Semantic Density)
    // ------------------------------------------------------------------------
    {
      type: "KeywordAnchorBlock",
      payload: {
        heading: "The Engineering Cost of Experimentation",
        text: "Data engineering teams spend 30% of their time answering follow-up questions about finished A/B tests. Standard dashboards fail to detect underlying anomalies like **Sample Ratio Mismatch (SRM)** or global metric degradation. By pushing **statistical significance calculations** directly down to the data warehouse via **SQL**, Arcli completely eliminates this operational drag, providing Product Managers with mathematically rigorous, conversational diagnostic answers.",
        semanticEntities: ["Sample Ratio Mismatch (SRM)", "statistical significance calculations", "data warehouse", "feature flag analytics"]
      }
    },

    // ------------------------------------------------------------------------
    // 3. UI BLOCK (UI Visualization Layer - UI as Conversion Driver)
    // ------------------------------------------------------------------------
    {
      type: "UIBlock",
      payload: {
        visualizationType: "AnalyticsDashboard",
        dataMapping: "Simulated Simpson's Paradox: Global Conversion (Up 4%) vs. Segment Conversion (iOS Down 12%, Android Down 8%, Web Down 5%)",
        interactionPurpose: "Demonstrate visually how top-line aggregate metrics hide segmented degradations, requiring multi-dimensional analysis.",
        intentServed: "Informational & Commercial Investigation",
        contextText: "Most product teams look at top-line aggregate conversions to declare a winner. But without deep dimensional slicing, you miss Simpson's Paradox: Variant B might increase conversion globally due to traffic shifting, while simultaneously decreasing it across every individual platform. Arcli visualizes these hidden vectors instantly."
      }
    },

    // ------------------------------------------------------------------------
    // 4. QUERY EXAMPLES BLOCK (Information Gain & Tier 3 Long-Tail)
    // ------------------------------------------------------------------------
    {
      type: "QueryExamplesBlock",
      payload: {
        title: "Conversational Diagnostics in Action",
        description: "Instead of writing complex nested GROUP BY statements, product and growth teams ask natural language questions. Arcli guarantees deterministic, governed answers.",
        examples: [
          {
            query: "Why did the new checkout flow cause a drop in retention for Enterprise users?",
            intent: "Root-cause anomaly detection across specific user cohorts."
          },
          {
            query: "Did Variant A hit statistical significance for users acquired via Meta Ads?",
            intent: "Sub-segment confidence interval generation."
          },
          {
            query: "Are there any guardrail metrics showing degradation in the pricing experiment?",
            intent: "Automated multi-metric variance scanning."
          }
        ]
      }
    },

    // ------------------------------------------------------------------------
    // 5. STRATEGIC TECHNICAL BLOCK (E-E-A-T & Authority Test)
    // ------------------------------------------------------------------------
    {
      type: "StrategicQuery",
      payload: {
        title: "The Engine Room: Two-Proportion Z-Test via SQL",
        description: "AI shouldn't invent statistical formulas. Arcli enforces rigorous mathematical standards by mapping user intent to governed SQL macros, executing directly in DuckDB.",
        businessOutcome: "By pushing statistical compute down to the warehouse, Arcli avoids pulling millions of raw event rows into memory—ensuring sub-second diagnostic analysis and absolute data privacy.",
        language: "sql",
        code: `
-- AI Agent Generated: A/B Test Statistical Significance
-- Dialect: DuckDB
WITH user_exposures AS (
    SELECT user_id, variant_name, MIN(timestamp) AS exposed_at
    FROM tenant.experiment_logs
    WHERE experiment_id = 'exp_checkout_2025' GROUP BY 1, 2
),
variant_stats AS (
    SELECT 
        e.variant_name,
        COUNT(e.user_id) AS visitors,
        SUM(CASE WHEN c.timestamp > e.exposed_at THEN 1 ELSE 0 END) AS conversions
    FROM user_exposures e
    LEFT JOIN tenant.core_events c ON e.user_id = c.user_id 
    GROUP BY 1
)
-- Engine calculates SE, Z-Score, and Confidence Intervals dynamically
SELECT variant_name, visitors, conversions, (conversions::FLOAT / visitors) as cr 
FROM variant_stats;`
      }
    },

    // ------------------------------------------------------------------------
    // 6. COMPARISON BLOCK (Competitive Test Layer)
    // ------------------------------------------------------------------------
    {
      type: "ComparisonBlock",
      payload: {
        title: "Experimentation Analytics: Arcli vs. Status Quo",
        description: "Why relying solely on native feature flag dashboards leaves you blind to product reality.",
        visualizationType: "ComparisonTable",
        columns: ["Capability", "Arcli Diagnostic Agent", "Feature Flag Tool UI", "Internal Data Team"],
        rows: [
          { feature: "Cross-Database Joins", arcli: "Native (Stripe, Segment)", competitor: "Siloed to internal events", internal: "Yes (Heavy ETL required)" },
          { feature: "Guardrail Metric Checks", arcli: "Automated via Semantic Layer", competitor: "Predefined simple events only", internal: "Custom SQL per experiment" },
          { feature: "Root-Cause Slicing", arcli: "Automated Decision-Tree Search", competitor: "Manual filtering only", internal: "Days of backlog" },
          { feature: "SRM Detection", arcli: "Automated at query time", competitor: "Sometimes included", internal: "Prone to human error" }
        ]
      }
    },

    // ------------------------------------------------------------------------
    // 7. USE CASE BLOCK (Tier 2 Query Expansion)
    // ------------------------------------------------------------------------
    {
      type: "UseCaseBlock",
      payload: {
        title: "Deep Dive Scenarios",
        scenarios: [
          {
            title: "Guardrail Metric Protection",
            description: "A new search algorithm increases click-throughs. Arcli automatically cross-references exposure data against downstream semantic definitions (e.g., Stripe Net Revenue), revealing that while engagement is up, high-value users are abandoning carts. A net-negative financial impact is caught before 100% rollout."
          },
          {
            title: "Isolating Sub-Segment Winners",
            description: "Variant C lost globally. Arcli's diagnostic agent executes automated dimensional slicing and discovers Variant C actually increased conversion by 14% specifically for 'Returning Users on Android 12+'. The product team pivots to a targeted rollout."
          }
        ]
      }
    },

    // ------------------------------------------------------------------------
    // 8. INTERNAL LINKING BLOCK (Compounding Authority Layer)
    // ------------------------------------------------------------------------
    {
      type: "InternalLinkingBlock",
      payload: {
        title: "Explore the Arcli Architecture",
        links: [
          {
            label: "Semantic Metric Governance",
            href: "/use-cases/semantic-metric-governance",
            description: "Learn how Arcli ensures 'Conversion Rate' means the exact same thing across every test."
          },
          {
            label: "Snowflake & DuckDB Ingestion",
            href: "/integrations/snowflake",
            description: "See how Arcli connects to your data warehouse to process massive event logs without data movement."
          }
        ]
      }
    },

    // ------------------------------------------------------------------------
    // 9. FAQS (Tier 3 Long-Tail & Snippet Optimization)
    // ------------------------------------------------------------------------
    {
      type: "FAQs",
      payload: {
        title: "Technical Execution FAQs",
        faqs: [
          {
            question: "Does Arcli handle traffic splitting and feature flagging?",
            answer: "No. Arcli is an analytics and diagnostic layer. You continue to use tools like LaunchDarkly or Statsig to route users. Arcli ingests those assignment logs and handles the complex downstream mathematical analysis."
          },
          {
            question: "Can Arcli calculate significance for continuous metrics like ARPU?",
            answer: "Yes. While standard conversion rates use Two-Proportion Z-tests, Arcli automatically routes requests for continuous metrics (like Average Order Value or Session Length) to Welch's T-test formulas to account for unequal variances."
          },
          {
            question: "How does the AI prevent the 'Peeking Problem'?",
            answer: "Arcli is configured to enforce Minimum Detectable Effect (MDE) time-horizons based on your traffic volume, warning PMs if they attempt to call a test winner prematurely just because it hit false significance on day two."
          }
        ]
      }
    }
  ]
};