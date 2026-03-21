import React from 'react';
import { LayoutTemplate, DollarSign, Users, ShoppingCart, Activity, ShieldCheck } from 'lucide-react';

/**
 * TemplateBlueprint Schema
 * Refined for the Arcli High-Performance Stack.
 * Fixed property mismatch: 'application' is now correctly typed.
 * UI Focus: Tactical spec-sheets for analytical workflows.
 */
export type TemplateBlueprint = {
  id: string;
  type: 'template';
  metadata: {
    title: string;
    description: string;
    canonicalDomain: string; // arcli.tech
  };
  hero: {
    h1: string;
    subtitle: string;
    icon: React.ReactElement;
  };
  technicalStack: {
    engine: 'DuckDB' | 'Polars' | 'SQL-Pushdown';
    format: 'Parquet' | 'Columnar' | 'JSONB-Unnested';
    compute: string;
  };
  performanceMetrics: string[];
  orchestrationWorkflow: {
    phase: string;
    action: string;
  }[];
  queryArchitecture: {
    intent: string;
    vectorizedPattern: string;
    logicalOutcome: string;
    insight: string;
  };
  strategicContext: {
    title: string;
    industrialConstraints: string[];
    arcliEfficiency: string;
  };
  enterpriseApplications: {
    vertical: string;
    application: string; // Fixed: Property name now matches object literal
  }[];
  governanceAndSecurity: {
    q: string;
    a: string;
  }[];
  relatedBlueprints: string[];
};

