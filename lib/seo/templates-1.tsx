// lib/seo/templates-1.tsx
import React from 'react';
import { LayoutTemplate, DollarSign } from 'lucide-react';

/**
 * TemplateBlueprint Schema
 * Refined for the Arcli High-Performance Stack.
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
    application: string;
  }[];
  governanceAndSecurity: {
    q: string;
    a: string;
  }[];
  relatedBlueprints: string[];
};

export const dashboardTemplatesPart1: Record<string, TemplateBlueprint> = {
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
  }
};