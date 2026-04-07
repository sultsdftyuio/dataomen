import { TemplateBlueprint } from './index';

/**
 * LIGHT TEMPLATE: Shopify LTV SQL
 * High-intent query focused on fast, actionable SQL extraction.
 * Analytical Pattern: Lifetime Value (Aggregation) with Identity Resolution
 */
export const shopifyLtvSql: TemplateBlueprint = {
  slug: 'shopify-ltv-sql',
  type: 'template',
  seo: {
    title: 'Shopify Customer Lifetime Value (LTV) SQL Query | Arcli',
    description: 'Calculate true Shopify Customer Lifetime Value (LTV) with this production-ready SQL query. Handles guest checkouts, refunds, and net revenue calculations.',
    h1: 'Shopify Customer Lifetime Value (LTV) SQL Template',
    keywords: [
      'shopify ltv sql', 
      'how to calculate ltv shopify query', 
      'shopify customer lifetime value sql example',
      'shopify average order value sql',
      'shopify net revenue sql'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Shopify Customer Lifetime Value (LTV) SQL Template',
    subtitle: 'A production-grade SQL snippet to calculate net customer lifetime value directly from your Shopify orders table, accounting for guest checkouts and refunds.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / Snowflake / BigQuery
WITH base_orders AS (
  SELECT 
    -- Coalesce handles guest checkouts where customer_id is NULL
    COALESCE(customer_id::text, email) AS unique_shopper_id,
    created_at,
    id AS order_id,
    -- Calculate Net Revenue: Exclude shipping and taxes if analyzing product LTV
    (total_price - COALESCE(total_tax, 0) - COALESCE(total_shipping, 0) - COALESCE(total_refunds, 0)) AS net_product_spend
  FROM shopify.orders
  WHERE financial_status IN ('paid', 'partially_refunded')
    AND cancelled_at IS NULL
),
customer_aggregations AS (
  SELECT 
    unique_shopper_id,
    MIN(created_at) AS first_order_date,
    MAX(created_at) AS last_order_date,
    COUNT(DISTINCT order_id) AS total_orders,
    SUM(net_product_spend) AS net_lifetime_spend
  FROM base_orders
  WHERE net_product_spend > 0 
  GROUP BY 1
)
SELECT 
  ROUND(AVG(net_lifetime_spend)::numeric, 2) AS average_ltv,
  ROUND(AVG(total_orders)::numeric, 2) AS average_orders_per_customer,
  COUNT(unique_shopper_id) AS total_unique_customers
FROM customer_aggregations;
    `,
    explanation: 'Most Shopify SQL templates fail because they ignore guest checkouts and treat gross revenue as net. This CTE resolves identities using `COALESCE(customer_id, email)` and strips out taxes and shipping to calculate true net product LTV across your active customer base.',
  },
  useCases: [
    {
      title: 'Precision CAC-to-LTV Ratios (RevOps)',
      description: 'Establish a mathematically accurate baseline for Net LTV to compare against your blended Customer Acquisition Cost (CAC) across ad channels.'
    }
  ],
  faqs: [
    {
      q: 'How does this query handle guest checkouts?',
      a: 'Unlike basic queries that drop rows without a `customer_id`, this script uses `COALESCE(customer_id::text, email)` to group unauthenticated guest checkouts by their email address, ensuring accurate retention and LTV metrics.',
      persona: 'Data Engineer'
    },
    {
      q: 'Why subtract taxes and shipping from total_price?',
      a: 'Shopify’s `total_price` is a gross metric. If you base your LTV on gross revenue, your marketing teams will overbid on ads. Subtracting `total_tax` and `total_shipping` gives you the true Net Revenue LTV.',
      persona: 'RevOps'
    }
  ],
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
    description: 'Track repeat purchase rates with this Shopify SQL cohort analysis template. Standardize retention metrics by monthly acquisition cohorts.',
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
    subtitle: 'Track repeat purchase behavior by mapping subsequent orders back to a customer\'s precise acquisition month.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL
WITH user_cohorts AS (
  SELECT 
    COALESCE(customer_id::text, email) AS unique_shopper_id,
    -- Note: Adjust timezone if your Shopify raw data is in UTC
    DATE_TRUNC('month', MIN(created_at)) AS cohort_month
  FROM shopify.orders
  WHERE financial_status IN ('paid', 'partially_refunded')
    AND cancelled_at IS NULL
  GROUP BY 1
),
cohort_sizes AS (
  SELECT 
    cohort_month,
    COUNT(DISTINCT unique_shopper_id) AS initial_cohort_size
  FROM user_cohorts
  GROUP BY 1
),
retention_data AS (
  SELECT 
    c.cohort_month,
    DATE_TRUNC('month', o.created_at) AS order_month,
    -- Extract the exact integer month difference
    EXTRACT(YEAR FROM o.created_at) * 12 + EXTRACT(MONTH FROM o.created_at) 
    - (EXTRACT(YEAR FROM c.cohort_month) * 12 + EXTRACT(MONTH FROM c.cohort_month)) AS month_delta,
    COUNT(DISTINCT COALESCE(o.customer_id::text, o.email)) AS active_shoppers
  FROM shopify.orders o
  JOIN user_cohorts c 
    ON COALESCE(o.customer_id::text, o.email) = c.unique_shopper_id
  WHERE o.financial_status IN ('paid', 'partially_refunded')
    AND o.cancelled_at IS NULL
  GROUP BY 1, 2, 3
)
SELECT 
  r.cohort_month,
  s.initial_cohort_size,
  r.month_delta,
  r.active_shoppers,
  ROUND((r.active_shoppers::numeric / NULLIF(s.initial_cohort_size, 0)) * 100, 2) AS retention_percentage
FROM retention_data r
JOIN cohort_sizes s ON r.cohort_month = s.cohort_month
ORDER BY 1, 3;
    `,
    explanation: 'This script securely defines the acquisition cohort by first order date, calculates the baseline cohort size, and maps all subsequent orders using a robust `month_delta` extraction formula that avoids PostgreSQL `AGE()` edge cases across year boundaries.',
  },
  useCases: [
    {
      title: 'Product-Market Fit & Churn Validation',
      description: 'Monitor if newer acquisition cohorts are retaining at higher percentages in later months, proving that your product value or onboarding is improving over time.'
    }
  ],
  faqs: [
    {
      q: 'Does this query account for 100% refunded return purchases?',
      a: 'No. This baseline counts any `paid` or `partially_refunded` order as a retention event. To exclude zero-revenue events, append `AND (total_price - COALESCE(total_refunds, 0)) > 0` to your order filters.',
      persona: 'Data Engineer'
    },
    {
      q: 'Why use math extraction instead of the AGE() function for month_delta?',
      a: 'PostgreSQL\'s `AGE()` function returns an interval. Depending on the exact days of the month (e.g., Jan 31st to Feb 28th), interval extraction can occasionally under-report the month integer. The Year * 12 + Month math formula is deterministic and bulletproof.',
      persona: 'Analytics Engineer'
    }
  ],
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
    description: 'Segment Shopify customers automatically into actionable percentiles using RFM (Recency, Frequency, Monetary) scoring and advanced SQL window functions.',
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
    subtitle: 'Automatically classify your E-commerce customers into powerful marketing tiers using Recency, Frequency, and Monetary percentiles.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / Snowflake
WITH shopper_base AS (
  SELECT 
    COALESCE(customer_id::text, email) AS unique_shopper_id,
    MAX(created_at) AS last_order_date,
    COUNT(DISTINCT id) AS frequency,
    SUM(total_price - COALESCE(total_refunds, 0)) AS net_monetary_value
  FROM shopify.orders
  WHERE financial_status IN ('paid', 'partially_refunded')
    AND cancelled_at IS NULL
  GROUP BY 1
  -- Ensure we only score actual paying customers
  HAVING SUM(total_price - COALESCE(total_refunds, 0)) > 0
),
rfm_scoring AS (
  SELECT 
    unique_shopper_id,
    last_order_date,
    frequency,
    net_monetary_value,
    -- NTILE(5) splits users into 5 equal buckets (1 = Lowest, 5 = Highest)
    NTILE(5) OVER (ORDER BY last_order_date ASC) AS r_score,
    NTILE(5) OVER (ORDER BY frequency ASC) AS f_score,
    NTILE(5) OVER (ORDER BY net_monetary_value ASC) AS m_score
  FROM shopper_base
)
SELECT 
  unique_shopper_id,
  r_score,
  f_score,
  m_score,
  (r_score::text || f_score::text || m_score::text) AS rfm_cell,
  CASE 
    WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
    WHEN r_score <= 2 AND f_score >= 4 AND m_score >= 4 THEN 'At Risk High-Value'
    WHEN r_score >= 4 AND f_score <= 2 AND m_score <= 2 THEN 'Recent Low-Value'
    WHEN r_score <= 2 AND f_score <= 2 AND m_score <= 2 THEN 'Churned Low-Value'
    ELSE 'Core Audience'
  END AS customer_segment
FROM rfm_scoring;
    `,
    explanation: 'This pipeline calculates base metrics, then applies the `NTILE(5)` window function to rank customers into five equal quintiles for each metric. Finally, it uses a CASE statement to translate the raw numeric score (e.g., "555" or "155") into actionable human-readable marketing segments.',
  },
  useCases: [
    {
      title: 'Automated Retention Workflows (Lifecycle Marketing)',
      description: 'Sync the "At Risk High-Value" segment (low recency, high frequency/monetary) directly to Klaviyo for immediate VIP win-back email campaigns.'
    }
  ],
  faqs: [
    {
      q: 'What happens if there is a massive tie in order frequency?',
      a: 'The `NTILE(5)` function forces an equal distribution. If 80% of your users have exactly 1 purchase, `NTILE` arbitrarily splits them across buckets 1 through 4. For highly skewed early-stage stores, consider swapping `NTILE()` for hardcoded `CASE` thresholds based on absolute values.',
      persona: 'Data Engineer'
    },
    {
      q: 'Should I score Recency ascending or descending?',
      a: 'In standard RFM, a higher score is better. Therefore, Recency must be sorted `ASC` so that the most recent dates (which are statistically "larger" timestamps) fall into bucket 5, indicating high recency.',
      persona: 'Analytics Engineer'
    }
  ],
  relatedSlugs: [
    'shopify-rfm-dashboard'
  ]
};