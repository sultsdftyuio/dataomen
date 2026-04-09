// -----------------------------------------------------------------------------
// V14 REFACTORED: dashboardTemplatesPart3
// -----------------------------------------------------------------------------
import type { Block, TemplateBlueprint } from '@/types/seo-registry'; 

export const dashboardTemplatesPart3: Record<string, TemplateBlueprint> = {
  'marketing-attribution-blueprint': {
    id: 'attr-blueprint-005',
    type: 'template',
    metadata: {
      title: 'Marketing Attribution Dashboard Template (SQL + ROAS) | Arcli',
      description: 'Blend Meta, Google Ads, and Stripe data instantly. Free DuckDB/Postgres SQL templates to calculate blended CAC, True ROAS, and multi-touch attribution.',
      canonicalDomain: 'arcli.tech',
      keywords: ['marketing attribution dashboard', 'calculate roas sql', 'blended cac formula', 'meta ads stripe sql', 'google ads roas dashboard duckdb'],
      intent: 'template'
    },
    schemaOrg: {
      type: 'SoftwareApplication',
      primaryEntity: 'Marketing Attribution SQL Blueprints'
    },
    blocks: [
      {
        type: 'Hero',
        data: {
          h1: 'Marketing Attribution Dashboard (Free SQL Blueprint)',
          subtitle: 'Stop trusting ad platforms that grade their own homework. Copy-paste these SQL templates to blend Meta, Google, and Stripe data for mathematical ground-truth attribution.',
          iconName: 'Megaphone' // Strictly serialized
        }
      },
      {
        type: 'InformationGain',
        data: {
          uniqueInsight: 'Ad networks natively over-report conversions to justify increased spend. Arcli acts as a universal semantic layer to cross-reference spend with actual cash in Stripe.',
          structuralAdvantage: 'In-Browser WebAssembly Vectorization processes million-row event tables and un-nests UTM parameters without expensive data pipelines.',
          immediateValue: [
            'Pre-built SQL for Blended CAC, Platform ROAS, and First-Touch Attribution.',
            'Instantly join advertising spend with actual captured revenue (Stripe).',
            'Bypass the 24-48 hour delay of standard marketing ETL pipelines.',
            'Auditable formulas that finance and marketing can finally agree on.'
          ]
        }
      },
      {
        type: 'ComparisonMatrix',
        rows: [
          { category: 'Data Pipeline', legacy: '24-48 hour sync delay (Fivetran/Snowflake)', arcliAdvantage: 'Zero-ETL millisecond execution' },
          { category: 'Attribution Source', legacy: 'Platform self-reporting (Meta/Google)', arcliAdvantage: 'Ground-truth Stripe verification' },
          { category: 'UTM Handling', legacy: 'Breaks BI filters on malformed strings', arcliAdvantage: 'Regex parsing via DuckDB macros natively' }
        ]
      },
      {
        type: 'ArchitectureDiagram',
        data: {
          title: 'The Attribution Engine',
          timeToValue: '< 4 minutes',
          steps: [
            { title: 'Multi-Source Ingestion', description: 'Securely authenticate Ad Platforms and Billing engines via read-only connectors.' },
            { title: 'UTM Normalization', description: 'Automatically extract, lower-case, and clean malformed utm_source strings.' },
            { title: 'Financial Reconciliation', description: 'Calculate ROAS against actual cash in the bank.' }
          ]
        }
      },
      {
        type: 'AnalyticsDashboard',
        data: [
          {
            level: 'Basic',
            title: 'Daily Blended CAC',
            description: 'The ultimate executive metric. Calculate total marketing spend across all platforms divided by total new paying customers.',
            dialect: 'postgresql',
            code: `WITH daily_spend AS (
  SELECT date, SUM(spend) as total_spend
  FROM (
    SELECT date_start AS date, spend FROM meta_ads.campaign_insights
    UNION ALL
    SELECT segments_date AS date, metrics_cost_micros / 1000000.0 AS spend FROM google_ads.campaign_stats
  ) combined_spend
  GROUP BY 1
),
daily_customers AS (
  SELECT DATE_TRUNC('day', created) AS date, COUNT(id) as new_customers
  FROM stripe.customers
  WHERE created >= CURRENT_DATE - INTERVAL 30 DAY
  GROUP BY 1
)
SELECT 
  s.date, s.total_spend, COALESCE(c.new_customers, 0) as new_customers,
  CASE WHEN c.new_customers > 0 THEN s.total_spend / c.new_customers ELSE 0 END AS blended_cac
FROM daily_spend s
LEFT JOIN daily_customers c ON s.date = c.date
ORDER BY s.date DESC;`,
            businessOutcome: 'Provides an immediate, tamper-proof view of acquisition efficiency across all channels.'
          },
          {
            level: 'Intermediate',
            title: 'Campaign-Level True ROAS (Stripe Verified)',
            description: 'Join ad platform campaign names directly to customer events to calculate ROAS using actual Stripe charges.',
            dialect: 'postgresql',
            code: `WITH campaign_cost AS (
  SELECT campaign_name, SUM(spend) as ad_cost
  FROM meta_ads.campaign_insights
  WHERE date_start >= DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY 1
),
campaign_revenue AS (
  SELECT 
    regexp_extract(e.url, 'utm_campaign=([^&]+)', 1) AS campaign_name,
    SUM(c.amount) / 100.0 AS total_revenue
  FROM product_events e
  JOIN stripe.charges c ON e.user_id = c.customer
  WHERE e.event_type = 'signup' AND c.paid = TRUE
  GROUP BY 1
)
SELECT 
  c.campaign_name, c.ad_cost, COALESCE(r.total_revenue, 0) AS true_revenue,
  ROUND(COALESCE(r.total_revenue, 0) / NULLIF(c.ad_cost, 0), 2) AS true_roas_multiplier
FROM campaign_cost c
LEFT JOIN campaign_revenue r ON c.campaign_name = r.campaign_name
ORDER BY true_roas_multiplier DESC;`,
            businessOutcome: 'Reveals which campaigns generate cash flow versus which generate empty clicks.'
          }
        ]
      },
      {
        type: 'FAQ',
        items: [
          { persona: 'Marketing Director', q: 'Does this replace Google Analytics?', a: 'It acts as backend validation. GA is great for session tracking, but Arcli ties that tracking directly to your production database and billing engine.' },
          { persona: 'Data Engineer', q: 'How does it handle the schema differences between Google and Meta?', a: 'Arcli utilizes semantic alignment models natively. It understands `metrics_cost_micros` in Google is equivalent to `spend` in Meta.' }
        ]
      },
      {
        type: 'CTAGroup',
        data: {
          primary: { label: 'Connect Ad Platforms & Run SQL', action: 'register', intent: 'Execution' },
          secondary: { label: 'View Live Demo Dashboard', action: 'demo', intent: 'Exploration' },
          assets: [
            { type: 'sql', label: 'Download Attribution SQL Library (.sql)', url: '#', iconName: 'Database' }
          ]
        }
      }
    ]
  },

  'support-operations-blueprint': {
    id: 'supp-blueprint-006',
    type: 'template',
    metadata: {
      title: 'Customer Support & CX Operations SQL Templates | Arcli',
      description: 'SQL templates for Zendesk, Intercom, and Jira. Calculate Time-to-Resolution (excluding weekends), SLA breaches, and agent efficiency.',
      canonicalDomain: 'arcli.tech',
      keywords: ['zendesk sql queries', 'calculate time to resolution excluding weekends sql', 'support SLA dashboard duckdb', 'jira zendesk sql correlation'],
      intent: 'template'
    },
    schemaOrg: {
      type: 'SoftwareApplication',
      primaryEntity: 'Support Operations SQL Analytics'
    },
    blocks: [
      {
        type: 'Hero',
        data: {
          h1: 'Support Operations Dashboard (Zendesk & Intercom SQL)',
          subtitle: 'Measure your CX team\'s true efficiency. Advanced SQL templates to track SLA breaches, calculate business-hour resolution times, and correlate Jira bugs to support ticket volume.',
          iconName: 'Headphones'
        }
      },
      {
        type: 'InformationGain',
        data: {
          uniqueInsight: 'Native tools like Zendesk Explore are notoriously slow and fail at correlating bugs to support costs. Calculating "Business Hours" logic in SQL is traditionally very difficult.',
          structuralAdvantage: 'Advanced Date/Time Arithmetic via DuckDB natively strips out weekends and correlates cross-platform systems instantly.',
          immediateValue: [
            'Pre-built SQL for First Reply Time (FRT) and True Time-to-Resolution (TTR).',
            'Advanced logic that automatically excludes weekends and holidays.',
            'Correlate Engineering deployments with Support ticket spikes.',
            'Evaluate agent performance without bias.'
          ]
        }
      },
      {
        type: 'ComparisonMatrix',
        rows: [
          { category: 'Business Hours Logic', legacy: 'Complex Python/Airflow Scripts', arcliAdvantage: 'Native SQL Date/Time Arithmetic' },
          { category: 'Data Silos', legacy: 'Isolated Zendesk Metrics', arcliAdvantage: 'Correlated Jira + Zendesk Analysis' }
        ]
      },
      {
        type: 'ArchitectureDiagram',
        data: {
          title: 'CX Operations Setup',
          timeToValue: '< 5 minutes',
          steps: [
            { title: 'Sync Platforms', description: 'Sync your Zendesk, Jira, or Intercom workspace via read-only APIs.' },
            { title: 'Define Logic', description: 'Define your company\'s custom business hours (e.g., 9 AM - 5 PM EST).' },
            { title: 'Generate Insights', description: 'Copy-paste the provided SQL to generate real-time operational charts.' }
          ]
        }
      },
      {
        type: 'AnalyticsDashboard',
        data: [
          {
            level: 'Intermediate',
            title: 'True Time-to-Resolution (Excluding Weekends)',
            description: 'Calculate resolution time, mathematically stripping out Saturday and Sunday penalties.',
            dialect: 'postgresql',
            code: `/* DuckDB Query: Business Days between dates */
SELECT 
  assignee_id,
  COUNT(id) as total_tickets_resolved,
  AVG(
    (date_diff('day', created_at, solved_at)) 
    - (2 * date_diff('week', created_at, solved_at))
    - CASE WHEN dayofweek(created_at) = 0 THEN 1 ELSE 0 END
    - CASE WHEN dayofweek(solved_at) = 6 THEN 1 ELSE 0 END
  ) AS avg_resolution_business_days
FROM zendesk.tickets
WHERE status = 'closed'
  AND solved_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY 1
HAVING COUNT(id) > 10
ORDER BY avg_resolution_business_days ASC;`,
            businessOutcome: 'Provides a fair agent evaluation framework without weekend SLA penalties.'
          },
          {
            level: 'Strategic',
            title: 'Engineering Bug Correlation',
            description: 'Link customer support ticket volume directly to engineering Jira ticket statuses to prove CX cost.',
            dialect: 'postgresql',
            code: `SELECT 
  j.issue_key,
  j.summary AS bug_description,
  COUNT(DISTINCT z.id) AS associated_support_tickets,
  SUM(z.agent_touches) AS total_agent_effort_wasted
FROM jira.issues j
JOIN zendesk.ticket_tags t ON j.issue_key = t.tag_name
JOIN zendesk.tickets z ON t.ticket_id = z.id
WHERE j.status = 'In Progress'
GROUP BY 1, 2
ORDER BY associated_support_tickets DESC
LIMIT 5;`,
            businessOutcome: 'Provides quantifiable evidence for engineering to prioritize technical debt that is eroding margins.'
          }
        ]
      },
      {
        type: 'FAQ',
        items: [
          { persona: 'RevOps', q: 'Can we calculate First-Reply Time (FRT) within strict business hours?', a: 'Yes. Our templates include CTEs specifically designed to calculate exact minute intervals restricted to operational hours.' },
          { persona: 'Data Engineer', q: 'Do we need webhooks to stream Zendesk data into Arcli?', a: 'No. Arcli provides a pre-built, zero-ETL connector that handles API pagination and rate limits natively.' }
        ]
      },
      {
        type: 'CTAGroup',
        data: {
          primary: { label: 'Sync Zendesk & Run SQL', action: 'register', intent: 'Execution' },
          secondary: { label: 'Read the Setup Guide', action: 'view_docs', intent: 'Exploration' },
          assets: [
            { type: 'sql', label: 'Get the CX Operations SQL Pack', url: '#', iconName: 'Database' }
          ]
        }
      }
    ]
  }
};