import React from 'react';
import { CreditCard, TrendingUp, AlertTriangle, Activity, Database, BarChart2 } from 'lucide-react';
import { TemplateBlueprint } from './index';

/**
 * HEAVY TEMPLATE: Stripe MRR Dashboard
 * High-intent destination focused on financial truth, board reporting, and revenue normalization.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const stripeMrrDashboard: TemplateBlueprint = {
  id: 'stripe-mrr-blueprint-001',
  type: 'template',
  metadata: {
    title: 'Stripe MRR (Monthly Recurring Revenue) Dashboard Template | Arcli',
    description: 'Instantly deploy an automated Stripe MRR dashboard. Normalize annual and monthly subscriptions into a single source of truth for board-level financial reporting.',
    canonicalDomain: 'arcli.tech',
    primaryKeyword: 'stripe mrr dashboard',
    secondaryKeywords: [
      'monthly recurring revenue template stripe', 
      'saas revenue tracking dashboard',
      'stripe subscription analytics'
    ],
    intent: 'template',
  },
  schemaEnforcement: {
    enableFAQ: true,
    enableSoftwareApplication: true,
    enableHowTo: true
  },
  conversionMatrix: {
    primaryCTA: 'Sync Stripe & View MRR (Free)',
    secondaryCTA: 'Copy MRR SQL Queries',
    contextualCTA: 'Learn How We Outperform Stripe Billing'
  },
  hero: {
    h1: 'Stripe MRR Dashboard Template',
    subtitle: 'Connect your Stripe account and instantly extract a clean, audit-proof Monthly Recurring Revenue baseline across all subscription intervals using advanced SQL.',
    icon: <TrendingUp className="w-12 h-12 text-indigo-500 mb-6" />
  },
  userQuestions: [
    'How do I accurately calculate MRR from Stripe without spreadsheets?',
    'What is our exact MRR breakdown by Expansion vs. Net-New?',
    'How do I normalize annual SaaS subscriptions into monthly revenue?',
    'Which specific pricing plans drive the most recurring revenue?'
  ],
  immediateValue: [
    'Stop wrestling with spreadsheet formulas to normalize annual and weekly billing cycles.',
    'Automatically standardize active Stripe subscriptions into a unified MRR metric.',
    'Generate board-ready financial charts in seconds using direct Stripe API data.',
    'Zero complex data engineering pipelines or heavy BI tool setups required.'
  ],
  quickStart: {
    timeToValue: '< 3 minutes',
    steps: [
      'Authenticate your Stripe account via Arcli’s secure, read-only integration.',
      'Select the "Monthly Recurring Revenue (MRR)" template blueprint.',
      'Arcli extracts and models your active subscriptions, handling all interval math automatically.'
    ]
  },
  assets: [
    {
      type: 'sql',
      label: 'Download Stripe MRR SQL Formulas',
      url: '#',
      icon: <Database className="w-4 h-4 mr-2" />
    }
  ],
  comparison: {
    vsTool: 'Stripe Native Dashboard',
    metrics: [
      { feature: 'Custom SQL Access', competitor: 'Limited (Requires Sigma add-on)', arcli: 'Full DuckDB SQL Access' },
      { feature: 'Data Blending', competitor: 'Stripe Data Only', arcli: 'Join Stripe with CRM/Ads Data' },
      { feature: 'Metric Customization', competitor: 'Rigid Definitions', arcli: 'Infinite Flexibility' }
    ]
  },
  technicalStack: {
    engine: 'DuckDB',
    format: 'Parquet',
    compute: 'In-Browser WASM Aggregation'
  },
  performanceMetrics: [
    'Sub-second interval normalization (Annual to MRR)',
    'Real-time pagination of Stripe API `/subscriptions`',
    'Automated proration logic execution'
  ],
  strategicContext: {
    title: 'Establish a Single Source of Financial Truth',
    industrialConstraints: [
      'Stripe native dashboards lack the ability to cleanly blend MRR data with external CRM or attribution data.',
      'Calculating true Net MRR requires complex logic to handle mid-cycle upgrades, prorations, and pauses.'
    ],
    arcliEfficiency: 'Arcli leverages optimized analytical SQL to parse nested Stripe objects, delivering audit-proof MRR metrics without requiring a dedicated data warehouse.'
  },
  orchestrationWorkflow: {
    phase1: { name: 'Secure Sync', description: 'Arcli fetches raw subscription and invoice data using restricted, read-only Stripe keys.' },
    phase2: { name: 'Interval Normalization', description: 'SQL automatically divides annual plan amounts by 12 to standardize monthly pacing.' },
    phase3: { name: 'Visualization', description: 'Generates instant, interactive MRR waterfall charts.' }
  },
  analyticalScenarios: [
    {
      level: 'Intermediate',
      title: 'Baseline MRR Normalization',
      description: 'Standardize varying billing intervals (monthly, yearly) into a single MRR metric. Copy this query.',
      exampleQuery: 'Calculate the total active MRR, normalizing annual subscriptions to monthly amounts.',
      exampleSql: `SELECT 
  DATE_TRUNC('month', created) AS month,
  SUM(
    CASE 
      WHEN plan_interval = 'year' THEN amount / 12.0
      WHEN plan_interval = 'month' THEN amount
      ELSE 0
    END
  ) / 100.0 AS standardized_mrr
FROM stripe_subscriptions
WHERE status IN ('active', 'past_due')
GROUP BY 1
ORDER BY month DESC;`,
      businessOutcome: 'Provides an exact, audit-ready baseline of recurring revenue for accurate runway forecasting.',
      visualizationConfig: {
        type: 'LineChart',
        dataMapping: { x: 'month', y: 'standardized_mrr' },
        interactionPurpose: 'Visualize MRR growth trajectory over time.'
      }
    },
    {
      level: 'Advanced',
      title: 'MRR Expansion vs. Contraction',
      description: 'Isolate net-new MRR from expansion MRR (upgrades) to understand if growth is driven by acquisition or product-led upselling.',
      exampleQuery: 'Break down MRR changes this month by Net-New, Expansion, Contraction, and Churn.',
      exampleSql: `/* Arcli processes Stripe invoice line items to capture exact proration events */
