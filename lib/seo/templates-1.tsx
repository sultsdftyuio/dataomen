// lib/seo/templates-1.tsx
import React from 'react';
import { LayoutTemplate, DollarSign, Database, Download, Zap } from 'lucide-react';

/**
 * TemplateBlueprint Schema
 * Upgraded for SEO, Conversion, and High-Performance Programmatic Generation.
 * Designed to capture long-tail keywords while providing instant value (SQL snippets)
 * to data engineers, RevOps, and CFOs.
 */
export interface TemplateBlueprint {
  id: string;
  type: 'template';
  metadata: {
    title: string;
    description: string;
    canonicalDomain: string; // arcli.tech
    keywords: string[];
    intent: 'template' | 'guide' | 'comparison';
  };
  hero: {
    h1: string;
    subtitle: string;
    icon: React.ReactElement;
  };
  // NEW: Immediate Value section for < 5-second scannability
  immediateValue: string[];
  // NEW: Quick start to prove low time-to-value
  quickStart: {
    timeToValue: string;
    steps: string[];
  };
  // NEW: Downloadable assets for conversion/lead gen
  assets?: {
    type: 'sql' | 'csv' | 'notion' | 'pdf';
    label: string;
    url: string;
    icon: React.ReactElement;
  }[];
  technicalStack: {
    engine: 'DuckDB' | 'Polars' | 'SQL-Pushdown';
    format: 'Parquet' | 'Columnar' | 'JSONB-Unnested';
    compute: string;
  };
  performanceMetrics: string[];
  orchestrationWorkflow: {
    phase1: { name: string; description: string };
    phase2: { name: string; description: string };
    phase3: { name: string; description: string };
  };
  strategicContext: {
    title: string;
    industrialConstraints: string[];
    arcliEfficiency: string;
  };
  analyticalScenarios: {
    level: 'Basic' | 'Intermediate' | 'Advanced' | 'Strategic';
    title: string;
    description: string;
    exampleQuery: string;
    exampleSql: string;
    businessOutcome: string;
  }[];
  businessValueAndROI: {
    metric: string;
    impact: string;
    timeframe: string;
  }[];
  enterpriseApplications: {
    vertical: string;
    application: string;
  }[];
  trustAndSecurity: {
    guarantee: string;
    mechanism: string;
  }[];
  faqs: {
    persona: 'CEO' | 'CFO' | 'Data Engineer' | 'CISO' | 'RevOps' | 'Marketing Director';
    q: string;
    a: string;
  }[];
  relatedBlueprints: string[];
}

