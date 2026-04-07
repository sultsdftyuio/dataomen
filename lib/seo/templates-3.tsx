// lib/seo/templates-3.tsx
import React from 'react';
import type { SEOPageData } from './index';
import { Megaphone, Headphones, Database, Download, Zap, TrendingUp, AlertOctagon } from 'lucide-react';

/**
 * SEO Silo: Dashboard Templates (Part 3)
 * Optimized for SERP Realism, Information Gain, and Direct Conversion.
 */

export const dashboardTemplatesPart3: Record<string, SEOPageData> = {
  'marketing-attribution-blueprint': {
    type: 'template',
    seo: {
      title: 'Marketing Attribution Dashboard Template (SQL + ROAS) | Arcli',
      description: 'Blend Meta, Google Ads, and Stripe data instantly. Free DuckDB/Postgres SQL templates to calculate blended CAC, True ROAS, and multi-touch attribution.',
      h1: 'Marketing Attribution Dashboard (Free SQL Blueprint)',
      canonicalDomain: 'arcli.tech',
      keywords: ['marketing attribution dashboard', 'calculate roas sql', 'blended cac formula', 'meta ads stripe sql', 'google ads roas dashboard duckdb'],
      intent: 'template'
    },
    hero: {
      subtitle: 'Stop trusting ad platforms that grade their own homework. Copy-paste these SQL templates to blend Meta, Google, and Stripe data for mathematical ground-truth attribution.',
      icon: <Megaphone className="w-12 h-12 text-rose-500 mb-6" />
    },
    immediateValue: [
      'Pre-built SQL for Blended CAC, Platform ROAS, and First-Touch Attribution.',
      'Instantly join advertising spend with actual captured revenue (Stripe).',
      'Bypass the 24-48 hour delay of standard marketing ETL pipelines.',
      'Auditable formulas that finance and marketing can finally agree on.'
    ],
    quickStart: {
      timeToValue: '< 4 minutes',
      steps: [
        'Connect Meta Ads, Google Ads, and Stripe via Arcli\'s secure read-only connectors.',
        'Arcli automatically harmonizes the different timezone and currency schemas using DuckDB.',
        'Run the cross-platform SQL blueprints below to reveal your true acquisition costs.'
      ]
    },
    conversionRouting: {
      primaryCTA: { label: 'Connect Ad Platforms & Run SQL', url: '/register?intent=attribution' },
      secondaryCTA: { label: 'View Live Demo Dashboard', url: '/demo/marketing-attribution' },
      parentLink: '/templates',
      internalLinks: ['/templates/saas-metrics-dashboard', '/integrations/stripe']
    },
    uiVisualizations: [
      {
        type: 'BarLineChart',
        dataMapping: { x: 'date', yBar: 'total_spend', yLine: 'blended_cac' },
        interactionPurpose: 'Track daily ad spend vs real customer acquisition cost',
        intentServed: 'Executive overview of marketing efficiency'
      },
      {
        type: 'ROASScatter',
        dataMapping: { x: 'ad_cost', y: 'true_revenue', bubble: 'campaign_name' },
        interactionPurpose: 'Identify outlier campaigns burning cash vs generating high LTV',
        intentServed: 'Granular campaign optimization'
      }
    ],
    assets: [
      {
        type: 'sql',
        label: 'Download Attribution SQL Library (.sql)',
        url: '#',
        icon: <Database className="w-4 h-4 mr-2" />
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
      'UTM parameter unnesting and regex parsing via DuckDB macros',
      'Zero-ETL architecture ensures 100% data freshness'
    ],
    strategicContext: {
      title: 'The Attribution War: Finance vs. Marketing',
      industrialConstraints: [
        'Ad networks natively over-report conversions to justify increased spend (the "walled garden" effect).',
        'Extracting raw ad spend and joining it with Stripe requires brittle Python scripts or expensive tools like Fivetran.',
        'UTM parameters are frequently malformed, breaking standard BI dashboard filters.'
      ],
      arcliEfficiency: 'Arcli acts as a universal semantic layer. It pulls the daily spend from ad networks and cross-references it with your internal database using fast, vectorized SQL. You get a single pane of truth without maintaining data pipelines.'
    },
    orchestrationWorkflow: {
      phase1: { name: 'Multi-Source Ingestion', description: 'Securely authenticate Ad Platforms and Billing engines.' },
      phase2: { name: 'UTM Normalization', description: 'Automatically extract, lower-case, and clean malformed `utm_source` strings.' },
      phase3: { name: 'Financial Reconciliation', description: 'Calculate ROAS against *actual cash in bank*.' }
    },
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'Daily Blended CAC',
        description: 'The ultimate executive metric. Calculate total marketing spend across all platforms divided by total new paying customers.',
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
  WHERE created >= CURRENT_DATE - INTERVAL 30 DAY
  GROUP BY 1
)
SELECT 
  s.date,
  s.total_spend,
  COALESCE(c.new_customers, 0) as new_customers,
  CASE WHEN c.new_customers > 0 THEN s.total_spend / c.new_customers ELSE 0 END AS blended_cac
FROM daily_spend s
LEFT JOIN daily_customers c ON s.date = c.date
ORDER BY s.date DESC;`,
        businessOutcome: 'Provides an immediate, tamper-proof view of acquisition efficiency.'
      },
      {
        level: 'Intermediate',
        title: 'Campaign-Level True ROAS (Stripe Verified)',
        description: 'Join ad platform campaign names directly to customer events to calculate ROAS using actual Stripe charges.',
        exampleQuery: "Calculate ROAS by campaign name for Meta Ads, using successfully paid Stripe charges.",
        exampleSql: `WITH campaign_cost AS (
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
  c.campaign_name,
  c.ad_cost,
  COALESCE(r.total_revenue, 0) AS true_revenue,
  ROUND(COALESCE(r.total_revenue, 0) / NULLIF(c.ad_cost, 0), 2) AS true_roas_multiplier
FROM campaign_cost c
LEFT JOIN campaign_revenue r ON c.campaign_name = r.campaign_name
ORDER BY true_roas_multiplier DESC;`,
        businessOutcome: 'Reveals which campaigns generate cash flow versus which generate empty clicks.'
      }
    ],
    businessValueAndROI: [
      { metric: 'Ad Spend Optimization', impact: 'Identify and cut campaigns that drive high traffic but zero backend revenue, saving 10-15% of budgets.', timeframe: 'First 14 Days' },
      { metric: 'Analyst Productivity', impact: 'Eliminate the daily 2-hour task of downloading CSVs and running Excel VLOOKUPs.', timeframe: 'Immediate' }
    ],
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Arcli Marketing Attribution",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      }
    },
    faqs: [
      { persona: 'Marketing Director', q: 'Does this replace Google Analytics?', a: 'It acts as backend validation. GA is great for session tracking, but Arcli ties that tracking directly to your production database and billing engine.' },
      { persona: 'Data Engineer', q: 'How does it handle the schema differences between Google and Meta?', a: 'Arcli utilizes semantic alignment models natively. It understands `metrics_cost_micros` in Google is equivalent to `spend` in Meta.' }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template', 'sales-dashboard-template']
  },

  'support-operations-blueprint': {
    type: 'template',
    seo: {
      title: 'Customer Support & CX Operations SQL Templates | Arcli',
      description: 'SQL templates for Zendesk, Intercom, and Jira. Calculate Time-to-Resolution (excluding weekends), SLA breaches, and agent efficiency.',
      h1: 'Support Operations Dashboard (Zendesk & Intercom SQL)',
      canonicalDomain: 'arcli.tech',
      keywords: ['zendesk sql queries', 'calculate time to resolution excluding weekends sql', 'support SLA dashboard duckdb', 'jira zendesk sql correlation'],
      intent: 'template'
    },
    hero: {
      subtitle: 'Measure your CX team\'s true efficiency. Advanced SQL templates to track SLA breaches, calculate business-hour resolution times, and correlate Jira bugs to support ticket volume.',
      icon: <Headphones className="w-12 h-12 text-violet-500 mb-6" />
    },
    immediateValue: [
      'Pre-built SQL for First Reply Time (FRT) and TTR.',
      'Advanced logic that automatically excludes weekends and holidays.',
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
    conversionRouting: {
      primaryCTA: { label: 'Sync Zendesk & Run SQL', url: '/register?intent=support_ops' },
      secondaryCTA: { label: 'Read the Setup Guide', url: '/docs/integrations/zendesk' },
      parentLink: '/templates',
      internalLinks: ['/templates/saas-metrics-dashboard']
    },
    uiVisualizations: [
      {
        type: 'HeatMap',
        dataMapping: { x: 'day_of_week', y: 'hour_of_day', value: 'ticket_volume' },
        interactionPurpose: 'Identify peak support volume hours for workforce scheduling',
        intentServed: 'Capacity planning'
      },
      {
        type: 'ScatterPlot',
        dataMapping: { x: 'jira_bug_severity', y: 'associated_ticket_count', label: 'jira_issue_key' },
        interactionPurpose: 'Visualize which software bugs cause the most support load',
        intentServed: 'Engineering prioritization'
      }
    ],
    assets: [
      {
        type: 'sql',
        label: 'Get the CX Operations SQL Pack',
        url: '#',
        icon: <Database className="w-4 h-4 mr-2" />
      }
    ],
    technicalStack: {
      engine: 'DuckDB',
      format: 'Columnar',
      compute: 'Advanced Date/Time Arithmetic'
    },
    strategicContext: {
      title: 'Moving Beyond Native Support Analytics',
      industrialConstraints: [
        'Native tools like Zendesk Explore are notoriously slow and hard to customize.',
        'Calculating "Business Hours" logic (excluding weekends) in SQL is traditionally very difficult.',
        'Support data is siloed from engineering data, making it hard to prove bugs are driving CX costs.'
      ],
      arcliEfficiency: 'Arcli offers deep SQL control over ticket data. Our pre-built DuckDB queries handle complex datetime math for business hours automatically.'
    },
    analyticalScenarios: [
      {
        level: 'Intermediate',
        title: 'True Time-to-Resolution (Excluding Weekends)',
        description: 'Calculate resolution time, stripping out Saturday and Sunday.',
        exampleQuery: "Calculate average time to resolution in days for tickets closed this month, excluding weekends.",
        exampleSql: `/* DuckDB Query: Business Days between dates */
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
        businessOutcome: 'Fair agent evaluation without weekend penalties.'
      },
      {
        level: 'Strategic',
        title: 'Engineering Bug Correlation',
        description: 'Link customer support ticket volume directly to engineering Jira ticket statuses.',
        exampleQuery: "Show top 5 Jira tickets 'In Progress' with the highest number of linked Zendesk tickets.",
        exampleSql: `SELECT 
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
        businessOutcome: 'Provides quantifiable evidence for engineering to prioritize technical debt eroding margins.'
      }
    ],
    businessValueAndROI: [
      { metric: 'SLA Compliance Validation', impact: 'Detect breach patterns before enterprise clients churn.', timeframe: 'Ongoing' },
      { metric: 'Engineering Prioritization', impact: 'Direct engineering to bugs generating the highest ticket volume.', timeframe: 'First 30 Days' }
    ],
    faqs: [
      { persona: 'RevOps', q: 'Can we calculate First-Reply Time (FRT) within strict business hours?', a: 'Yes. Our templates include CTEs specifically designed to calculate exact minute intervals restricted to operational hours.' },
      { persona: 'Data Engineer', q: 'Do we need webhooks to stream Zendesk data into Arcli?', a: 'No. Arcli provides a pre-built, zero-ETL connector that handles API pagination and rate limits natively.' }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template']
  }
};