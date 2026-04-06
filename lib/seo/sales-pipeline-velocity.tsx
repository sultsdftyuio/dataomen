// lib/seo/sales-pipeline-velocity.tsx

import { SEOPageData } from './index';

export const salesPipelineVelocityData: SEOPageData = {
  type: 'integration',
  seo: {
    title: "AI Analytics for Salesforce & HubSpot | Pipeline Velocity | Arcli",
    description: "Stop wrestling with rigid Salesforce reports. Arcli's AI agents automatically join HubSpot lead data with Salesforce opportunities to calculate true pipeline velocity in real-time.",
    h1: "Calculate True Pipeline Velocity with AI",
    keywords: [
      "Salesforce AI analytics", 
      "HubSpot text to SQL", 
      "pipeline velocity calculation", 
      "RevOps AI data agent", 
      "sales performance BI", 
      "cross-platform CRM analytics",
      "Zero-ETL Salesforce reporting"
    ],
    intent: 'integration',
    canonicalDomain: 'https://arcli.tech/use-cases/sales-pipeline-velocity'
  },
  
  hero: {
    badge: "REVOPS & SALES INTELLIGENCE",
    title: "Conversational BI for Modern RevOps.",
    subtitle: "Salesforce reports are too rigid. Spreadsheets are too slow. Arcli deploys AI data agents that natively join Salesforce and HubSpot data, allowing RevOps to ask complex pipeline questions in plain English and get mathematically governed answers instantly.",
    primaryCTA: { text: "Connect Your CRM", href: "/register?intent=revops" },
    secondaryCTA: { text: "View Velocity Architecture", href: "#strategic-query" },
    trustSignals: [
      "Native Salesforce (SOQL) & HubSpot API Connectors",
      "Supports Standard and deeply nested Custom Objects",
      "Real-time pipeline snapshotting via DuckDB"
    ]
  },

  executiveSummary: [
    { value: '40%', label: 'RevOps Time Saved' },
    { value: '0', label: 'ETL Pipelines Required' },
    { value: 'Instant', label: 'Cross-Platform Joins' },
    { value: '100%', label: 'Metric Governance' }
  ],

  contrarianBanner: {
    statement: "The RevOps backlog is dead. Let your Sales VPs interrogate the pipeline directly.",
    subtext: "RevOps teams spend 40% of their week building ad-hoc Salesforce dashboards for Sales Leaders. Arcli eliminates this bottleneck. By establishing a semantic layer over your CRM data, leaders get instant, mathematically accurate answers without filing a JIRA ticket."
  },

  workflow: {
    title: "From Cluttered CRM to Governed AI Analytics",
    description: "How Arcli bypasses Salesforce API limitations to deliver sub-second analytical queries.",
    steps: [
      {
        title: "Incremental Bulk Ingestion",
        description: "The `salesforce_connector` utilizes the SFDC Bulk API v2 to incrementally sync standard objects (Accounts, Opportunities) and custom objects into a columnar Parquet format without hitting API rate limits.",
        icon: "Database"
      },
      {
        title: "Cross-Platform Entity Resolution",
        description: "Arcli automatically resolves the messy reality of B2B sales: merging HubSpot Contact IDs with Salesforce Lead IDs and mapping them to parent Account hierarchies.",
        icon: "Link"
      },
      {
        title: "Semantic RevOps Layer",
        description: "Define what 'Qualified Pipeline' actually means to your business in Arcli's governance layer. The AI agent strictly adheres to this definition, preventing hallucinated calculations.",
        icon: "ShieldCheck"
      },
      {
        title: "Automated Slack Watchdogs",
        description: "Deploy an agent to monitor the semantic layer. If next quarter's pipeline generation drops below the historical 30-day moving average, it instantly alerts the VP of Sales in Slack.",
        icon: "Bell"
      }
    ]
  },

  useCases: {
    title: "RevOps Conversational Scenarios",
    items: [
      {
        title: "Rep Performance & Quota Attainment",
        description: "The AI agent aggregates closed-won opportunities, grouping by the Account Executive's team hierarchy, handling complex date-math automatically without requiring a rigid Salesforce report matrix.",
        icon: "TrendingUp"
      },
      {
        title: "Stalled Deal Identification (Time-in-Stage)",
        description: "Leveraging Arcli's historical snapshotting, the agent calculates the exact duration a deal has spent in its current stage (e.g., 'Legal Review'), identifying friction points before the deal dies.",
        icon: "Clock"
      },
      {
        title: "Full-Funnel Velocity by Lead Source",
        description: "The agent executes a cross-platform JOIN, linking HubSpot campaign attribution data to Salesforce Opportunity data to calculate the four core velocity metrics grouped by marketing origin.",
        icon: "Filter"
      }
    ]
  },

  strategicScenario: {
    title: "The Engine Room: Cross-Platform Pipeline Velocity",
    description: "To calculate true Pipeline Velocity (V = (Number of Ops * Win Rate * Avg Deal Size) / Length of Sales Cycle), Arcli bridges the gap between Marketing (HubSpot) and Sales (Salesforce).",
    dialect: "DuckDB SQL (Embedded Execution)",
    sql: `-- Generated by Arcli AI Semantic Router
WITH hubspot_attribution AS (
    SELECT 
        hs_contact_id,
        email,
        recent_conversion_event_name AS campaign_source
    FROM tenant_workspace.hubspot.contacts
    WHERE createdate >= CURRENT_DATE - INTERVAL 180 DAY
),
salesforce_opps AS (
    SELECT 
        o.id AS opportunity_id,
        c.email AS primary_contact_email,
        o.amount,
        o.is_won,
        DATE_DIFF('day', o.created_date, o.close_date) AS days_to_close
    FROM tenant_workspace.salesforce.opportunities o
    LEFT JOIN tenant_workspace.salesforce.opportunity_contact_roles ocr ON o.id = ocr.opportunity_id
    LEFT JOIN tenant_workspace.salesforce.contacts c ON ocr.contact_id = c.id
    WHERE o.is_closed = TRUE AND o.created_date >= CURRENT_DATE - INTERVAL 180 DAY
),
unified_pipeline AS (
    SELECT 
        s.opportunity_id, s.amount, s.is_won, s.days_to_close,
        COALESCE(h.campaign_source, 'Outbound / Unattributed') AS lead_source
    FROM salesforce_opps s
    LEFT JOIN hubspot_attribution h ON LOWER(s.primary_contact_email) = LOWER(h.email)
)
SELECT 
    lead_source,
    COUNT(opportunity_id) AS total_opportunities,
    ROUND(SUM(CASE WHEN is_won THEN 1 ELSE 0 END) * 100.0 / COUNT(opportunity_id), 2) AS win_rate_pct,
    ROUND(AVG(CASE WHEN is_won THEN amount ELSE NULL END), 0) AS avg_deal_size_usd,
    ROUND(AVG(CASE WHEN is_won THEN days_to_close ELSE NULL END), 1) AS avg_sales_cycle_days,
    -- Pipeline Velocity ($/Day)
    CASE 
        WHEN AVG(CASE WHEN is_won THEN days_to_close ELSE NULL END) = 0 THEN 0
        ELSE ROUND((COUNT(opportunity_id) * (SUM(CASE WHEN is_won THEN 1 ELSE 0 END)::FLOAT / COUNT(opportunity_id)) * AVG(CASE WHEN is_won THEN amount ELSE NULL END)) / AVG(CASE WHEN is_won THEN days_to_close ELSE NULL END), 0)
    END AS pipeline_velocity_per_day
FROM unified_pipeline
GROUP BY 1 HAVING COUNT(opportunity_id) > 5
ORDER BY pipeline_velocity_per_day DESC;`,
    businessOutcome: "Allows Go-To-Market leaders to instantly pivot marketing spend toward the campaigns that generate the fastest revenue, bypassing the need for complex Data Warehouse ETL pipelines."
  },

  matrix: {
    title: "Arcli vs Salesforce Native Reporting",
    description: "Why high-growth RevOps teams are abandoning standard SFDC dashboards.",
    columns: ["Feature", "Arcli AI Data Agents", "Salesforce Reports & Dashboards", "Traditional BI (Tableau/Looker)"],
    rows: [
      {
        feature: "Cross-Platform JOINs",
        arcli: "Native (DuckDB engine)",
        legacyA: "Impossible (SFDC data only)",
        legacyB: "Requires Data Warehouse & dbt"
      },
      {
        feature: "Custom Mathematical Metrics",
        arcli: "Natural Language (Semantic Layer)",
        legacyA: "Complex Summary Formulas (Limited)",
        legacyB: "Requires SQL/DAX expertise"
      },
      {
        feature: "Historical Snapshotting",
        arcli: "Automated at ingestion",
        legacyA: "Requires custom 'Reporting Snapshots'",
        legacyB: "Depends on complex ETL architecture"
      },
      {
        feature: "Executive Accessibility",
        arcli: "Ask natively in Slack / Chat",
        legacyA: "Navigate complex folder structures",
        legacyB: "Dashboard hunting & filter fatigue"
      }
    ]
  },

  faqs: [
    {
      q: "Does Arcli support Salesforce Custom Objects?",
      a: "Yes. During the connection flow, Arcli dynamically profiles your Salesforce schema, automatically mapping any standard or custom objects (and custom fields with `__c`) into your queryable semantic layer.",
      persona: "RevOps Manager"
    },
    {
      q: "Will Arcli exhaust my Salesforce API limit?",
      a: "No. Our `salesforce_connector` intelligently utilizes the Salesforce Bulk API v2 for initial loads and relies on the incremental streaming API for updates, ensuring minimal impact on your daily API quotas.",
      persona: "Data Engineer"
    },
    {
      q: "Can Arcli write data back to Salesforce?",
      a: "No. Arcli operates strictly with read-only execution guarantees. We extract and analyze the data to provide insights without any risk of accidentally overwriting or mutating your production CRM records.",
      persona: "CISO"
    },
    {
      q: "How does Arcli handle complex Account hierarchies?",
      a: "Our Semantic Router understands recursive parent-child relationships natively. If you ask for 'Global Revenue for Microsoft', the agent will automatically traverse the `ParentId` tree to sum opportunities across all regional subsidiary accounts.",
      persona: "VP of Sales"
    }
  ]
};