export const dashboardTemplatesPart1: Record<string, TemplateBlueprint> = {
  'sales-dashboard-template': {
    id: 'sales-blueprint-001',
    type: 'template',
    metadata: {
      title: 'Sales Dashboard Template & SQL Metrics Guide | Arcli',
      description: 'Free SQL templates to calculate win rate, pipeline velocity, and forecasting. Connect Salesforce or HubSpot and run in seconds without complex BI tools.',
      canonicalDomain: 'arcli.tech',
      keywords: ['sales dashboard template', 'how to calculate win rate sql', 'pipeline dashboard example', 'salesforce sql metrics', 'revops dashboard'],
      intent: 'template'
    },
    hero: {
      h1: 'Sales Dashboard Template (Free SQL + Metrics Guide)',
      subtitle: 'Track pipeline, win rate, and revenue instantly using pre-built SQL templates. Built for Salesforce, HubSpot, and modern data teams seeking answers without the BI bottleneck.',
      icon: <LayoutTemplate className="w-12 h-12 text-indigo-500 mb-6" />
    },
    immediateValue: [
      'Pre-built SQL for win rate, pipeline velocity, and executive forecasting.',
      'Works instantly with Salesforce, HubSpot, and Postgres.',
      'No rigid BI tools or multi-week IT tickets required.',
      'Runs in milliseconds directly on your live CRM data.'
    ],
    quickStart: {
      timeToValue: '< 3 minutes',
      steps: [
        'Securely link your CRM via read-only OAuth.',
        'Arcli automatically maps your custom fields (e.g., industry__c).',
        'Copy and paste the pre-built SQL below to generate your charts.'
      ]
    },
    assets: [
      {
        type: 'sql',
        label: 'Download Full Sales SQL Library (.sql)',
        url: '#', // Replace with actual asset link in production
        icon: <Database className="w-4 h-4 mr-2" />
      },
      {
        type: 'notion',
        label: 'Duplicate Notion Sales Dashboard',
        url: '#',
        icon: <Download className="w-4 h-4 mr-2" />
      }
    ],
    technicalStack: {
      engine: 'SQL-Pushdown',
      format: 'Columnar',
      compute: 'Vectorized Window Functions'
    },
    performanceMetrics: [
      'Instantly calculate Win-Rate across reps',
      'Track historical pipeline changes at any point in time',
      'View rep-level performance with secure tenant isolation',
      'Works seamlessly with your custom CRM fields automatically'
    ],
    strategicContext: {
      title: 'Bypass CRM Ecosystem Rigidity',
      industrialConstraints: [
        'Standard CRM reports struggle with complex questions and cross-object data joins.',
        'Tracking historical pipeline state usually requires expensive third-party tools or heavy data engineering.',
        'It’s nearly impossible to unify sales performance with external billing or quota spreadsheets natively.'
      ],
      arcliEfficiency: 'Arcli acts as an instant compute layer. We connect to your CRM, translate your custom fields automatically, and let you ask net-new pipeline questions that execute in milliseconds—no ETL required.'
    },
    orchestrationWorkflow: {
      phase1: {
        name: 'Instant Connection',
        description: 'Securely link Salesforce or HubSpot. Arcli maps the schema instantly, understanding your unique custom fields and stages.'
      },
      phase2: {
        name: 'Contextual AI Hydration',
        description: 'Our AI reads your deal stages and business logic, ensuring it understands what "Closed Won" actually means for your specific company.'
      },
      phase3: {
        name: 'Run & Visualize',
        description: 'Execute the provided SQL templates or ask plain-text questions to instantly render beautiful, presentation-ready charts.'
      }
    },
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'Win-Rate by Sales Rep',
        description: 'Instantly isolate top-performing reps based on high-intent pipeline conversion. Copy this query to your database.',
        exampleQuery: "Calculate win-rate by sales rep for the current quarter, ignoring disqualified leads.",
        exampleSql: `WITH qualified_ops AS (
  SELECT owner_id, is_won, is_closed
  FROM sales_opportunities
  WHERE created_at >= DATE_TRUNC('quarter', CURRENT_DATE)
    AND stage_name NOT IN ('Initial Inquiry', 'Disqualified')
)
SELECT 
  u.name AS sales_rep,
  COUNT(*) AS total_qualified_pipeline,
  ROUND(COUNT(*) FILTER (WHERE o.is_won = TRUE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE o.is_closed = TRUE), 0), 2) AS win_rate_pct
FROM qualified_ops o
JOIN users u ON o.owner_id = u.id
GROUP BY 1 
HAVING COUNT(*) > 5
ORDER BY win_rate_pct DESC;`,
        businessOutcome: 'Provides immediate visibility into which reps are effectively closing qualified pipeline versus just generating volume.'
      },
      {
        level: 'Intermediate',
        title: 'Pipeline Velocity by Industry',
        description: 'Measure the exact number of days it takes to close a deal, cross-referenced with your custom account fields.',
        exampleQuery: "Show me the average sales cycle length in days for closed-won opportunities, grouped by the Account's Industry.",
        exampleSql: `SELECT 
  a.industry_custom_field AS account_industry,
  AVG(DATE_PART('day', o.close_date::timestamp - o.created_date::timestamp)) AS avg_cycle_days,
  COUNT(o.id) AS total_won_deals
FROM sales_opportunities o
JOIN sales_accounts a ON o.account_id = a.id
WHERE o.is_won = TRUE 
  AND o.close_date >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY 1
HAVING COUNT(o.id) > 10
ORDER BY 2 DESC;`,
        businessOutcome: 'Reveals exact cycle times (e.g., Enterprise Healthcare takes 142 days), enabling much more accurate quarterly cash-flow forecasting.'
      },
      {
        level: 'Advanced',
        title: 'Identify Stalled Deals',
        description: 'Track how long active deals have been sitting in their current stage compared to your historical averages.',
        exampleQuery: "Which active deals in the 'Legal Review' stage have been stalled longer than our historical 14-day average?",
        exampleSql: `WITH current_stage_duration AS (
  SELECT 
    opportunity_id,
    stage_name,
    DATE_PART('day', CURRENT_TIMESTAMP - MAX(system_modstamp)) as days_in_current_stage
  FROM sales_opportunity_history
  GROUP BY 1, 2
)
SELECT 
  o.name AS deal_name,
  u.name AS rep_name,
  o.amount,
  csd.days_in_current_stage
FROM sales_opportunities o
JOIN current_stage_duration csd ON o.id = csd.opportunity_id
JOIN users u ON o.owner_id = u.id
WHERE o.is_closed = FALSE 
  AND csd.stage_name = 'Legal Review'
  AND csd.days_in_current_stage > 14
ORDER BY o.amount DESC;`,
        businessOutcome: 'Highlights multi-million dollar bottlenecks in the legal process, allowing RevOps to intervene before the quarter ends.'
      },
      {
        level: 'Strategic',
        title: 'Cross-Platform Retention Forecasting',
        description: 'Predict future churn and expansion by combining CRM renewal opportunities with external product usage data.',
        exampleQuery: "Forecast next quarter's Net Revenue Retention by joining CRM renewals with active user counts from our database.",
        exampleSql: `/* Arcli automatically joins CRM data with external telemetry */
SELECT 
  o.account_id,
  a.name AS account_name,
  o.amount AS renewal_value,
  p.active_users_30d,
  EXP(SUM(LN(1 - COALESCE(c.churn_probability, 0.1)))) AS predicted_retention_rate,
  (o.amount * EXP(SUM(LN(1 - COALESCE(c.churn_probability, 0.1))))) AS expected_retained_revenue
FROM sales_opportunities o
JOIN sales_accounts a ON o.account_id = a.id
LEFT JOIN internal_product_telemetry p ON a.domain = p.company_domain
LEFT JOIN external_churn_models c ON o.account_id = c.account_id
WHERE o.type = 'Renewal' 
  AND o.close_date >= DATE_TRUNC('quarter', CURRENT_DATE + INTERVAL '3 months')
GROUP BY 1, 2, 3, 4
ORDER BY expected_retained_revenue DESC;`,
        businessOutcome: 'Provides the Board with a rigorous forecast of retained revenue that removes emotional pipeline inflation.'
      }
    ],
    businessValueAndROI: [
      {
        metric: 'Data Engineering Hours Saved',
        impact: 'Reduce CRM custom report-building ticket queues by 85%.',
        timeframe: 'Immediate (Day 1)'
      },
      {
        metric: 'Forecasting Accuracy',
        impact: 'Increase pipeline predictability by utilizing strict historical data instead of flat averages.',
        timeframe: 'First Quarter'
      },
      {
        metric: 'Executive Agility',
        impact: 'Answer net-new board questions live during meetings without waiting for RevOps to export data to Excel.',
        timeframe: 'Ongoing'
      }
    ],
    enterpriseApplications: [
      { vertical: 'Sales Operations', application: 'Automate executive forecasting without maintaining complex CRM report types.' },
      { vertical: 'Revenue Leadership', application: 'Enable ad-hoc, conversational deep-dives into rep-level efficiency during coaching.' }
    ],
    trustAndSecurity: [
      { guarantee: 'Zero-Mutation Architecture', mechanism: 'Arcli utilizes strict read-only tokens. It is architecturally impossible for our engine to alter or delete your CRM data.' },
      { guarantee: 'Tenant-Isolated Compute', mechanism: 'All analytical SQL executes within isolated secure environments, ensuring zero cross-tenant data leakage.' }
    ],
    faqs: [
      {
        persona: 'CEO',
        q: 'How does this accelerate our Board reporting?',
        a: 'Instead of waiting two weeks for RevOps to compile static slides from CRM exports, Arcli allows you to ask conversational questions live during a board meeting. You get precise answers and charts instantly.'
      },
      {
        persona: 'RevOps',
        q: 'How does the template handle our highly customized CRM objects and fields?',
        a: 'Arcli scans your metadata upon connection. It dynamically identifies custom fields (e.g., `industry__c`) mapping them automatically so the system speaks your exact revenue language.'
      },
      {
        persona: 'Data Engineer',
        q: 'How do you bypass standard CRM API allocation limits?',
        a: 'We use a smart syncing mechanism. Arcli runs incremental batch syncing to highly optimized files in the background. Live queries hit this replica, ensuring zero load on your live CRM API limits.'
      },
      {
        persona: 'CISO',
        q: 'Is our pipeline data used to train public AI models?',
        a: 'No. Arcli adheres to a strict Zero-Mutation and Local-First Processing model. Your data is isolated per tenant and encrypted at rest. We never use customer data to train external LLMs.'
      }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template', 'marketing-attribution-blueprint']
  },

  'saas-metrics-dashboard-template': {
    id: 'saas-blueprint-002',
    type: 'template',
    metadata: {
      title: 'SaaS Metrics Dashboard Template (SQL + MRR Guide) | Arcli',
      description: 'Automate MRR, Churn, and CAC calculations. Copy-paste these SaaS SQL templates to track revenue cohorts instantly without spreadsheets.',
      canonicalDomain: 'arcli.tech',
      keywords: ['saas metrics dashboard', 'mrr formula saas', 'mrr waterfall sql', 'nrr cohort analysis', 'stripe sql queries'],
      intent: 'template'
    },
    hero: {
      h1: 'SaaS Metrics Dashboard Template (SQL + MRR Guide)',
      subtitle: 'Eliminate manual revenue reconciliation in spreadsheets. Copy-paste these SQL templates to track MRR waterfalls, NRR cohorts, and CAC payback instantly.',
      icon: <DollarSign className="w-12 h-12 text-emerald-500 mb-6" />
    },
    immediateValue: [
      'Pre-built SQL for MRR waterfalls, NRR cohorts, and Churn.',
      'Blend Stripe billing data with Postgres product usage instantly.',
      'Calculates mathematically precise Net Revenue Retention (NRR).',
      'Downloadable code blocks ready for your data warehouse.'
    ],
    quickStart: {
      timeToValue: '< 5 minutes',
      steps: [
        'Connect your billing provider (Stripe/Paddle) and database.',
        'Define what constitutes an "Active User" in Arcli.',
        'Run the exact SQL snippets below to generate your SaaS metrics.'
      ]
    },
    assets: [
      {
        type: 'sql',
        label: 'Get the SaaS Metrics SQL Pack',
        url: '#',
        icon: <Database className="w-4 h-4 mr-2" />
      },
      {
        type: 'pdf',
        label: 'SaaS Metrics Definitions Guide',
        url: '#',
        icon: <Zap className="w-4 h-4 mr-2" />
      }
    ],
    technicalStack: {
      engine: 'Polars',
      format: 'Parquet',
      compute: 'Linear Algebra & Cohort Inversion'
    },
    performanceMetrics: [
      'Stateless MRR Waterfall generation',
      'Instant Cohort Retention Matrices',
      'Automated CAC Payback modeling',
      'Real-Time Event Stream parsing'
    ],
    strategicContext: {
      title: 'The Complexity of Revenue Recognition',
      industrialConstraints: [
        'Native billing platforms lack the flexibility to handle custom B2B contracts, mid-cycle upgrades, or specific refund logic.',
        'Calculating Net Revenue Retention (NRR) across historical cohorts breaks standard spreadsheets.',
        'Separating billing data from frontend product usage data leads to fragmented, inaccurate health scoring.'
      ],
      arcliEfficiency: 'Arcli utilizes advanced SQL to cleanly partition revenue movements (New, Expansion, Contraction, Churn) directly at the compute layer. This guarantees mathematical accuracy and 100% data freshness without brittle ETL pipelines.'
    },
    orchestrationWorkflow: {
      phase1: {
        name: 'Zero-Copy Ingestion',
        description: 'Connect directly to your transactional databases (Postgres) or billing providers (Stripe) via secure, read-only layers.'
      },
      phase2: {
        name: 'Define Your Logic',
        description: 'Set your specific business rules for crucial definitions like "Recognized Revenue" and "Churn Date" once, and Arcli applies it everywhere.'
      },
      phase3: {
        name: 'Instant Financial Charts',
        description: 'Arcli executes highly complex SQL aggregates locally to render audit-ready financial charts in sub-second timeframes.'
      }
    },
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'Generate an MRR Waterfall',
        description: 'Create a pristine 12-month MRR waterfall isolating Expansion and Contraction movements. Run this in your database today.',
        exampleQuery: "Show me our MRR waterfall for the last 12 months, breaking out New, Expansion, Contraction, and Churned revenue.",
        exampleSql: `WITH mrr_delta AS (
  SELECT 
    DATE_TRUNC('month', billing_date) AS month,
    movement_type,
    SUM(amount) as delta
  FROM subscription_events
  WHERE billing_date >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY 1, 2
)
SELECT 
  month,
  COALESCE(SUM(delta) FILTER (WHERE movement_type = 'new'), 0) AS new_mrr,
  COALESCE(SUM(delta) FILTER (WHERE movement_type = 'expansion'), 0) AS expansion_mrr,
  COALESCE(SUM(delta) FILTER (WHERE movement_type = 'contraction'), 0) AS contraction_mrr,
  COALESCE(SUM(delta) FILTER (WHERE movement_type = 'churn'), 0) AS churn_mrr,
  SUM(delta) AS net_new_mrr
FROM mrr_delta 
GROUP BY 1
ORDER BY 1 ASC;`,
        businessOutcome: 'Provides immediate clarity on whether your growth is being driven by new acquisition or existing account expansion.'
      },
      {
        level: 'Intermediate',
        title: 'Net Revenue Retention (NRR) Cohorts',
        description: 'Track how revenue compounds (or decays) over time based on the month a customer was acquired.',
        exampleQuery: "Generate an NRR cohort analysis for customers acquired in 2024, showing revenue retention at month 3, 6, and 9.",
        exampleSql: `WITH cohorts AS (
  SELECT customer_id, DATE_TRUNC('month', MIN(billing_date)) as cohort_month, SUM(amount) as initial_mrr
  FROM subscription_events WHERE movement_type = 'new' GROUP BY 1
),
retention AS (
  SELECT 
    c.cohort_month,
    DATE_PART('month', AGE(e.billing_date, c.cohort_month)) as month_index,
    SUM(e.amount) as retained_mrr
  FROM subscription_events e
  JOIN cohorts c ON e.customer_id = c.customer_id
  WHERE DATE_PART('month', AGE(e.billing_date, c.cohort_month)) IN (3, 6, 9)
  GROUP BY 1, 2
)
SELECT 
  cohort_month,
  month_index,
  ROUND((retained_mrr / MAX(SUM(c.initial_mrr)) OVER (PARTITION BY cohort_month)) * 100, 2) AS nrr_percentage
FROM retention r
JOIN cohorts c ON r.cohort_month = c.cohort_month
GROUP BY 1, 2, retained_mrr
ORDER BY 1, 2;`,
        businessOutcome: 'Identifies exactly when in the customer lifecycle churn spikes occur, allowing Customer Success to intervene proactively.'
      },
      {
        level: 'Advanced',
        title: 'Calculate Blended CAC Payback',
        description: 'Blend financial revenue data with marketing spend data to determine exactly how long it takes to recover acquisition costs.',
        exampleQuery: "Calculate the blended CAC payback period in months by joining our total ad spend last quarter with the average gross margin of new cohorts.",
        exampleSql: `/* Data Blending Example: Stripe Revenue + Google/Meta Ads Spend */
WITH quarterly_spend AS (
  SELECT DATE_TRUNC('quarter', date) as quarter, SUM(spend) as total_cac_spend
  FROM marketing_ad_spend
),
new_cohort_value AS (
  SELECT 
    DATE_TRUNC('quarter', start_date) as quarter, 
    COUNT(DISTINCT customer_id) as new_customers,
    AVG(mrr * 0.85) as avg_gross_margin_mrr /* Assuming 85% gross margin */
  FROM subscription_events WHERE movement_type = 'new' GROUP BY 1
)
SELECT 
  q.quarter,
  q.total_cac_spend / NULLIF(n.new_customers, 0) AS blended_cac,
  n.avg_gross_margin_mrr,
  ROUND((q.total_cac_spend / NULLIF(n.new_customers, 0)) / NULLIF(n.avg_gross_margin_mrr, 0), 1) AS cac_payback_months
FROM quarterly_spend q
JOIN new_cohort_value n ON q.quarter = n.quarter
ORDER BY 1 DESC;`,
        businessOutcome: 'Delivers the most critical SaaS efficiency metric directly to the CFO, proving whether the growth model is sustainable.'
      }
    ],
    businessValueAndROI: [
      {
        metric: 'Board Reporting Agility',
        impact: 'Reduce the time required to compile quarterly SaaS financial slides from 7 days to 7 seconds.',
        timeframe: 'Immediate (Day 1)'
      },
      {
        metric: 'Financial Accuracy',
        impact: 'Eliminate VLOOKUP errors in spreadsheets, guaranteeing 100% mathematical integrity.',
        timeframe: 'Ongoing'
      },
      {
        metric: 'Engineering Bandwidth',
        impact: 'Save data engineers 30+ hours a month writing custom SQL cohorts for the product team.',
        timeframe: 'First 30 Days'
      }
    ],
    enterpriseApplications: [
      { vertical: 'Finance & Investors', application: 'Deliver audit-ready, high-fidelity SaaS metrics for board meetings.' },
      { vertical: 'Product Growth', application: 'Overlay usage telemetry with revenue data to identify high-LTV feature adoption.' }
    ],
    trustAndSecurity: [
      { guarantee: 'Local-First Processing', mechanism: 'Arcli ensures sensitive financial metrics are aggregated locally, keeping row-level data out of public AI APIs.' },
      { guarantee: 'Role-Based Access Control', mechanism: 'Integrates seamlessly to ensure only verified roles (e.g., Finance) can query unrestricted MRR data.' }
    ],
    faqs: [
      {
        persona: 'CFO',
        q: 'How does Arcli ensure MRR is accurate and matches our bank account?',
        a: 'You define the exact rules for what constitutes "Recognized Revenue" once in our system. The AI is forced to use your governed formula, preventing hallucinations.'
      },
      {
        persona: 'Data Engineer',
        q: 'Can this blueprint handle complex B2B contracts and custom billing dates?',
        a: 'Yes. By connecting directly to your database (Postgres/Snowflake) rather than a rigid billing API, you can query your unique custom contract tables seamlessly.'
      },
      {
        persona: 'CEO',
        q: 'I want to see MRR by specific customer cohorts. Do I need a new dashboard?',
        a: 'No. Arcli is conversational. Just ask "Show me MRR retention for customers who signed up during Black Friday," and it generates the chart instantly.'
      },
      {
        persona: 'CISO',
        q: 'Does Arcli send our sensitive customer billing data to OpenAI?',
        a: 'Absolutely not. We only send schema metadata (column names like `amount` or `billing_date`) to the LLM to write the SQL. The actual row-level financial data never leaves your environment.'
      }
    ],
    relatedBlueprints: ['marketing-attribution-blueprint', 'sales-dashboard-template']
  }
};