SELECT 
  customer_id,
  SUM(CASE WHEN event_type = 'upgrade' THEN amount_change ELSE 0 END) AS expansion_mrr,
  SUM(CASE WHEN event_type = 'downgrade' THEN amount_change ELSE 0 END) AS contraction_mrr
FROM stripe_mrr_movements
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY 1;`,
      businessOutcome: 'Identifies whether sales teams or account managers are driving the majority of revenue growth.',
      visualizationConfig: {
        type: 'BarChart',
        dataMapping: { x: 'event_type', y: 'amount_change' },
        interactionPurpose: 'Compare the magnitude of MRR expansion against contraction.'
      }
    }
  ],
  businessValueAndROI: [
    {
      metric: 'Audit-Proof Reporting',
      impact: 'Provides mathematical confidence required for aggressive capital allocation and accurate runway forecasting.',
      timeframe: 'Immediate'
    },
    {
      metric: 'Data Engineering Savings',
      impact: 'Bypass the need for a $120k/yr data engineer to maintain fragile Stripe API ETL pipelines.',
      timeframe: 'Day 1'
    }
  ],
  enterpriseApplications: [
    { vertical: 'SaaS Finance', application: 'Generate accurate MRR waterfalls for board deck preparations.' },
    { vertical: 'RevOps', application: 'Analyze pricing plan concentration to inform packaging strategies.' }
  ],
  trustAndSecurity: [
    { guarantee: 'Restricted Keys', mechanism: 'Arcli utilizes Stripe Restricted Keys with strictly read-only access to `subscriptions` and `invoices`.' },
    { guarantee: 'PCI Compliance', mechanism: 'Raw payment methods and credit card numbers are never accessed or stored.' }
  ],
  faqs: [
    {
      persona: 'CFO',
      q: 'How does this dashboard handle metered (usage-based) billing?',
      a: 'Standard MRR strictly counts fixed recurring fees. If you utilize Stripe Metered Billing, the dashboard provides a toggle to either exclude usage entirely or project it based on a 30-day trailing average.'
    },
    {
      persona: 'Data Engineer',
      q: 'Are mid-cycle upgrades and prorations reflected accurately?',
      a: 'Yes. Arcli processes Stripe invoice line items to capture exact proration events. Expansion MRR is recognized immediately upon the successful capture of the prorated upgrade invoice.'
    },
    {
      persona: 'CFO',
      q: 'Does the system normalize multi-currency subscriptions?',
      a: 'Yes. If you charge customers in EUR and USD, the dashboard uses daily spot rates to convert all foreign active subscriptions into your base presentation currency for an accurate global MRR.'
    },
    {
      persona: 'RevOps',
      q: 'Why does my Stripe Dashboard MRR differ slightly from this template?',
      a: 'Stripe\'s native dashboard often counts subscriptions as "churned" the moment they fail a payment. Arcli follows strict SaaS accounting standards by keeping "past_due" subscriptions in MRR until the dunning cycle explicitly cancels them.'
    }
  ],
  relatedBlueprints: [
    'stripe-churn-dashboard',
    'stripe-ltv-dashboard',
    'sales-dashboard-template'
  ]
};

/**
 * HEAVY TEMPLATE: Stripe Gross Churn Dashboard
 * High-intent destination focused on subscription retention, dunning, and SaaS health.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const stripeChurnDashboard: TemplateBlueprint = {
  id: 'stripe-churn-blueprint-002',
  type: 'template',
  metadata: {
    title: 'Stripe Churn Rate Dashboard Template | SaaS Analytics | Arcli',
    description: 'Track SaaS retention health with this Stripe churn dashboard. Automatically split voluntary cancellations from involuntary dunning failures.',
    canonicalDomain: 'arcli.tech',
    primaryKeyword: 'stripe churn dashboard',
    secondaryKeywords: [
      'saas cancellation tracking template', 
      'stripe involuntary churn metrics',
      'subscription retention dashboard'
    ],
    intent: 'template',
  },
  schemaEnforcement: {
    enableFAQ: true,
    enableSoftwareApplication: true,
    enableHowTo: true
  },
  conversionMatrix: {
    primaryCTA: 'Analyze Your Stripe Churn',
    secondaryCTA: 'Download Churn SQL Templates',
    contextualCTA: 'See How We Track Involuntary Churn'
  },
  hero: {
    h1: 'Stripe Gross Churn Dashboard',
    subtitle: 'Pinpoint exactly how and why you are losing recurring revenue by separating active cancellations from failed payments.',
    icon: <AlertTriangle className="w-12 h-12 text-rose-500 mb-6" />
  },
  userQuestions: [
    'What percentage of our churn is involuntary (failed credit cards)?',
    'Is our Net Revenue Retention (NRR) above 100%?',
    'At what stage in the dunning process are we losing the most customers?',
    'What is our cohort churn rate for Q1 signups?'
  ],
  immediateValue: [
    'Diagnose the root cause of revenue leakage with exact precision.',
    'Break down Stripe cancellations into voluntary vs. involuntary churn.',
    'Identify weaknesses in your automated dunning and retry logic.',
    'Calculate true Net Revenue Retention (NRR) seamlessly.'
  ],
  quickStart: {
    timeToValue: '< 3 minutes',
    steps: [
      'Connect your Stripe data source in the Arcli platform.',
      'Deploy the "Subscription Churn & Retention" blueprint.',
      'Review your automated breakdown of gross logo churn vs. net revenue churn.'
    ]
  },
  assets: [
    {
      type: 'sql',
      label: 'Copy Dunning SQL Logic',
      url: '#',
      icon: <Activity className="w-4 h-4 mr-2" />
    }
  ],
  comparison: {
    vsTool: 'Basic Spreadsheets',
    metrics: [
      { feature: 'Involuntary Churn Detection', competitor: 'Manual Exporting', arcli: 'Automated Invoice Parsing' },
      { feature: 'Cohort Analysis', competitor: 'Complex VLOOKUPs', arcli: 'Instant Vectorized SQL' }
    ]
  },
  technicalStack: {
    engine: 'DuckDB',
    format: 'JSONB-Unnested',
    compute: 'Temporal Window Functions'
  },
  performanceMetrics: [
    'Automated dunning failure classification',
    'Sub-second cohort matrix generation',
    'Accurate isolation of paused vs. cancelled states'
  ],
  strategicContext: {
    title: 'Diagnose the Root Cause of Revenue Leakage',
    industrialConstraints: [
      'A flat 5% overall churn rate hides critical business context.',
      'Standard metrics blend users who actively clicked "cancel" with users whose credit cards simply expired.'
    ],
    arcliEfficiency: 'Arcli uses window functions to map subscription state changes against invoice outcomes, cleanly isolating failed payments from active cancellations.'
  },
  orchestrationWorkflow: {
    phase1: { name: 'State Mapping', description: 'Arcli maps `cancel_at_period_end` booleans alongside final invoice status codes.' },
    phase2: { name: 'Classification', description: 'Cancellations with failed final invoices are mathematically flagged as Involuntary.' },
    phase3: { name: 'Action', description: 'Review cohorts to optimize dunning retries or product engagement.' }
  },
  analyticalScenarios: [
    {
      level: 'Advanced',
      title: 'Voluntary vs. Involuntary Churn Breakdown',
      description: 'Separate customers who chose to leave from customers you lost due to payment failures.',
      exampleQuery: 'Show me the breakdown of voluntary vs involuntary churn for the last 6 months.',
      exampleSql: `SELECT 
  DATE_TRUNC('month', canceled_at) AS month,
  COUNT(CASE WHEN cancel_at_period_end = true THEN 1 END) AS voluntary_churn,
  COUNT(CASE WHEN status = 'canceled' AND cancel_at_period_end = false THEN 1 END) AS involuntary_churn
