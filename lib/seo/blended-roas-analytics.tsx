// lib/seo/blended-roas-analytics.tsx

export const blendedRoasAnalyticsData = {
  path: "/use-cases/blended-roas-analytics",
  meta: {
    title: "Automated Blended ROAS & Cross-Platform Analytics | Arcli",
    description: "Stop manually joining ad spend and revenue data. Arcli's AI agents automatically normalize and query Meta Ads, Google Ads, and Shopify data to deliver real-time Blended ROAS and LTV:CAC ratios.",
    keywords: ["blended ROAS", "cross-platform ad reporting", "Meta Ads to Shopify analytics", "Google Ads ROAS", "ecommerce AI analytics", "marketing data agent"]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "RevOps & Growth",
        title: "Real-Time Blended ROAS Without the Spreadsheet Tax",
        subtitle: "Deploy AI data agents to instantly join spend data from Meta and Google Ads with transactional data from Shopify and Stripe. Ask questions in plain English, get omnichannel truth in seconds.",
        primaryCta: {
          label: "Connect Ad Platforms",
          href: "/register?intent=marketing_ops"
        },
        secondaryCta: {
          label: "Explore How it Works",
          href: "#workflow"
        },
        trustSignals: [
          "Native API connectors for Meta, Google, Shopify & Stripe",
          "Sub-second query execution via DuckDB",
          "Automated schema normalization"
        ]
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "The Cost of Fragmented Attribution",
        businessOutcome: "Growth teams waste 10+ hours a week exporting CSVs to calculate true blended ROAS because platform-native reporting (like Facebook Ads Manager) inherently over-reports attribution. Arcli replaces this manual workflow with an autonomous semantic engine.",
        pillars: [
          {
            title: "Single Source of Truth",
            description: "By defining 'Total Spend' and 'Net Revenue' in the Arcli Semantic Layer, discrepancies between marketing platforms and actual cash-in-bank are eliminated."
          },
          {
            title: "Instant Diagnostic Answers",
            description: "When blended ROAS drops, your AI agent can instantly traverse ad group performance across multiple platforms to isolate the exact failing campaign."
          },
          {
            title: "Automated Pacing & Alerts",
            description: "Set up watchdogs to alert your Slack channel the moment customer acquisition cost (CAC) exceeds your target threshold for the day."
          }
        ]
      }
    },
    {
      type: "Workflow",
      payload: {
        title: "From Fragmented APIs to Unified AI Insights",
        description: "How Arcli orchestrates the chaotic data models of ad platforms into a unified semantic graph.",
        steps: [
          {
            step: 1,
            title: "Zero-ETL Ingestion",
            description: "Connect Meta Ads, Google Ads, and Shopify with OAuth. Arcli's sync engine immediately begins mirroring campaign performance and order data into your secure tenant schema."
          },
          {
            step: 2,
            title: "Schema Normalization",
            description: "The platform automatically standardizes disparate naming conventions (e.g., Google's `cost_micros` vs. Meta's `spend`) into a unified `normalized_ad_spend` view."
          },
          {
            step: 3,
            title: "Semantic Mapping",
            description: "Define your business logic once. Tell Arcli that `Blended ROAS` = `(Shopify Net Sales + Stripe MRR) / (Meta Spend + Google Spend)`."
          },
          {
            step: 4,
            title: "Conversational BI",
            description: "Marketers query the AI Agent directly: 'Show me blended ROAS by day for the last 14 days, split by new vs. returning customers'."
          }
        ]
      }
    },
    {
      type: "UseCases",
      payload: {
        title: "Cross-Platform Growth Scenarios",
        scenarios: [
          {
            level: "Basic",
            title: "Daily Blended ROAS Monitoring",
            businessQuestion: "What is our true return on ad spend across all channels today vs yesterday?",
            description: "The AI agent queries the normalized spend and revenue tables, providing a high-level executive view that bypasses platform-specific attribution windows, giving you the real 'cash-in vs cash-out' metric."
          },
          {
            level: "Intermediate",
            title: "First-Order Profitability by Campaign Category",
            businessQuestion: "Which ad platform is driving the highest first-order margin, accounting for COGS?",
            description: "The agent joins Shopify order data (including Cost of Goods Sold) with specific UTM parameters mapped to Meta and Google campaigns, calculating net profit per acquired user, not just top-line revenue."
          },
          {
            level: "Strategic",
            title: "Predictive LTV:CAC by Acquisition Cohort",
            businessQuestion: "How does the 6-month LTV of a customer acquired via Google Search compare to Meta Video Ads?",
            description: "Arcli orchestrates a complex cohort analysis, tracking subsequent Shopify purchases and Stripe subscriptions for users acquired in a specific month, mapped against the blended spend of that month."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "The Engine Room: Omnichannel Spend vs. Revenue SQL",
        description: "While the marketer just asks 'What's our Blended ROAS this week?', the Arcli engine generates this highly optimized query across isolated data silos.",
        businessOutcome: "Saves RevOps from writing complex UNIONs and JOINs across structurally incompatible API exports. Calculates true business metrics securely in real-time.",
        language: "sql",
        code: `
-- AI Agent Generated: Daily Blended ROAS & CAC Calculation
-- Dialect: DuckDB (via Arcli Compute Engine)
-- Target: Aggregate normalized daily spend across ad networks and divide by total daily net sales.

WITH daily_spend AS (
    -- Normalize and union spend from multiple ad platforms
    SELECT 
        DATE_TRUNC('day', date_start) AS metric_date,
        'Meta Ads' AS source,
        SUM(spend) AS daily_cost,
        SUM(clicks) AS traffic
    FROM tenant_workspace.meta_ads.campaign_insights
    GROUP BY 1, 2
    
    UNION ALL
    
    SELECT 
        DATE_TRUNC('day', segments_date) AS metric_date,
        'Google Ads' AS source,
        SUM(metrics_cost_micros / 1000000.0) AS daily_cost,
        SUM(metrics_clicks) AS traffic
    FROM tenant_workspace.google_ads.campaign_stats
    GROUP BY 1, 2
),
daily_revenue AS (
    -- Calculate true net sales (excluding refunds and taxes)
    SELECT 
        DATE_TRUNC('day', created_at) AS metric_date,
        COUNT(DISTINCT customer_id) AS unique_purchasers,
        SUM(total_price - total_tax - total_discounts) AS net_sales
    FROM tenant_workspace.shopify.orders
    WHERE financial_status IN ('paid', 'partially_refunded')
      AND cancelled_at IS NULL
    GROUP BY 1
)
SELECT 
    s.metric_date,
    SUM(s.daily_cost) AS total_ad_spend,
    COALESCE(r.net_sales, 0) AS total_net_revenue,
    COALESCE(r.unique_purchasers, 0) AS total_customers,
    -- Core Metric: Blended ROAS
    CASE 
        WHEN SUM(s.daily_cost) = 0 THEN 0 
        ELSE ROUND((COALESCE(r.net_sales, 0) / SUM(s.daily_cost)), 2) 
    END AS blended_roas,
    -- Core Metric: Blended CAC
    CASE 
        WHEN COALESCE(r.unique_purchasers, 0) = 0 THEN 0 
        ELSE ROUND((SUM(s.daily_cost) / r.unique_purchasers), 2) 
    END AS blended_cac
FROM daily_spend s
LEFT JOIN daily_revenue r ON s.metric_date = r.metric_date
WHERE s.metric_date >= CURRENT_DATE - INTERVAL 30 DAY
GROUP BY 1, 3, 4
ORDER BY s.metric_date DESC;
        `
      }
    },
    {
      type: "ComparisonMatrix",
      payload: {
        title: "Arcli vs. Traditional Marketing Dashboards",
        description: "Why static reporting fails modern performance marketing teams.",
        columns: ["Capability", "Arcli AI Agents", "Static BI (Looker/Tableau)", "In-Platform (Facebook/Google)"],
        rows: [
          ["Cross-Platform Data Joining", "Automated via Semantic Engine", "Requires dedicated Data Engineer", "Impossible (Siloed)"],
          ["Custom Business Logic (Net Margin)", "Defined once in natural language", "Complex SQL views required", "Limited to Gross Revenue"],
          ["Ad-hoc Deep Dives", "Ask questions via Chat", "Wait for data team ticket", "Rigid pre-built tables"],
          ["Anomaly Alerting", "Proactive AI Slack Alerts", "Basic threshold emails", "Algorithmic pacing only"]
        ]
      }
    },
    {
      type: "FAQs",
      payload: {
        title: "Technical & Implementation FAQs",
        faqs: [
          {
            question: "How frequently does Arcli sync data from ad platforms?",
            answer: "By default, Arcli's sync engine fetches updated campaign and order data hourly. For Enterprise tiers, syncs can be configured to near real-time (every 15 minutes) depending on API rate limits."
          },
          {
            question: "Does Arcli rely on third-party tracking pixels?",
            answer: "No. Arcli acts purely on server-side data natively ingested from your platform APIs (Shopify, Meta, Google). We do not use fragile browser pixels. We calculate true business metrics based on actual transactions and actual spend."
          },
          {
            question: "What happens when Meta or Google changes their API schema?",
            answer: "Arcli's managed ingestion service abstracts API changes away from your tenant. If Google deprecates a metric field, our integration layer handles the migration transparently, so your Blended ROAS calculations never break."
          },
          {
            question: "Can I bring my own data warehouse instead of using Arcli's storage?",
            answer: "Yes. While Arcli provides high-speed embedded DuckDB storage by default, enterprise customers can deploy our AI Agents directly on top of their existing Snowflake, BigQuery, or Redshift infrastructure (Zero-Copy Architecture)."
          }
        ]
      }
    }
  ]
};