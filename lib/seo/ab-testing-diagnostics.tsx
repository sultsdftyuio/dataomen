// lib/seo/ab-testing-diagnostics.tsx

export const abTestingDiagnosticsData = {
  path: "/use-cases/ab-testing-diagnostics",
  meta: {
    title: "AI-Powered A/B Testing & Root-Cause Diagnostics | Arcli",
    description: "Automate statistical significance calculations and root-cause analysis. Arcli's AI agents ingest feature flag data to diagnose exactly why an A/B test variant won or lost across deep user dimensions.",
    keywords: [
      "A/B testing AI analytics", 
      "statistical significance calculator SQL", 
      "product growth analytics", 
      "root-cause diagnostics AI", 
      "feature flag analytics", 
      "sample ratio mismatch detection"
    ]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "Product Growth & Diagnostics",
        title: "Beyond the P-Value: AI Root-Cause Diagnostics",
        subtitle: "Native A/B testing tools tell you Variant B won. Arcli's AI agents tell you *why* it won, autonomously slicing millions of events to find the exact user segments and guardrail metrics driving the result.",
        primaryCta: {
          label: "Analyze Your First Test",
          href: "/register?intent=product_growth"
        },
        secondaryCta: {
          label: "View Diagnostic Engine",
          href: "#architecture"
        },
        trustSignals: [
          "Connects to LaunchDarkly, Statsig & Custom Event Streams",
          "Automated Sample Ratio Mismatch (SRM) checks",
          "Sub-second dimensional slicing via DuckDB"
        ]
      }
    },
    {
      type: "ContrarianBanner",
      payload: {
        heading: "Simpson's Paradox is destroying your product growth.",
        argument: "Most product teams look at top-line aggregate conversions to declare an A/B test winner. But without deep dimensional slicing, you miss the paradox: Variant B might increase conversion overall, while simultaneously decreasing it across every individual traffic source. Traditional BI requires a data scientist to manually hunt for these overlapping vectors.",
        solution: "Arcli's Diagnostic Engine automates the hunt. When you ask the AI, 'How did the pricing test perform?', it doesn't just calculate significance. It autonomously executes a Multi-Dimensional Search (MDS) to flag hidden segment degradations before you roll out to 100%."
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "The Engineering Cost of Experimentation",
        businessOutcome: "Data engineering teams spend 30% of their time answering follow-up questions about finished A/B tests ('Can you slice this by mobile vs desktop?'). Arcli completely eliminates this operational drag by providing Product Managers with a mathematically rigorous, conversational diagnostic engine.",
        pillars: [
          {
            title: "Automated Statistical Engine",
            description: "Define your core metrics (e.g., 'Signup Rate', 'Average Order Value'). Arcli automatically calculates Z-scores, Confidence Intervals, and Minimum Detectable Effects (MDE) via SQL."
          },
          {
            title: "Guardrail Metric Protection",
            description: "Never launch a feature that breaks the business. Arcli automatically monitors secondary metrics (like Page Load Time or Customer Support Tickets) for statistical degradation during a test."
          },
          {
            title: "Conversational Diagnostics",
            description: "Instead of writing complex nested GROUP BY statements, PMs can ask, 'Why did Variant A cause a drop in retention for Enterprise users?' and get a governed, deterministic answer."
          }
        ]
      }
    },
    {
      type: "Workflow",
      payload: {
        title: "How the Diagnostic Service Operates",
        description: "From raw event streams to actionable product decisions without writing a single line of Python.",
        steps: [
          {
            step: 1,
            title: "Exposure & Event Ingestion",
            description: "Arcli's `sync_engine` joins your feature flag assignment logs (e.g., LaunchDarkly) with your downstream behavioral event tables (e.g., Segment, Snowplow, or raw PostgreSQL)."
          },
          {
            step: 2,
            title: "SRM & Validity Checks",
            description: "Before computing results, the `ab_testing` service runs a Chi-Squared test to detect Sample Ratio Mismatch (SRM). If traffic routing is broken, the AI agent halts the analysis and alerts engineering."
          },
          {
            step: 3,
            title: "Metric Compilation",
            description: "The engine references the Semantic Layer to ensure 'Conversion' is calculated exactly as governed by the business, preventing metric drift between product teams."
          },
          {
            step: 4,
            title: "Autonomous Slicing",
            description: "If a result is statistically significant, the `diagnostic_service` autonomously executes dozens of sub-queries across user dimensions (Device, Geo, Cohort) to isolate the primary driver of the variance."
          }
        ]
      }
    },
    {
      type: "UseCases",
      payload: {
        title: "Product Diagnostic Scenarios",
        scenarios: [
          {
            level: "Basic",
            title: "Standard Conversion Test with Confidence Intervals",
            businessQuestion: "Did the new checkout flow (Variant B) beat the control, and is the result statistically significant?",
            description: "The AI agent compiles an aggregated view of unique users exposed vs. converted, calculates the standard error, and returns the p-value and confidence interval in a human-readable summary."
          },
          {
            level: "Intermediate",
            title: "Guardrail Metric Degradation",
            businessQuestion: "The new search algorithm increased click-throughs, but did it negatively impact overall revenue per user (ARPU)?",
            description: "Arcli automatically cross-references the exposure data against the Stripe 'Net Revenue' semantic definition. It alerts the PM that while engagement is up, high-value users are actually abandoning carts, resulting in a net-negative financial impact."
          },
          {
            level: "Strategic",
            title: "Root-Cause Sub-Segment Isolation",
            businessQuestion: "Variant C lost overall. Are there any specific user segments where it actually outperformed the control?",
            description: "The Diagnostic Agent executes an automated decision-tree analysis in SQL. It discovers that while Variant C lost globally, it increased conversion by 14% specifically for 'Returning Users on Android 12+', allowing the product team to deploy targeted feature rollouts."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "The Engine Room: Two-Tailed Z-Test via SQL",
        description: "While the Product Manager just asks 'Who won?', Arcli's semantic engine generates this highly optimized, mathematically rigorous DuckDB query to perform a Two-Proportion Z-Test directly in the warehouse.",
        businessOutcome: "By pushing statistical compute down to the data warehouse, Arcli avoids pulling millions of raw event rows into memory. This ensures sub-second diagnostic analysis while maintaining absolute data privacy.",
        language: "sql",
        code: `
-- AI Agent Generated: A/B Test Statistical Significance (Two-Proportion Z-Test)
-- Dialect: DuckDB (via Arcli Compute Engine)
-- Target: Calculate conversion rate, standard error, Z-score, and approximate p-value.

WITH user_exposures AS (
    -- Step 1: Dedup exposures and get first exposure timestamp
    SELECT 
        user_id,
        variant_name,
        MIN(timestamp) AS exposed_at
    FROM tenant_workspace.product.experiment_logs
    WHERE experiment_id = 'exp_checkout_redesign_2025'
    GROUP BY 1, 2
),
user_conversions AS (
    -- Step 2: Join with governed semantic conversion event
    SELECT 
        e.user_id,
        e.variant_name,
        -- Check if conversion happened AFTER exposure within 7 days
        MAX(CASE WHEN c.timestamp > e.exposed_at 
             AND c.timestamp <= e.exposed_at + INTERVAL 7 DAY 
             THEN 1 ELSE 0 END) AS has_converted
    FROM user_exposures e
    LEFT JOIN tenant_workspace.product.core_events c 
        ON e.user_id = c.user_id AND c.event_type = 'checkout_completed'
    GROUP BY 1, 2
),
variant_stats AS (
    -- Step 3: Aggregate metrics per variant
    SELECT 
        variant_name,
        COUNT(user_id) AS visitors,
        SUM(has_converted) AS conversions,
        (SUM(has_converted)::FLOAT / COUNT(user_id)) AS conversion_rate
    FROM user_conversions
    GROUP BY 1
),
test_math AS (
    -- Step 4: Calculate pooled stats and Z-Score components
    SELECT 
        v_control.visitors AS n_c,
        v_control.conversions AS x_c,
        v_control.conversion_rate AS p_c,
        v_variant.visitors AS n_v,
        v_variant.conversions AS x_v,
        v_variant.conversion_rate AS p_v,
        -- Pooled proportion
        (v_control.conversions + v_variant.conversions)::FLOAT / 
        (v_control.visitors + v_variant.visitors) AS p_pool,
        -- Absolute Lift
        (v_variant.conversion_rate - v_control.conversion_rate) AS absolute_lift,
        -- Relative Lift
        ((v_variant.conversion_rate - v_control.conversion_rate) / v_control.conversion_rate) AS relative_lift
    FROM variant_stats v_control
    CROSS JOIN variant_stats v_variant
    WHERE v_control.variant_name = 'Control' 
      AND v_variant.variant_name = 'Variant_B'
)
-- Step 5: Final Output with Statistical Significance
SELECT 
    n_c AS control_visitors,
    p_c AS control_cr,
    n_v AS variant_visitors,
    p_v AS variant_cr,
    ROUND(relative_lift * 100, 2) AS relative_lift_pct,
    -- Calculate Standard Error (SE)
    SQRT(p_pool * (1 - p_pool) * (1.0/n_c + 1.0/n_v)) AS standard_error,
    -- Calculate Z-Score
    CASE 
        WHEN SQRT(p_pool * (1 - p_pool) * (1.0/n_c + 1.0/n_v)) = 0 THEN 0
        ELSE absolute_lift / SQRT(p_pool * (1 - p_pool) * (1.0/n_c + 1.0/n_v)) 
    END AS z_score,
    -- Significance boolean (Approximate 95% CI threshold Z > 1.96)
    ABS(absolute_lift / SQRT(p_pool * (1 - p_pool) * (1.0/n_c + 1.0/n_v))) >= 1.96 AS is_significant_95
FROM test_math;
        `
      }
    },
    {
      type: "ComparisonMatrix",
      payload: {
        title: "Experimentation Analytics: Build vs. Buy vs. Arcli",
        description: "Why relying solely on your feature flag tool's dashboard leaves you blind to product reality.",
        columns: ["Capability", "Arcli AI Diagnostic Agent", "Feature Flag Tool (Native BI)", "Internal Data Science Team"],
        rows: [
          ["Cross-Database Join", "Native (Stripe, Segment, Postgres)", "Impossible (Siloed to their events)", "Yes (Requires heavy ETL)"],
          ["Custom Guardrail Metrics", "Defined easily in Semantic Layer", "Limited to predefined standard events", "Requires custom SQL per test"],
          ["Automated Root-Cause Slicing", "Yes (AI Multi-Dimensional Search)", "Manual filtering only", "Takes days/weeks to build"],
          ["Sample Ratio Mismatch Checks", "Automated at query time", "Sometimes included", "Prone to human error"],
          ["Time to Insight", "Seconds (Natural Language)", "Minutes (If data is clean)", "Days (Ticket backlog)"]
        ]
      }
    },
    {
      type: "SecurityGuardrails",
      payload: {
        title: "Trusting the Math: Statistical Governance",
        description: "AI should not invent statistical formulas. Arcli enforces rigorous mathematical standards.",
        features: [
          {
            title: "Deterministic Equation Routing",
            description: "The LLM never writes the mathematical formula for a T-test or Z-test. The AI's job is simply to map the user's intent to Arcli's heavily tested, deterministic statistical macros."
          },
          {
            title: "Continuous SRM Monitoring",
            description: "If an experiment exhibits a Sample Ratio Mismatch (e.g., Variant B receives 50% more traffic than expected), Arcli's watchdog automatically flags the UI, warning the user that the underlying test data is corrupt."
          },
          {
            title: "Peeking Problem Prevention",
            description: "Arcli can be configured to enforce Minimum Detectable Effect (MDE) time-horizons, preventing PMs from prematurely stopping a test just because it reached false significance on Day 2."
          }
        ]
      }
    },
    {
      type: "FAQs",
      payload: {
        title: "Diagnostics & A/B Testing FAQs",
        faqs: [
          {
            question: "Does Arcli handle the traffic splitting and feature flagging?",
            answer: "No. Arcli is an analytics and diagnostic layer. You continue to use tools like LaunchDarkly, Statsig, or your own internal routing service to assign users. Arcli ingests the assignment logs and handles the complex downstream mathematical analysis."
          },
          {
            question: "Can Arcli calculate significance for continuous metrics like Revenue or Session Length?",
            answer: "Yes. While standard conversion rates use Two-Proportion Z-tests, Arcli automatically routes requests for continuous metrics (like Average Order Value) to Welch's T-test formulas, properly accounting for unequal variances."
          },
          {
            question: "How does the AI agent perform 'Root-Cause Slicing'?",
            answer: "When asked 'Why did this drop?', the `diagnostic_service` uses an algorithm to query the variance across all high-cardinality dimensions defined in your semantic layer (e.g., Browser, Country, Pricing Tier). It then surfaces the subsets with the highest mathematical contribution to the overall drop."
          },
          {
            question: "What happens if our event data is delayed or duplicated?",
            answer: "Arcli's Semantic Layer enforces strict deduplication (e.g., using `MAX` or `ROW_NUMBER()` window functions) to ensure a user is only counted as exposed or converted once, guaranteeing clean statistical inputs."
          }
        ]
      }
    }
  ]
};