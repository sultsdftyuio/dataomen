// lib/seo/templates-stripe-1.tsx

import { TemplateBlueprint } from './index';

/**
 * HEAVY TEMPLATE: Stripe MRR Dashboard
 * High-intent destination focused on financial truth, board reporting, and revenue normalization.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const stripeMrrDashboard: TemplateBlueprint = {
  type: 'template',
  seo: {
    title: 'Stripe MRR (Monthly Recurring Revenue) Dashboard Template | Arcli',
    description: 'Instantly deploy an automated Stripe MRR dashboard. Normalize annual and monthly subscriptions into a single source of truth for board-level financial reporting.',
    h1: 'Stripe MRR (Monthly Recurring Revenue) Dashboard Template',
    keywords: [
      'stripe mrr dashboard', 
      'monthly recurring revenue template stripe', 
      'saas revenue tracking dashboard',
      'stripe subscription analytics'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe MRR Dashboard',
    subtitle: 'Connect your Stripe account and instantly extract a clean, audit-proof Monthly Recurring Revenue baseline across all subscription intervals.',
  },
  immediateValue: {
    heading: 'Establish a Single Source of Financial Truth',
    description: 'Stop wrestling with spreadsheet formulas to normalize annual, quarterly, and weekly billing cycles. This template automatically standardizes your active Stripe subscriptions into a unified MRR metric out of the box.'
  },
  quickStart: {
    heading: 'Deploy in Minutes',
    steps: [
      'Authenticate your Stripe account via Arcli’s read-only OAuth integration.',
      'Select the "Monthly Recurring Revenue (MRR)" template blueprint.',
      'Arcli extracts and models your active subscriptions, handling all interval math automatically.'
    ]
  },
  analyticalScenarios: [
    {
      title: 'MRR Expansion vs. Contraction (CFO Persona)',
      description: 'Isolate net-new MRR from expansion MRR (upgrades) to understand if growth is being driven by sales acquisition or product-led upselling.'
    },
    {
      title: 'Plan-Level Revenue Concentration (RevOps Persona)',
      description: 'Visualize exactly which pricing tiers contribute the most to your MRR baseline to inform packaging and pricing strategy adjustments.'
    }
  ],
  businessValueAndROI: {
    heading: 'The ROI of Audit-Proof Revenue Reporting',
    description: 'Inaccurate MRR reporting leads to misallocated burn rates and failed due diligence during fundraising. This template provides the mathematical confidence required for aggressive capital allocation and accurate runway forecasting.'
  },
  assets: {
    dashboardPreviewImage: '/images/templates/stripe-mrr-dashboard-preview.png',
  },
  trustAndSecurity: {
    description: 'Arcli utilizes Stripe Restricted Keys with strictly read-only access to `subscriptions` and `invoices`. PCI compliance is maintained by never storing raw payment methods.'
  },
  // STRICT RULE: 4-5 FAQs, executive focus, net-new info, no fluff
  faqs: [
    {
      q: 'How does this dashboard handle metered (usage-based) billing?',
      a: 'Standard MRR strictly counts fixed recurring fees. If you utilize Stripe Metered Billing, the dashboard provides a toggle to either exclude usage entirely or project it based on a 30-day trailing average.',
      persona: 'CFO'
    },
    {
      q: 'Are mid-cycle upgrades and prorations reflected accurately?',
      a: 'Yes. Arcli processes Stripe invoice line items to capture exact proration events. Expansion MRR is recognized immediately upon the successful capture of the prorated upgrade invoice.',
      persona: 'Engineer'
    },
    {
      q: 'Does the system normalize multi-currency subscriptions?',
      a: 'Yes. If you charge customers in EUR and USD, the dashboard uses daily spot rates to convert all foreign active subscriptions into your base presentation currency for an accurate global MRR.',
      persona: 'CFO'
    },
    {
      q: 'Why does my Stripe Dashboard MRR differ slightly from this template?',
      a: 'Stripe\'s native dashboard often counts subscriptions as "churned" the moment they fail a payment. Arcli follows SaaS accounting standards by keeping "past_due" subscriptions in MRR until the dunning cycle explicitly cancels them.',
      persona: 'RevOps'
    }
  ],
  // STRICT RULE: Link to 3-5 relevant LIGHT pages
  relatedSlugs: [
    'stripe-mrr-sql',
    'stripe-churn-rate-sql',
    'stripe-ltv-sql'
  ]
};

/**
 * HEAVY TEMPLATE: Stripe Gross Churn Dashboard
 * High-intent destination focused on subscription retention, dunning, and SaaS health.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const stripeChurnDashboard: TemplateBlueprint = {
  type: 'template',
  seo: {
    title: 'Stripe Churn Rate Dashboard Template | SaaS Analytics | Arcli',
    description: 'Track SaaS retention health with this Stripe churn dashboard. Automatically split voluntary cancellations from involuntary dunning failures.',
    h1: 'Stripe Churn Rate Dashboard Template',
    keywords: [
      'stripe churn dashboard', 
      'saas cancellation tracking template', 
      'stripe involuntary churn metrics',
      'subscription retention dashboard'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe Gross Churn Dashboard',
    subtitle: 'Pinpoint exactly how and why you are losing recurring revenue by separating active cancellations from failed payments.',
  },
  immediateValue: {
    heading: 'Diagnose the Root Cause of Revenue Leakage',
    description: 'A flat 5% churn rate hides critical business context. This template breaks down your Stripe cancellations into voluntary (user clicked cancel) and involuntary (credit card expired), allowing you to deploy the right operational fix.'
  },
  quickStart: {
    heading: 'Deploy in Minutes',
    steps: [
      'Connect your Stripe data source in the Arcli platform.',
      'Deploy the "Subscription Churn & Retention" blueprint.',
      'Review your automated breakdown of gross logo churn vs. net revenue churn.'
    ]
  },
  analyticalScenarios: [
    {
      title: 'Dunning Optimization (RevOps Persona)',
      description: 'If involuntary churn exceeds 2%, your dunning process is failing. Use this dashboard to pinpoint which retry attempts (Day 3 vs Day 7) have the lowest recovery rates.'
    },
    {
      title: 'Net Revenue Retention (NRR) Tracking (CFO Persona)',
      description: 'Go beyond gross logo churn. Track your NRR to see if expansion revenue from remaining customers outpaces the revenue lost from cancelled subscriptions.'
    }
  ],
  businessValueAndROI: {
    heading: 'The Compound ROI of Churn Reduction',
    description: 'Cutting involuntary churn by 20% acts as a permanent, compounding lift to your MRR baseline without spending an additional dollar on marketing acquisition.'
  },
  assets: {
    dashboardPreviewImage: '/images/templates/stripe-churn-dashboard-preview.png',
  },
  // STRICT RULE: 4-5 FAQs, executive focus, net-new info, no fluff
  faqs: [
    {
      q: 'How does the dashboard differentiate voluntary from involuntary churn?',
      a: 'The logic evaluates the `cancel_at_period_end` boolean on the subscription object alongside the final invoice status. If a subscription is canceled but the latest invoice failed, it is flagged as involuntary.',
      persona: 'Engineer'
    },
    {
      q: 'Is churn calculated on a cohort or calendar basis?',
      a: 'By default, the dashboard displays Calendar Gross Churn (cancellations this month / starting active subs). However, a toggle allows you to view Cohort Churn to see if specific acquisition months exhibit higher mortality rates.',
      persona: 'RevOps'
    },
    {
      q: 'Do paused subscriptions count as churn?',
      a: 'Standard SaaS metrics classify paused subscriptions (where billing is suspended but the contract is active) as contraction, not hard churn. They are excluded from the MRR baseline but do not increment the churn counter.',
      persona: 'CFO'
    },
    {
      q: 'How are downgrades represented?',
      a: 'A downgrade to a cheaper tier is classified as MRR Contraction. It does not count toward Logo Churn, ensuring your customer retention metrics are not artificially deflated by pricing adjustments.',
      persona: 'CFO'
    }
  ],
  // STRICT RULE: Link to 3-5 relevant LIGHT pages
  relatedSlugs: [
    'stripe-churn-rate-sql',
    'stripe-mrr-sql',
    'stripe-ltv-sql'
  ]
};

/**
 * HEAVY TEMPLATE: Stripe LTV Dashboard
 * High-intent destination focused on empirical revenue tracking and allowable CAC.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const stripeLtvDashboard: TemplateBlueprint = {
  type: 'template',
  seo: {
    title: 'Stripe Customer Lifetime Value (LTV) Dashboard | Arcli',
    description: 'Calculate absolute, realized historical LTV from your Stripe payments. Stop relying on predictive formulas and track true median SaaS revenue per user.',
    h1: 'Stripe Customer Lifetime Value (LTV) Dashboard',
    keywords: [
      'stripe ltv dashboard', 
      'saas lifetime value template', 
      'calculate ltv from stripe charges',
      'median customer value dashboard'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe Customer Lifetime Value (LTV) Dashboard',
    subtitle: 'Calculate your absolute, realized historical lifetime value by tracking empirical cash flow, eliminating the danger of skewed predictive formulas.',
  },
  immediateValue: {
    heading: 'Base Your Marketing Budget on Reality',
    description: 'The standard `(ARPU / Churn)` formula often breaks in early-stage SaaS, producing wild, theoretical LTV numbers. This dashboard aggregates hard, unrefunded cash captured in Stripe to show you exactly what a customer is actually worth over time.'
  },
  quickStart: {
    heading: 'Deploy in Minutes',
    steps: [
      'Connect Stripe to Arcli.',
      'Deploy the "Empirical Lifetime Value" analytical blueprint.',
      'Instantly view your average, median, and 90th percentile LTV distributions.'
    ]
  },
  analyticalScenarios: [
    {
      title: 'Isolating the Median (CFO Persona)',
      description: 'In B2B SaaS, three massive enterprise accounts can heavily skew your "Average LTV", leading you to overspend on SMB acquisition. This dashboard highlights the Median LTV to establish a safe, realistic allowable CAC.'
    },
    {
      title: 'Time-to-Payback Analysis (RevOps Persona)',
      description: 'Visualize the cumulative revenue curve to see exactly how many months it takes for an average cohort to cross the $500 threshold, dictating cash flow requirements for growth.'
    }
  ],
  businessValueAndROI: {
    heading: 'Protect Your Cash Runway',
    description: 'Overestimating LTV based on predictive formulas is the primary reason funded SaaS companies burn out of cash. By tracking realized, empirical LTV, you ensure you never spend $1,000 to acquire a user who realistically caps out at $600.'
  },
  // STRICT RULE: 4-5 FAQs, executive focus, net-new info, no fluff
  faqs: [
    {
      q: 'Why base LTV on `charges` instead of `subscriptions`?',
      a: 'Focusing strictly on subscriptions misses setup fees, one-off physical goods, and ad-hoc overages. Evaluating the `stripe.charges` object ensures 100% of captured wallet share is factored into the LTV calculation.',
      persona: 'Engineer'
    },
    {
      q: 'How are refunds and chargebacks handled?',
      a: 'The pipeline automatically evaluates the `amount_refunded` integer and deducts it from the gross charge amount. Disputed charges (chargebacks) that are lost are also backed out of historical LTV retroactively.',
      persona: 'CFO'
    },
    {
      q: 'Does this account for Stripe payment processing fees?',
      a: 'The default view displays Gross LTV (revenue before Stripe fees). A built-in toggle allows you to subtract Stripe\'s transaction costs (e.g., 2.9% + 30¢) to view Net LTV.',
      persona: 'CFO'
    },
    {
      q: 'Can we sync this LTV metric back to Hubspot or Salesforce?',
      a: 'Yes. The `median_ltv` and `total_net_revenue` outputs can be mapped back to the Company or Contact object in your CRM via Arcli\'s Reverse ETL sync engine to power marketing automation.',
      persona: 'RevOps'
    }
  ],
  // STRICT RULE: Link to 3-5 relevant LIGHT pages
  relatedSlugs: [
    'stripe-ltv-sql',
    'stripe-churn-rate-sql',
    'stripe-mrr-sql'
  ]
};