export const dashboardTemplates: Record<string, TemplateBlueprint> = {
  'sales-dashboard-template': {
    id: 'sales-blueprint-001',
    type: 'template',
    metadata: {
      title: 'AI Sales Dashboard Blueprint | Arcli Analytics',
      description: 'Deploy pre-configured Sales analytics. Leverage vectorized KPI logic to track pipeline velocity and win-rates with sub-second latency.',
      canonicalDomain: 'arcli.tech'
    },
    hero: {
      h1: 'The Sales Intelligence Blueprint',
      subtitle: 'Instantiate a high-performance sales leadership dashboard. Decouple your CRM data from rigid UI constraints using semantic RAG and vectorized SQL orchestration.',
      icon: <LayoutTemplate className="w-12 h-12 text-indigo-500 mb-6" />
    },
    technicalStack: {
      engine: 'SQL-Pushdown',
      format: 'Columnar',
      compute: 'Vectorized Window Functions for Pipeline Snapshotting'
    },
    performanceMetrics: [
      'Vectorized Win-Rate Calculation',
      'Stateless Pipeline Snapshotting',
      'Tenant-Isolated Rep Views',
      'Semantic Fragment Schema Mapping'
    ],
    strategicContext: {
      title: 'Overcoming CRM Ecosystem Rigidity',
      industrialConstraints: [
        'Traditional CRM reporting engines rely on hierarchical relational models that struggle with complex cross-object joins.',
        'Historical pipeline state tracking (snapshotting) often requires heavy manual data movement or third-party middleware.',
        'Siloed data prevents a unified view of sales performance against external finance or quota spreadsheets.'
      ],
      arcliEfficiency: 'Arcli functions as a modular compute layer. By utilizing semantic routing, we map your unique CRM schema to optimized SQL patterns, executing complex aggregations like pipeline velocity in milliseconds.'
    },
    orchestrationWorkflow: [
      { phase: 'Discovery', action: 'Securely link Salesforce/HubSpot via read-only credentials. Arcli maps the schema metadata instantly.' },
      { phase: 'Hydration', action: 'The AI orchestrator populates pre-configured KPI modules with your specific deal stages and custom fields.' },
      { phase: 'Execution', action: 'Render interactive Vega-Lite visualizations powered by in-process DuckDB compute.' }
    ],
    queryArchitecture: {
      intent: "Calculate win-rate by sales rep for the current quarter, isolating qualified pipeline.",
      vectorizedPattern: `WITH qualified_ops AS (
  SELECT owner_id, is_won, is_closed
  FROM opportunities
  WHERE created_at >= DATE_TRUNC('quarter', CURRENT_DATE)
    AND stage_name NOT IN ('Initial Inquiry', 'Disqualified')
)
SELECT 
  u.name AS sales_rep,
  COUNT(*) FILTER (WHERE o.is_won = TRUE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE o.is_closed = TRUE), 0) AS win_rate_pct
FROM qualified_ops o
JOIN users u ON o.owner_id = u.id
GROUP BY 1 ORDER BY 2 DESC;`,
      logicalOutcome: "High-density Ranked Bar Chart",
      insight: "Automated isolation of top-performing reps based on high-intent pipeline conversion."
    },
    enterpriseApplications: [
      { vertical: 'Sales Operations', application: 'Automate executive forecasting models without the overhead of maintaining complex CRM report types.' },
      { vertical: 'Revenue Leadership', application: 'Enable ad-hoc, conversational deep-dives into rep-level efficiency during 1-on-1 coaching cycles.' }
    ],
    governanceAndSecurity: [
      { q: 'How does the template handle custom CRM objects?', a: 'Arcli uses semantic RAG to scan your metadata. It identifies custom __c fields and objects, incorporating them into the query planner to ensure your unique business logic is preserved.' },
      { q: 'Is my CRM data modified?', a: 'No. Arcli maintains a strict read-only analytical perimeter. We utilize least-privilege access to fetch data for computation without ever altering the source of truth.' }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template', 'analyze-salesforce-data']
  },

  'saas-metrics-dashboard-template': {
    id: 'saas-blueprint-002',
    type: 'template',
    metadata: {
      title: 'SaaS Metrics & Revenue Blueprint | Arcli',
      description: 'Automate MRR, Churn, and LTV tracking. High-precision SaaS financial modeling using window-function orchestration and vectorized compute.',
      canonicalDomain: 'arcli.tech'
    },
    hero: {
      h1: 'The SaaS Revenue Recognition Blueprint',
      subtitle: 'Eliminate manual revenue reconciliation. Track MRR waterfalls and cohort retention with linear-algebraic precision using our decoupled compute engine.',
      icon: <DollarSign className="w-12 h-12 text-emerald-500 mb-6" />
    },
    technicalStack: {
      engine: 'Polars',
      format: 'Parquet',
      compute: 'Linear Algebra-based Forecasting (EMA) and Cohort Inversion'
    },
    performanceMetrics: [
      'Stateless MRR Waterfall Logic',
      'Vectorized Cohort Retention Matrix',
      'Automated CAC Payback Modeling',
      'Real-Time Event Stream Processing'
    ],
    strategicContext: {
      title: 'The Complexity of Revenue Recognition',
      industrialConstraints: [
        'Native billing platforms often lack the flexibility to handle custom enterprise contracts or specific refund-recognition logic.',
        'Calculating Net Revenue Retention (NRR) requires complex self-joins and state-tracking that spreadsheets cannot scale.',
        'Separation of billing data (Stripe) and product usage data (Postgres) leads to fragmented health scoring.'
      ],
      arcliEfficiency: 'Arcli utilizes advanced window functions and CTEs to partition revenue movements (Expansion, Churn, Contraction) at the compute layer. This ensures mathematical precision while maintaining 100% data freshness.'
    },
    orchestrationWorkflow: [
      { phase: 'Ingestion', action: 'Connect billing (Stripe/Paddle) and product usage databases.' },
      { phase: 'Mapping', action: 'Define the semantic boundary for "Active User" and "Recognized Revenue" within the Arcli Metric Governance layer.' },
      { phase: 'Insight', action: 'Instantly generate audit-ready SaaS metrics and waterfall charts.' }
    ],
    queryArchitecture: {
      intent: "Generate a 6-month MRR waterfall isolating Expansion and Contraction movements.",
      vectorizedPattern: `WITH mrr_delta AS (
  SELECT 
    DATE_TRUNC('month', billing_date) AS month,
    movement_type,
    SUM(amount) as delta
  FROM subscription_events
  WHERE billing_date >= CURRENT_DATE - INTERVAL '6 months'
  GROUP BY 1, 2
)
SELECT * FROM mrr_delta PIVOT (SUM(delta) FOR movement_type IN ('new', 'expansion', 'contraction', 'churn'));`,
      logicalOutcome: "Stacked Waterfall Visualization",
      insight: "Precise identification of expansion revenue growth outpacing churn, driving NRR improvements."
    },
    enterpriseApplications: [
      { vertical: 'Finance & Investors', application: 'Deliver audit-ready, high-fidelity SaaS metrics for board meetings and investor due diligence.' },
      { vertical: 'Product Growth', application: 'Overlay usage telemetry with revenue data to identify high-LTV feature adoption patterns.' }
    ],
    governanceAndSecurity: [
      { q: 'Can this blueprint handle usage-based pricing?', a: 'Yes. Arcli thrives on complex metering data. By pointing the template to your usage database, it can orchestrate hybrid models combining flat-fee and usage-based revenue.' },
      { q: 'How secure is the financial data processing?', a: 'Arcli is built with tenant-isolation by design. Every query is executed within a secure, isolated compute context, ensuring that sensitive financial rows are never leaked across environments.' }
    ],
    relatedBlueprints: ['marketing-dashboard-template', 'ecommerce-dashboard-template']
  },

  'marketing-dashboard-template': {
    id: 'mkt-blueprint-003',
    type: 'template',
    metadata: {
      title: 'Marketing ROI & Attribution Blueprint | Arcli',
      description: 'Unify ad-spend and revenue data. Deploy automated ROAS and CAC dashboards using cross-platform semantic joins and vectorized compute.',
      canonicalDomain: 'arcli.tech'
    },
    hero: {
      h1: 'The Marketing Attribution Blueprint',
      subtitle: 'Unify siloed ad data and CRM revenue. Track true blended ROAS using our semantic bridge that links UTM parameters directly to closed-won outcomes.',
      icon: <Users className="w-12 h-12 text-pink-500 mb-6" />
    },
    technicalStack: {
      engine: 'DuckDB',
      format: 'Columnar',
      compute: 'WASM-Powered Cross-Platform Joins at the Edge'
    },
    performanceMetrics: [
      'Blended CAC Vectorization',
      'Multi-Touch Attribution Logic',
      'Automated UTM Parsing',
      'Zero-Latency Funnel Rendering'
    ],
    strategicContext: {
      title: 'The Marketing Attribution Silo',
      industrialConstraints: [
        'Ad platforms (Google/Meta Ads) inherently prioritize their own conversion metrics, leading to over-reported ROI.',
        'Linking fragmented ad-spend with actual CRM revenue usually requires extensive custom data engineering.',
        'Standard marketing dashboards suffer from high latency when processing massive event-level traffic logs.'
      ],
      arcliEfficiency: 'Arcli acts as the semantic orchestrator. By joining your ad warehouse (spend) with your CRM (revenue), the AI writes optimized SQL to attribute real pipeline value to specific UTM sources, eliminating guesswork.'
    },
    orchestrationWorkflow: [
      { phase: 'Aggregation', action: 'Connect ad-spend warehouses and CRM datasets.' },
      { phase: 'Correlation', action: 'Utilize Arcli’s semantic mapper to link click-stream UTMs with lead-conversion records.' },
      { phase: 'Optimization', action: 'Evaluate ROAS in real-time and reallocate budgets via conversational ad-hoc queries.' }
    ],
    queryArchitecture: {
      intent: "Calculate Blended CAC by UTM Source for the last 90 days.",
      vectorizedPattern: `WITH spend_attr AS (
  SELECT utm_source, SUM(spend) as total_spend FROM daily_ads WHERE date >= CURRENT_DATE - 90 GROUP BY 1
),
conversions AS (
  SELECT utm_source, COUNT(id) as customers FROM users WHERE created_at >= CURRENT_DATE - 90 GROUP BY 1
)
SELECT s.utm_source, s.total_spend / NULLIF(c.customers, 0) AS blended_cac
FROM spend_attr s JOIN conversions c USING (utm_source) ORDER BY 2 ASC;`,
      logicalOutcome: "Heatmapped Attribution Table",
      insight: "Discovery of high-efficiency organic channels vs. expensive paid acquisition segments."
    },
    enterpriseApplications: [
      { vertical: 'Growth Marketing', application: 'Execute real-time budget reallocation based on true pipeline ROI rather than platform-reported clicks.' },
      { vertical: 'Performance Agencies', application: 'Provide clients with transparent, revenue-backed reporting that proves actual business impact.' }
    ],
    governanceAndSecurity: [
      { q: 'Do you support multi-touch attribution?', a: 'Yes. Our AI orchestrator can generate logic for first-touch, last-touch, or linear models based on your raw event-tracking data stored in the warehouse.' },
      { q: 'Is there a limit on log data volume?', a: 'No. Arcli pushes the heavy compute to your warehouse and uses in-browser DuckDB for visual rendering, handling millions of event logs with zero server-side lag.' }
    ],
    relatedBlueprints: ['google-analytics-ai-dashboard', 'sales-dashboard-template']
  },

  'ecommerce-dashboard-template': {
    id: 'ecom-blueprint-004',
    type: 'template',
    metadata: {
      title: 'E-Commerce Intelligence Blueprint | Arcli Analytics',
      description: 'Optimize retail profitability. Track inventory velocity, true SKU margins, and cohort LTV using high-velocity columnar compute patterns.',
      canonicalDomain: 'arcli.tech'
    },
    hero: {
      h1: 'The E-Commerce Performance Blueprint',
      subtitle: 'Identify true SKU margins and inventory reorder points. Deploy this blueprint to unify Shopify, shipping, and ad data for absolute profitability visibility.',
      icon: <ShoppingCart className="w-12 h-12 text-emerald-400 mb-6" />
    },
    technicalStack: {
      engine: 'DuckDB',
      format: 'JSONB-Unnested',
      compute: 'Predictive Inventory Depletion via ARIMA/Linear Extrapolation'
    },
    performanceMetrics: [
      'Inventory Depletion Forecasting',
      'True Net Margin Calculation',
      'LTV/CAC Vectorized Ratios',
      'Nested JSON Order Parsing'
    ],
    strategicContext: {
      title: 'The Blindspots of Retail Analytics',
      industrialConstraints: [
        'Basic e-commerce reporting often ignores variable shipping costs and COGS, inflating perceived profitability.',
        'Repurchase rate analysis across cohorts is computationally expensive and difficult to build in traditional tools.',
        'Inventory forecasting often relies on static historical averages, ignoring recent seasonality and trends.'
      ],
      arcliEfficiency: 'Arcli unites transactional and operational data. By utilizing vectorized EMA (Exponential Moving Average) logic, we forecast inventory depletion and calculate True Net Margin at the individual SKU level.'
    },
    orchestrationWorkflow: [
      { phase: 'Normalization', action: 'Unpack nested Shopify JSON payloads into optimized columnar tables.' },
      { phase: 'Correlation', action: 'Link COGS and shipping data to transactional line items.' },
      { phase: 'Forecasting', action: 'Utilize predictive AI to determine optimal inventory reorder points.' }
    ],
    queryArchitecture: {
      intent: "Show 30-day repeat purchase rate for Black Friday cohorts vs. annual baseline.",
      vectorizedPattern: `WITH bf_cohort AS (
  SELECT user_id, MIN(order_date) as start FROM orders WHERE order_date BETWEEN '2025-11-25' AND '2025-11-30' GROUP BY 1
),
repeats AS (
  SELECT b.user_id FROM bf_cohort b JOIN orders o ON b.user_id = o.user_id 
  WHERE o.order_date > b.start AND o.order_date <= b.start + INTERVAL '30 days'
)
SELECT COUNT(DISTINCT r.user_id) * 100.0 / COUNT(DISTINCT b.user_id) as repeat_rate_pct FROM bf_cohort b LEFT JOIN repeats r USING (user_id);`,
      logicalOutcome: "Cohort Comparison KPI Cards",
      insight: "Quantification of seasonal customer quality vs. standard acquisition channels."
    },
    enterpriseApplications: [
      { vertical: 'Merchandising', application: 'Optimize product mix by identifying "gateway" SKUs that drive the highest 12-month Customer Lifetime Value.' },
      { vertical: 'Operations', application: 'Manage stock levels dynamically based on real-time depletion rates and supplier lead times.' }
    ],
    governanceAndSecurity: [
      { q: 'How does it handle massive order volumes?', a: 'Arcli uses a zero-caching direct execution model. It leverages your warehouse compute and DuckDB WebAssembly to explore millions of rows without degrading performance.' },
      { q: 'Can I track subscription revenue?', a: 'Absolutely. The blueprint integrates with subscription schemas (like Recharge or Stripe) to calculate MRR and churn within the e-commerce context.' }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template', 'analyze-shopify-data']
  }
};