FROM stripe_subscriptions
WHERE status = 'canceled'
GROUP BY 1
ORDER BY month DESC;`,
      businessOutcome: 'Provides clear operational direction: Fix the product (Voluntary) or fix the dunning process (Involuntary).',
      visualizationConfig: {
        type: 'BarChart',
        dataMapping: { x: 'month', y: 'voluntary_churn', groupBy: 'churn_type' },
        interactionPurpose: 'Track the ratio of payment failures to active cancellations over time.'
      }
    },
    {
      level: 'Strategic',
      title: 'Net Revenue Retention (NRR)',
      description: 'Track if expansion revenue from remaining customers outpaces the revenue lost from cancelled subscriptions.',
      exampleQuery: 'Calculate our NRR for the trailing 12 months.',
      exampleSql: `SELECT 
  (starting_mrr + expansion_mrr - contraction_mrr - churned_mrr) / starting_mrr * 100 AS net_revenue_retention_pct
FROM monthly_mrr_aggregates;`,
      businessOutcome: 'The golden metric for SaaS valuation. Proves that your product becomes more valuable to existing users over time.',
      visualizationConfig: {
        type: 'MetricCard',
        dataMapping: { x: 'cohort', y: 'net_revenue_retention_pct' },
        interactionPurpose: 'Executive KPI monitoring.'
      }
    }
  ],
  businessValueAndROI: [
    {
      metric: 'Compound Revenue Lift',
      impact: 'Cutting involuntary churn by 20% acts as a permanent, compounding lift to your MRR baseline without spending on acquisition.',
      timeframe: 'First 60 Days'
    }
  ],
  enterpriseApplications: [
    { vertical: 'RevOps', application: 'Pinpoint which dunning retry attempts (Day 3 vs Day 7) have the lowest recovery rates.' }
  ],
  trustAndSecurity: [
    { guarantee: 'Read-Only Webhooks', mechanism: 'Arcli listens to Stripe `customer.subscription.deleted` webhooks securely without write-access.' }
  ],
  faqs: [
    {
      persona: 'Data Engineer',
      q: 'How does the dashboard differentiate voluntary from involuntary churn?',
      a: 'The logic evaluates the `cancel_at_period_end` boolean on the subscription object alongside the final invoice status. If a subscription is canceled but the latest invoice failed, it is flagged as involuntary.'
    },
    {
      persona: 'RevOps',
      q: 'Is churn calculated on a cohort or calendar basis?',
      a: 'By default, the dashboard displays Calendar Gross Churn. However, a toggle allows you to view Cohort Churn to see if specific acquisition months exhibit higher mortality rates.'
    },
    {
      persona: 'CFO',
      q: 'Do paused subscriptions count as churn?',
      a: 'Standard SaaS metrics classify paused subscriptions as contraction, not hard churn. They are excluded from the MRR baseline but do not increment the logo churn counter.'
    },
    {
      persona: 'CFO',
      q: 'How are downgrades represented?',
      a: 'A downgrade to a cheaper tier is classified as MRR Contraction. It does not count toward Logo Churn, ensuring your customer retention metrics are not artificially deflated.'
    }
  ],
  relatedBlueprints: [
    'stripe-mrr-dashboard',
    'stripe-ltv-dashboard'
  ]
};

/**
 * HEAVY TEMPLATE: Stripe LTV Dashboard
 * High-intent destination focused on empirical revenue tracking and allowable CAC.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const stripeLtvDashboard: TemplateBlueprint = {
  id: 'stripe-ltv-blueprint-003',
  type: 'template',
  metadata: {
    title: 'Stripe Customer Lifetime Value (LTV) Dashboard | Arcli',
    description: 'Calculate absolute, realized historical LTV from your Stripe payments. Stop relying on predictive formulas and track true median SaaS revenue per user.',
    canonicalDomain: 'arcli.tech',
    primaryKeyword: 'stripe ltv dashboard',
    secondaryKeywords: [
      'saas lifetime value template', 
      'calculate ltv from stripe charges',
      'median customer value dashboard'
    ],
    intent: 'template',
  },
  schemaEnforcement: {
    enableFAQ: true,
    enableSoftwareApplication: true,
    enableHowTo: true
  },
  conversionMatrix: {
    primaryCTA: 'Calculate Your Real LTV',
    secondaryCTA: 'View Median LTV SQL',
    contextualCTA: 'Ditch the ARPU/Churn Formula'
  },
  hero: {
    h1: 'Stripe Customer Lifetime Value (LTV) Dashboard',
    subtitle: 'Calculate absolute, realized historical lifetime value by tracking empirical cash flow, eliminating the danger of skewed predictive formulas.',
    icon: <CreditCard className="w-12 h-12 text-emerald-500 mb-6" />
  },
  userQuestions: [
    'What is our actual Median LTV, excluding massive enterprise outliers?',
    'How many months does it take for a customer to become profitable (Payback Period)?',
    'How do I account for refunds and chargebacks in my LTV calculation?',
    'What is the true lifetime value of a customer acquired via Paid Social?'
  ],
  immediateValue: [
    'Base your marketing budget and CAC limits on hard, realized cash.',
    'Ditch the broken `(ARPU / Churn)` formula that creates theoretical, inflated LTVs.',
    'Automatically deduct refunds and lost chargebacks from your lifetime value metrics.',
    'Identify your true median customer value to prevent overspending on SMB acquisition.'
  ],
  quickStart: {
    timeToValue: '< 5 minutes',
    steps: [
      'Connect Stripe to Arcli using a restricted API key.',
      'Deploy the "Empirical Lifetime Value" analytical blueprint.',
      'Instantly view your average, median, and 90th percentile LTV distributions.'
    ]
  },
  assets: [
    {
      type: 'sql',
      label: 'Get the Empirical LTV SQL Script',
      url: '#',
      icon: <BarChart2 className="w-4 h-4 mr-2" />
    }
  ],
  comparison: {
    vsTool: 'Predictive Formulas (ARPU/Churn)',
    metrics: [
      { feature: 'Accuracy', competitor: 'Theoretical / Highly Skewed', arcli: 'Empirical / Cash-based' },
      { feature: 'Refund Handling', competitor: 'Often Ignored', arcli: 'Automatically Deducted' },
      { feature: 'Setup Fees/One-offs', competitor: 'Excluded from MRR math', arcli: 'Fully captured via Charges' }
    ]
  },
  technicalStack: {
    engine: 'DuckDB',
    format: 'Columnar',
    compute: 'Percentile Calculation & Median Aggregation'
  },
  performanceMetrics: [
    'Sub-second median (`PERCENTILE_CONT`) calculations',
    'Automatic linkage of `charges` to `customer_id`',
    'Real-time deduction of `amount_refunded`'
  ],
  strategicContext: {
    title: 'Base Your Marketing Budget on Reality',
    industrialConstraints: [
      'The standard `(ARPU / Churn)` formula often breaks in early-stage SaaS, producing wild, theoretical LTV numbers.',
      'Averages are easily skewed by three massive enterprise accounts, hiding the true value of your median user.'
    ],
    arcliEfficiency: 'This dashboard aggregates hard, unrefunded cash captured in Stripe (`stripe.charges`) to show you exactly what a customer is actually worth mathematically.'
  },
  orchestrationWorkflow: {
    phase1: { name: 'Charge Aggregation', description: 'Arcli aggregates all successful `stripe.charges`, capturing both subscriptions and one-off invoices.' },
    phase2: { name: 'Refund Deduction', description: 'Automatically subtracts `amount_refunded` and lost disputes to calculate Net Cash.' },
    phase3: { name: 'Distribution Mapping', description: 'Calculates the Median and Average across cohorts.' }
  },
  analyticalScenarios: [
    {
      level: 'Strategic',
      title: 'Isolating the Median LTV',
      description: 'Highlight the Median LTV to establish a safe, realistic allowable CAC, ignoring extreme enterprise outliers.',
      exampleQuery: 'Calculate the Median LTV of all customers who signed up in 2023.',
      exampleSql: `SELECT 
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_net_revenue) AS median_ltv,
  AVG(total_net_revenue) AS average_ltv
