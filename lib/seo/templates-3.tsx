// lib/seo/templates-3.tsx
import React from 'react';
import type { SEOPageData } from './index';
import { Megaphone, Headphones, Database, Download, Zap } from 'lucide-react';

/**
 * SEO Silo: Dashboard Templates (Part 3)
 * Maps directly to the global SEOPageData polymorphic schema.
 * Focuses on Cross-Platform Data Blending: Marketing Attribution & Customer Support Operations.
 */

export const dashboardTemplatesPart3: Record<string, SEOPageData> = {
  'marketing-attribution-blueprint': {
    type: 'template',
    seo: {
      title: 'Marketing Attribution Dashboard Template (SQL + ROAS Guide) | Arcli',
      description: 'Blend Meta, Google Ads, and Stripe data instantly. Free SQL templates to calculate blended CAC, ROAS, and multi-touch attribution without expensive ETL tools.',
      h1: 'Marketing Attribution Dashboard (Free SQL Blueprint)',
      canonicalDomain: 'arcli.tech',
      keywords: ['marketing attribution dashboard', 'calculate roas sql', 'blended cac formula', 'meta ads sql query', 'google ads roas dashboard'],
      intent: 'template'
    },
    hero: {
      subtitle: 'Stop trusting ad platform dashboards that claim 150% of your actual revenue. Copy-paste these SQL templates to blend Meta, Google, and Stripe data for mathematical ground-truth attribution.',
      icon: <Megaphone className="w-12 h-12 text-rose-500 mb-6" />
    },
    immediateValue: [
      'Pre-built SQL for Blended CAC, Platform ROAS, and First-Touch Attribution.',
      'Instantly join advertising spend with actual captured revenue.',
      'Bypass the 24-48 hour delay of standard marketing ETL pipelines.',
      'Auditable formulas that finance and marketing can finally agree on.'
    ],
    quickStart: {
      timeToValue: '< 4 minutes',
      steps: [
        'Connect Meta Ads, Google Ads, and Stripe via Arcli\'s secure read-only connectors.',
        'Arcli automatically harmonizes the different timezone and currency schemas.',
        'Run the cross-platform SQL blueprints below to reveal your true acquisition costs.'
      ]
    },
    assets: [
      {
        type: 'sql',
        label: 'Download Attribution SQL Library (.sql)',
        url: '#',
        icon: <Database className="w-4 h-4 mr-2" />
      },
      {
        type: 'pdf',
        label: 'The CFO Guide to Marketing Metrics',
        url: '#',
        icon: <Download className="w-4 h-4 mr-2" />
      }
    ],
    technicalStack: {
      engine: 'DuckDB',
      format: 'Parquet',
      compute: 'In-Browser WebAssembly Vectorization'
    },
    performanceMetrics: [
      'Daily automated currency conversion handling',
      'Millisecond query execution across million-row event tables',
      'UTM parameter unnesting and regex parsing',
      'Zero-ETL architecture ensures 100% data freshness'
    ],
    strategicContext: {
      title: 'The Attribution War: Finance vs. Marketing',
      industrialConstraints: [
        'Ad networks natively over-report conversions to justify increased spend (the "walled garden" effect).',
        'Extracting raw ad spend and joining it with Stripe/Shopify requires brittle Python scripts or expensive tools like Fivetran.',
        'UTM parameters are frequently malformed, breaking standard BI dashboard filters.'
      ],
      arcliEfficiency: 'Arcli acts as a universal semantic layer. It pulls the daily spend from ad networks and cross-references it with your internal database using fast, vectorized SQL. You get a single pane of truth without maintaining data pipelines.'
    },
    orchestrationWorkflow: {
      phase1: {
        name: 'Multi-Source Ingestion',
        description: 'Securely authenticate Ad Platforms and Billing engines. Arcli mirrors the schemas to a high-speed local engine.'
      },
      phase2: {
        name: 'UTM Normalization',
        description: 'Our system automatically extracts, lowercase-formats, and cleans malformed `utm_source` and `utm_campaign` strings from web events.'
      },
      phase3: {
        name: 'Financial Reconciliation',
        description: 'Calculate ROAS against *actual cash in bank* rather than the ad platform\'s *predicted conversion value*.'
      }
    },
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'Daily Blended CAC',
        description: 'The ultimate executive metric. Calculate total marketing spend across all platforms divided by totally new paying customers.',
        exampleQuery: "Show me our daily Blended CAC for the last 30 days, combining Google and Meta spend vs Stripe new customers.",
        exampleSql: `WITH daily_spend AS (
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
  WHERE created >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY 1
)
SELECT 
  s.date,
  s.total_spend,
  COALESCE(c.new_customers, 0) as new_customers,
  CASE WHEN c.new_customers > 0 THEN s.total_spend / c.new_customers ELSE NULL END AS blended_cac
FROM daily_spend s
LEFT JOIN daily_customers c ON s.date = c.date
ORDER BY s.date DESC;`,
        businessOutcome: 'Provides an immediate, tamper-proof view of acquisition efficiency that prevents over-spending during low-conversion periods.'
      },
      {
        level: 'Intermediate',
        title: 'Campaign-Level ROAS (True Cash)',
        description: 'Join ad platform campaign names directly to customer events to calculate Return on Ad Spend using actual Stripe charges.',
        exampleQuery: "Calculate ROAS by campaign name for Meta Ads, using successfully paid Stripe charges instead of Meta's conversion pixels.",
        exampleSql: `WITH campaign_cost AS (
  SELECT campaign_name, SUM(spend) as ad_cost
  FROM meta_ads.campaign_insights
  WHERE date_start >= DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY 1
),
campaign_revenue AS (
  SELECT 
    EXTRACT_URL_PARAMETER(e.url, 'utm_campaign') AS campaign_name,
    SUM(c.amount) / 100.0 AS total_revenue
  FROM product_events e
  JOIN stripe.charges c ON e.user_id = c.customer
  WHERE e.event_type = 'signup' 
    AND c.paid = TRUE
  GROUP BY 1
)
SELECT 
  c.campaign_name,
  c.ad_cost,
  COALESCE(r.total_revenue, 0) AS true_revenue,
  ROUND(COALESCE(r.total_revenue, 0) / NULLIF(c.ad_cost, 0), 2) AS true_roas_multiplier
FROM campaign_cost c
LEFT JOIN campaign_revenue r ON c.campaign_name = r.campaign_name
ORDER BY true_roas_multiplier DESC;`,
        businessOutcome: 'Reveals which campaigns actually generate cash flow versus which ones just generate empty clicks or refunded trials.'
      }
    ],
    businessValueAndROI: [
      {
        metric: 'Ad Spend Optimization',
        impact: 'Identify and cut campaigns that drive high traffic but zero backend revenue, typically saving 10-15% of ad budgets.',
        timeframe: 'First 14 Days'
      },
      {
        metric: 'Analyst Productivity',
        impact: 'Eliminate the daily 2-hour task of downloading CSVs from 3 platforms and running Excel VLOOKUPs.',
        timeframe: 'Immediate'
      }
    ],
    enterpriseApplications: [
      { vertical: 'Growth Marketing', application: 'Intra-day bid adjustment based on true backend conversion data, not delayed pixel fires.' },
      { vertical: 'Finance Operations', application: 'Auditing marketing agency performance claims against actual GAAP revenue.' }
    ],
    trustAndSecurity: [
      { guarantee: 'API-Level Security', mechanism: 'Tokens for Google and Meta are stored in SOC2-compliant vaults and only decrypted in memory during execution.' }
    ],
    faqs: [
      {
        persona: 'Marketing Director',
        q: 'Does this replace Google Analytics?',
        a: 'It acts as an irrefutable backend validation. While GA is great for session tracking, Arcli allows you to tie that tracking directly to your production database and billing engine.'
      },
      {
        persona: 'Data Engineer',
        q: 'How does it handle the schema differences between Google and Meta?',
        a: 'Arcli utilizes semantic alignment models under the hood. It natively understands that `metrics_cost_micros` in Google is structurally equivalent to `spend` in Meta, allowing you to query them harmoniously.'
      },
      {
        persona: 'CFO',
        q: 'How frequently is the ad spend data refreshed, and can it match our end-of-month financial close?',
        a: 'Arcli syncs data in near real-time directly from the source APIs. You can run strict cutoff queries to ensure marketing-reported numbers align perfectly with your GAAP accounting close without manual reconciliation.'
      }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template', 'sales-dashboard-template']
  },

  'support-operations-blueprint': {
    type: 'template',
    seo: {
      title: 'Customer Support & CX Operations SQL Templates | Arcli',
      description: 'SQL templates for Zendesk, Intercom, and Jira. Calculate Time-to-Resolution (business hours), SLA breaches, and agent efficiency.',
      h1: 'Support Operations Dashboard (Zendesk & Intercom SQL)',
      canonicalDomain: 'arcli.tech',
      keywords: ['zendesk sql queries', 'calculate time to resolution sql', 'support SLA dashboard', 'customer success metrics', 'intercom sql reporting'],
      intent: 'template'
    },
    hero: {
      subtitle: 'Measure your CX team\'s true efficiency. Advanced SQL templates to track SLA breaches, calculate business-hour resolution times, and correlate Jira bugs to support ticket volume.',
      icon: <Headphones className="w-12 h-12 text-violet-500 mb-6" />
    },
    immediateValue: [
      'Pre-built SQL for First Reply Time, TTR, and SLA adherence.',
      'Advanced logic that automatically excludes weekends and non-business hours.',
      'Correlate Engineering deployments with Support ticket spikes.',
      'Evaluate agent performance without bias.'
    ],
    quickStart: {
      timeToValue: '< 5 minutes',
      steps: [
        'Sync your Zendesk, Jira, or Intercom workspace.',
        'Define your company\'s custom business hours (e.g., 9 AM - 5 PM EST).',
        'Copy-paste the provided SQL to generate real-time operational charts.'
      ]
    },
    assets: [
      {
        type: 'sql',
        label: 'Get the CX Operations SQL Pack',
        url: '#',
        icon: <Database className="w-4 h-4 mr-2" />
      }
    ],
    technicalStack: {
      engine: 'Postgres / DuckDB',
      format: 'Columnar',
      compute: 'Advanced Date/Time Arithmetic'
    },
    performanceMetrics: [
      'Sub-second text search across historical ticket descriptions',
      'Complex SLA window calculations',
      'Automated timezone handling per customer',
      'Zero-ETL ingestion of standard support schemas'
    ],
    strategicContext: {
      title: 'Moving Beyond Native Support Analytics',
      industrialConstraints: [
        'Native tools like Zendesk Explore are notoriously slow and hard to customize.',
        'Calculating "Business Hours" logic (excluding weekends and holidays) in SQL is traditionally very difficult for analysts.',
        'Support data is siloed from engineering data, making it hard to prove that software bugs are driving CX costs.'
      ],
      arcliEfficiency: 'Arcli resolves this by offering deep SQL control over ticket data. Our pre-built macros handle the complex datetime math for business hours automatically, letting you focus on operational efficiency instead of writing complex interval logic.'
    },
    orchestrationWorkflow: {
      phase1: {
        name: 'Ticket Ingestion',
        description: 'Securely sync tickets, tags, comments, and agent states from Zendesk or Intercom.'
      },
      phase2: {
        name: 'Datetime Normalization',
        description: 'Arcli ensures all timestamps are standardized to UTC, enabling accurate cross-timezone SLA monitoring.'
      },
      phase3: {
        name: 'Cross-System Blending',
        description: 'Join Jira/Linear issue IDs tagged in support tickets to calculate the cost-per-bug.'
      }
    },
    analyticalScenarios: [
      {
        level: 'Intermediate',
        title: 'True Time-to-Resolution (Excluding Weekends)',
        description: 'Calculate how long it takes to resolve a ticket, completely stripping out Saturday and Sunday from the timeframe.',
        exampleQuery: "Calculate the average time to resolution in days for tickets closed this month, excluding weekends.",
        exampleSql: `/* DuckDB Macro Example for calculating business days between two dates */
SELECT 
  assignee_id,
  COUNT(id) as total_tickets_resolved,
  AVG(
    (EXTRACT(epoch FROM (solved_at - created_at)) / 86400) 
    - (2 * (EXTRACT(week FROM solved_at) - EXTRACT(week FROM created_at)))
  ) AS avg_resolution_business_days
FROM zendesk.tickets
WHERE status = 'closed'
  AND solved_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY 1
HAVING COUNT(id) > 10
ORDER BY avg_resolution_business_days ASC;`,
        businessOutcome: 'Provides an accurate, fair metric for evaluating agent performance by ensuring they aren\'t penalized for tickets opened late on a Friday.'
      },
      {
        level: 'Strategic',
        title: 'Engineering Bug Correlation',
        description: 'Link customer support ticket volume directly to engineering ticket statuses.',
        exampleQuery: "Show me the top 5 Jira tickets currently 'In Progress' that have the highest number of linked Zendesk support tickets.",
        exampleSql: `SELECT 
  j.issue_key,
  j.summary AS bug_description,
  j.assignee AS engineer,
  COUNT(DISTINCT z.id) AS associated_support_tickets,
  SUM(z.agent_touches) AS total_agent_effort_wasted
FROM jira.issues j
JOIN zendesk.ticket_tags t ON j.issue_key = t.tag_name
JOIN zendesk.tickets z ON t.ticket_id = z.id
WHERE j.status = 'In Progress'
GROUP BY 1, 2, 3
ORDER BY associated_support_tickets DESC
LIMIT 5;`,
        businessOutcome: 'Allows Customer Success leadership to definitively prove to Engineering which specific software bugs are consuming the most support bandwidth.'
      }
    ],
    businessValueAndROI: [
      {
        metric: 'SLA Compliance Validation',
        impact: 'Automatically detect breach patterns before enterprise clients churn, protecting high-value ARR.',
        timeframe: 'Ongoing'
      },
      {
        metric: 'Engineering Prioritization',
        impact: 'Reduce total support volume by directing engineering resources to bugs that generate the highest ticket volume.',
        timeframe: 'First 30 Days'
      }
    ],
    enterpriseApplications: [
      { vertical: 'Customer Success Operations', application: 'Automated weekly reporting on support tier efficiency without touching Zendesk Explore.' }
    ],
    trustAndSecurity: [
      { guarantee: 'PII Data Masking', mechanism: 'Arcli can enforce column-level security, masking ticket descriptions or user emails while still allowing operations to run aggregate math.' }
    ],
    faqs: [
      {
        persona: 'RevOps',
        q: 'Can we calculate First-Reply Time (FRT) within strict business hours?',
        a: 'Yes. Our advanced SQL templates include common table expressions (CTEs) specifically designed to calculate exact minute intervals restricted to your defined operational hours.'
      },
      {
        persona: 'Data Engineer',
        q: 'Do we need to build custom webhooks to stream Zendesk data into Arcli?',
        a: 'No. Arcli provides a pre-built, zero-ETL connector that automatically handles API pagination, rate limits, and schema normalization natively.'
      },
      {
        persona: 'CEO',
        q: 'How does measuring bug impact help our bottom line?',
        a: 'By linking support ticket volume to specific Jira issues, you assign a hard dollar cost (agent time) to software bugs. This provides quantifiable evidence for engineering to prioritize technical debt that is eroding your margins.'
      }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template']
  }
};