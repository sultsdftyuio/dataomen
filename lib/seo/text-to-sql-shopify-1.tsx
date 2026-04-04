// lib/seo/text-to-sql-shopify-1.tsx

import { TemplateBlueprint } from './index';

/**
 * LIGHT TEMPLATE: Shopify LTV SQL
 * High-intent query focused on fast, actionable SQL extraction.
 * Analytical Pattern: Lifetime Value (Aggregation)
 */
export const shopifyLtvSql: TemplateBlueprint = {
  slug: 'shopify-ltv-sql',
  type: 'template',
  seo: {
    title: 'Shopify Customer Lifetime Value (LTV) SQL Query | Arcli',
    description: 'Calculate Shopify Customer Lifetime Value (LTV) instantly with this production-ready SQL query template. Optimized for Postgres, Snowflake, and BigQuery.',
    h1: 'Shopify Customer Lifetime Value (LTV) SQL Template',
    keywords: [
      'shopify ltv sql', 
      'how to calculate ltv shopify query', 
      'shopify customer lifetime value sql example',
      'shopify average order value sql'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Shopify Customer Lifetime Value (LTV) SQL Template',
    subtitle: 'A ready-to-run SQL snippet to calculate average customer lifetime value (LTV) directly from your Shopify orders table.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / Snowflake
WITH customer_orders AS (
  SELECT 
    customer_id,
    MIN(created_at) AS first_order_date,
    MAX(created_at) AS last_order_date,
    COUNT(DISTINCT id) AS total_orders,
    -- Subtract refunds to get true net lifetime spend
    SUM(total_price - COALESCE(total_refunds, 0)) AS net_lifetime_spend
  FROM shopify.orders
  WHERE financial_status IN ('paid', 'partially_refunded')
    AND cancelled_at IS NULL
    -- Exclude internal testing or zero-dollar orders
    AND total_price > 0 
  GROUP BY 1
)
SELECT 
  ROUND(AVG(net_lifetime_spend)::numeric, 2) AS average_ltv,
  ROUND(AVG(total_orders)::numeric, 2) AS average_orders_per_customer,
  COUNT(customer_id) AS total_customers
FROM customer_orders;
    `,
    explanation: 'This CTE aggregates paid and partially refunded Shopify orders by customer ID to calculate true net lifetime spend. The outer query averages this net spend across your entire active customer base to yield the global LTV baseline.',
  },
  useCases: [
    {
      title: 'Predictive ROI Analysis (CFO)',
      description: 'Establish a mathematically sound LTV baseline to compare against blended Customer Acquisition Cost (CAC).'
    }
  ],
  // NEW: STRICT RULE (2-3 FAQs, ultra concise, edge case focused)
  faqs: [
    {
      q: 'How does this query handle guest checkouts?',
      a: 'This query groups by `customer_id`. If your Shopify instance does not enforce account creation or lacks post-checkout email matching, guest checkouts without a distinct ID will be excluded or treated as single-purchase anomalies.',
      persona: 'Engineer'
    },
    {
      q: 'Why exclude cancelled orders but include refunded ones?',
      a: 'A cancelled order typically means fulfillment never occurred (e.g., fraud block). A refunded order means fulfillment occurred but revenue was returned, which must be factored in to calculate true net customer value.',
      persona: 'RevOps'
    }
  ],
  // STRICT RULE: Link to 1 relevant HEAVY page (Dashboard)
  relatedSlugs: [
    'shopify-ltv-dashboard'
  ] 
};

/**
 * LIGHT TEMPLATE: Shopify Cohort Retention SQL
 * High-intent query focused on retention grouping.
 * Analytical Pattern: Cohort Analysis (Date Truncation & Self-Joins)
 */
export const shopifyCohortRetentionSql: TemplateBlueprint = {
  slug: 'shopify-cohort-retention-sql',
  type: 'template',
  seo: {
    title: 'Shopify Cohort Retention SQL Query Template | Arcli',
    description: 'Standardize your Shopify retention metrics with this SQL cohort analysis template. Track repeat purchase rates by monthly acquisition cohorts.',
    h1: 'Shopify Cohort Retention SQL Query',
    keywords: [
      'shopify cohort analysis sql', 
      'shopify retention rate query', 
      'sql cohort retention shopify',
      'ecommerce repeat purchase rate sql'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Shopify Cohort Retention SQL Template',
    subtitle: 'Track repeat purchase behavior by mapping subsequent orders back to a customer\'s acquisition month.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL
WITH first_orders AS (
  SELECT 
    customer_id,
    DATE_TRUNC('month', MIN(created_at)) AS cohort_month
  FROM shopify.orders
  WHERE financial_status = 'paid'
  GROUP BY 1
),
cohort_sizes AS (
  SELECT 
    cohort_month,
    COUNT(DISTINCT customer_id) AS cohort_size
  FROM first_orders
  GROUP BY 1
),
retention_data AS (
  SELECT 
    f.cohort_month,
    DATE_TRUNC('month', o.created_at) AS order_month,
    EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', o.created_at), f.cohort_month)) AS month_number,
    COUNT(DISTINCT o.customer_id) AS active_customers
  FROM shopify.orders o
  JOIN first_orders f ON o.customer_id = f.customer_id
  WHERE o.financial_status = 'paid'
  GROUP BY 1, 2, 3
)
SELECT 
  r.cohort_month,
  s.cohort_size,
  r.month_number,
  r.active_customers,
  ROUND((r.active_customers::numeric / NULLIF(s.cohort_size, 0)) * 100, 2) AS retention_percentage
FROM retention_data r
JOIN cohort_sizes s ON r.cohort_month = s.cohort_month
ORDER BY 1, 3;
    `,
    explanation: 'This script identifies the acquisition month (cohort) for every customer, calculates the base size of that cohort, and then joins it against all subsequent purchases utilizing the `AGE()` function to extract the exact month-delta.',
  },
  useCases: [
    {
      title: 'Product-Market Fit Validation',
      description: 'Monitor if newer acquisition cohorts are retaining at higher percentages in later months than older ones.'
    }
  ],
  // NEW: STRICT RULE (2-3 FAQs, ultra concise, edge case focused)
  faqs: [
    {
      q: 'Does this query account for 100% refunded return purchases?',
      a: 'No. This baseline counts any `paid` order as a retention event. To exclude users who bought and subsequently returned everything, you must add an inner join filtering out orders where `total_price = total_refunds`.',
      persona: 'Engineer'
    },
    {
      q: 'What happens if a user\'s first historical order was imported manually?',
      a: 'The `MIN(created_at)` logic relies on the database timestamp. If historical orders were migrated without preserving original creation timestamps, your initial cohorts will be artificially inflated.',
      persona: 'Engineer'
    }
  ],
  // STRICT RULE: Link to 1 relevant HEAVY page (Dashboard)
  relatedSlugs: [
    'shopify-cohort-retention-dashboard'
  ]
};

/**
 * LIGHT TEMPLATE: Shopify RFM Segmentation SQL
 * High-intent query introducing Window Functions to the SEO graph.
 * Analytical Pattern: RFM (Recency, Frequency, Monetary)
 */
export const shopifyRfmSegmentationSql: TemplateBlueprint = {
  slug: 'shopify-rfm-segmentation-sql',
  type: 'template',
  seo: {
    title: 'Shopify RFM Segmentation SQL Query Template | Arcli',
    description: 'Execute RFM (Recency, Frequency, Monetary) segmentation on your Shopify data using advanced SQL window functions. Group customers into actionable percentiles.',
    h1: 'Shopify RFM Segmentation SQL Query',
    keywords: [
      'shopify rfm analysis sql', 
      'rfm segmentation query shopify', 
      'customer segmentation sql template',
      'ntile window function ecommerce'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Shopify RFM Segmentation SQL Template',
    subtitle: 'Automatically classify your Shopify customers into 5 distinct tiers based on Recency, Frequency, and Monetary value using SQL percentiles.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / Snowflake
WITH customer_base AS (
  SELECT 
    customer_id,
    MAX(created_at) AS last_order_date,
    COUNT(DISTINCT id) AS frequency,
    SUM(total_price) AS monetary_value
  FROM shopify.orders
  WHERE financial_status = 'paid'
    AND cancelled_at IS NULL
  GROUP BY 1
),
rfm_scoring AS (
  SELECT 
    customer_id,
    last_order_date,
    frequency,
    monetary_value,
    NTILE(5) OVER (ORDER BY last_order_date ASC) AS r_score,
    NTILE(5) OVER (ORDER BY frequency DESC) AS f_score,
    NTILE(5) OVER (ORDER BY monetary_value DESC) AS m_score
  FROM customer_base
)
SELECT 
  customer_id,
  r_score,
  f_score,
  m_score,
  (r_score::text || f_score::text || m_score::text) AS rfm_cell,
  CASE 
    WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
    WHEN r_score <= 2 AND f_score >= 4 AND m_score >= 4 THEN 'At Risk High-Value'
    WHEN r_score >= 4 AND f_score <= 2 AND m_score <= 2 THEN 'Recent Low-Value'
    ELSE 'Core Audience'
  END AS customer_segment
FROM rfm_scoring;
    `,
    explanation: 'Utilizes the `NTILE(5)` window function to rank customers into 5 equal buckets (quintiles) for Recency, Frequency, and Monetary metrics, concatenating them into actionable human-readable segments.',
  },
  useCases: [
    {
      title: 'Churn Prevention on High-Value Accounts (RevOps)',
      description: 'Isolate the "At Risk High-Value" segment for VIP manual outreach or aggressive discounting.'
    }
  ],
  // NEW: STRICT RULE (2-3 FAQs, ultra concise, edge case focused)
  faqs: [
    {
      q: 'What happens if there are fewer than 5 customers with identical scores?',
      a: 'The `NTILE(5)` function forces an equal distribution. If you have a massive tie (e.g., 60% of users bought exactly 1 item), the algorithm arbitrarily splits them across buckets. Consider using `DENSE_RANK()` for low-variance datasets.',
      persona: 'Engineer'
    },
    {
      q: 'Are zero-dollar (free) promotional orders counted in frequency?',
      a: 'Yes, if their financial status in Shopify is marked as "paid". To exclude free promotional items from frequency scores, append `AND total_price > 0` to the base CTE.',
      persona: 'RevOps'
    }
  ],
  // STRICT RULE: Link to 1 relevant HEAVY page (Dashboard)
  relatedSlugs: [
    'shopify-rfm-dashboard'
  ]
};