FROM (
  SELECT 
    customer,
    SUM(amount_captured - amount_refunded) / 100.0 AS total_net_revenue
  FROM stripe_charges
  WHERE status = 'succeeded'
  GROUP BY customer
) as customer_totals;`,
      businessOutcome: 'Ensures you never spend $1,000 to acquire a user who realistically caps out at $600.',
      visualizationConfig: {
        type: 'BarChart',
        dataMapping: { x: 'metric_type', y: 'value' },
        interactionPurpose: 'Visually contrast the highly-skewed Average against the realistic Median.'
      }
    },
    {
      level: 'Advanced',
      title: 'Time-to-Payback Analysis',
      description: 'Visualize exactly how many months it takes for an average cohort to cross a specific revenue threshold.',
      exampleQuery: 'Show the cumulative average revenue per customer over their first 12 months.',
      exampleSql: `SELECT 
  months_since_signup,
  AVG(cumulative_revenue) AS avg_revenue_at_month
FROM cohort_revenue_accumulation
GROUP BY 1
ORDER BY 1;`,
      businessOutcome: 'Dictates cash flow requirements for growth, allowing accurate runway mapping.',
      visualizationConfig: {
        type: 'LineChart',
        dataMapping: { x: 'months_since_signup', y: 'avg_revenue_at_month' },
        interactionPurpose: 'Plot the payback period curve against CAC.'
      }
    }
  ],
  businessValueAndROI: [
    {
      metric: 'Protect Cash Runway',
      impact: 'Overestimating LTV based on predictive formulas is a primary reason startups burn out of cash. Empirical LTV stops overspending instantly.',
      timeframe: 'Immediate'
    }
  ],
  enterpriseApplications: [
    { vertical: 'Growth Marketing', application: 'Sync `median_ltv` to HubSpot via Reverse ETL to optimize ad targeting.' }
  ],
  trustAndSecurity: [
    { guarantee: 'Holistic Capture', mechanism: 'By reading the `charges` API, Arcli captures 100% of wallet share, including setup fees.' }
  ],
  faqs: [
    {
      persona: 'Data Engineer',
      q: 'Why base LTV on `charges` instead of `subscriptions`?',
      a: 'Focusing strictly on subscriptions misses setup fees, one-off physical goods, and ad-hoc overages. Evaluating the `stripe.charges` object ensures 100% of captured wallet share is factored into the calculation.'
    },
    {
      persona: 'CFO',
      q: 'How are refunds and chargebacks handled?',
      a: 'The pipeline automatically evaluates the `amount_refunded` integer and deducts it from the gross charge amount. Disputed charges (chargebacks) that are lost are also backed out of historical LTV retroactively.'
    },
    {
      persona: 'CFO',
      q: 'Does this account for Stripe payment processing fees?',
      a: 'The default view displays Gross LTV (revenue before Stripe fees). A built-in toggle allows you to subtract Stripe\'s transaction costs (e.g., 2.9% + 30¢) to view Net LTV.'
    },
    {
      persona: 'RevOps',
      q: 'Can we sync this LTV metric back to Hubspot or Salesforce?',
      a: 'Yes. The `median_ltv` and `total_net_revenue` outputs can be mapped back to the Company or Contact object in your CRM via Arcli\'s Reverse ETL sync engine to power marketing automation.'
    }
  ],
  relatedBlueprints: [
    'stripe-mrr-dashboard',
    'stripe-churn-dashboard',
    'marketing-dashboard-template'
  ]
};