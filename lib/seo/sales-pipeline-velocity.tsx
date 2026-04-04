// lib/seo/sales-pipeline-velocity.tsx

export const salesPipelineVelocityData = {
  path: "/use-cases/sales-pipeline-velocity",
  meta: {
    title: "AI Analytics for Salesforce & HubSpot | Pipeline Velocity | Arcli",
    description: "Stop wrestling with rigid Salesforce reports. Arcli's AI agents automatically join HubSpot lead data with Salesforce opportunities to calculate true pipeline velocity in real-time.",
    keywords: [
      "Salesforce AI analytics", 
      "HubSpot text to SQL", 
      "pipeline velocity calculation", 
      "RevOps AI data agent", 
      "sales performance BI", 
      "cross-platform CRM analytics"
    ]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "RevOps & Sales Intelligence",
        title: "Conversational BI for Modern RevOps",
        subtitle: "Salesforce reports are too rigid. Spreadsheets are too slow. Arcli deploys AI data agents that ingest Salesforce and HubSpot data, allowing RevOps to ask complex pipeline questions in plain English and get mathematically governed answers instantly.",
        primaryCta: {
          label: "Connect Your CRM",
          href: "/register?intent=revops"
        },
        secondaryCta: {
          label: "View Velocity Architecture",
          href: "#strategic-query"
        },
        trustSignals: [
          "Native Salesforce (SOQL) & HubSpot API Connectors",
          "Supports standard and Custom Objects",
          "Real-time pipeline snapshotting"
        ]
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "The Death of the RevOps Backlog",
        businessOutcome: "RevOps teams spend 40% of their week building ad-hoc Salesforce dashboards for Sales Leaders. Arcli eliminates this bottleneck. By establishing a semantic layer over your CRM data, Sales VPs can interrogate their pipeline directly, saving hours of operational overhead.",
        pillars: [
          {
            title: "True Pipeline Velocity",
            description: "Arcli doesn't just show 'Open Opportunities'. It automatically calculates Win Rate, Average Deal Size, and Sales Cycle Length to provide a dynamic Pipeline Velocity metric ($/day)."
          },
          {
            title: "Cross-Platform Attribution",
            description: "Native CRM reporting fails when marketing data lives in HubSpot and sales data lives in Salesforce. Arcli's semantic engine bridges the Lead-to-Closed-Won gap seamlessly."
          },
          {
            title: "Historical Snapshotting",
            description: "Salesforce overwrites 'Stage' fields. Arcli's sync engine preserves historical state changes, allowing agents to analyze 'Time in Stage' and identify stalled deals automatically."
          }
        ]
      }
    },
    {
      type: "Workflow",
      payload: {
        title: "From Cluttered CRM to Governed AI Analytics",
        description: "How Arcli bypasses Salesforce API limitations to deliver sub-second analytical queries.",
        steps: [
          {
            step: 1,
            title: "Incremental Bulk Ingestion",
            description: "The `salesforce_connector` utilizes the SFDC Bulk API to incrementally sync standard objects (Accounts, Opportunities, Leads) and your specific Custom Objects without hitting API rate limits."
          },
          {
            step: 2,
            title: "Entity Resolution",
            description: "Arcli automatically resolves the messy reality of B2B sales: merging HubSpot Contact IDs with Salesforce Lead IDs and matching them to parent Account hierarchies."
          },
          {
            step: 3,
            title: "Semantic RevOps Layer",
            description: "Define what 'Qualified Pipeline' actually means to your business in Arcli (e.g., 'Stage > 2 AND CloseDate > Today'). The AI agent strictly adheres to this definition."
          },
          {
            step: 4,
            title: "Automated Watchdogs",
            description: "Deploy an agent to monitor the semantic layer. If next quarter's pipeline generation drops below the historical 30-day moving average, it alerts the VP of Sales in Slack."
          }
        ]
      }
    },
    {
      type: "UseCases",
      payload: {
        title: "RevOps Conversational Scenarios",
        scenarios: [
          {
            level: "Basic",
            title: "Rep Performance & Quota Attainment",
            businessQuestion: "Show me the win rate and average deal size for the Enterprise AE team this quarter versus last quarter.",
            description: "The AI agent aggregates closed-won opportunities, grouping by the Account Executive's team hierarchy, and handles the date-math automatically without requiring a complex Salesforce report matrix."
          },
          {
            level: "Intermediate",
            title: "Stalled Deal Identification (Time-in-Stage)",
            businessQuestion: "Which opportunities over $50k have been sitting in the 'Legal Review' stage for more than 14 days?",
            description: "Leveraging Arcli's historical snapshotting, the agent calculates the exact duration a deal has spent in its current stage, identifying friction points in the sales cycle before the deal dies."
          },
          {
            level: "Strategic",
            title: "Full-Funnel Velocity by Lead Source",
            businessQuestion: "What is our pipeline velocity for deals sourced from our HubSpot 'Q3 Webinar' campaign compared to outbound cold calling?",
            description: "The agent executes a cross-platform JOIN. It links the HubSpot campaign attribution data to the Salesforce Opportunity data, calculating the four velocity metrics (Opportunities, Win Rate, Deal Size, Cycle Length) grouped by origin."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "The Engine Room: Cross-Platform Pipeline Velocity",
        description: "To answer the Strategic Scenario, the Arcli engine generates this advanced query. It calculates true Pipeline Velocity (V = (Number of Ops * Win Rate * Avg Deal Size) / Length of Sales Cycle) while joining data across HubSpot and Salesforce.",
        businessOutcome: "Allows Go-To-Market leaders to instantly pivot marketing spend toward the campaigns that generate the fastest revenue, not just the most raw leads.",
        language: "sql",
        code: `
-- AI Agent Generated: Pipeline Velocity by Marketing Source
-- Dialect: DuckDB (via Arcli Embedded Analytics)
-- Target: Calculate holistic sales velocity factoring in HubSpot attribution and Salesforce deal progression.

WITH hubspot_attribution AS (
    -- Extract original lead source from HubSpot Contacts
    SELECT 
        hs_contact_id,
        email,
        recent_conversion_event_name AS campaign_source
    FROM tenant_workspace.hubspot.contacts
    WHERE createdate >= CURRENT_DATE - INTERVAL 180 DAY
),
salesforce_opps AS (
    -- Isolate Closed opportunities to calculate Win Rate and Sales Cycle length
    SELECT 
        o.id AS opportunity_id,
        o.account_id,
        c.email AS primary_contact_email,
        o.amount,
        o.is_won,
        o.is_closed,
        -- Calculate days between creation and close
        DATE_DIFF('day', o.created_date, o.close_date) AS days_to_close
    FROM tenant_workspace.salesforce.opportunities o
    LEFT JOIN tenant_workspace.salesforce.opportunity_contact_roles ocr ON o.id = ocr.opportunity_id
    LEFT JOIN tenant_workspace.salesforce.contacts c ON ocr.contact_id = c.id
    WHERE o.is_closed = TRUE
      AND o.created_date >= CURRENT_DATE - INTERVAL 180 DAY
),
unified_pipeline AS (
    -- Bridge the CRM data with Marketing data via Email
    SELECT 
        s.opportunity_id,
        s.amount,
        s.is_won,
        s.days_to_close,
        COALESCE(h.campaign_source, 'Outbound / Unattributed') AS lead_source
    FROM salesforce_opps s
    LEFT JOIN hubspot_attribution h ON LOWER(s.primary_contact_email) = LOWER(h.email)
)
-- Calculate the Pipeline Velocity Equation per Source
SELECT 
    lead_source,
    COUNT(opportunity_id) AS total_opportunities,
    ROUND(SUM(CASE WHEN is_won THEN 1 ELSE 0 END) * 100.0 / COUNT(opportunity_id), 2) AS win_rate_pct,
    ROUND(AVG(CASE WHEN is_won THEN amount ELSE NULL END), 0) AS avg_deal_size_usd,
    ROUND(AVG(CASE WHEN is_won THEN days_to_close ELSE NULL END), 1) AS avg_sales_cycle_days,
    -- Core Metric: Pipeline Velocity ($/Day) = (Opps * WinRate * DealSize) / Cycle
    CASE 
        WHEN AVG(CASE WHEN is_won THEN days_to_close ELSE NULL END) = 0 THEN 0
        ELSE ROUND(
            (COUNT(opportunity_id) * (SUM(CASE WHEN is_won THEN 1 ELSE 0 END)::FLOAT / COUNT(opportunity_id)) * AVG(CASE WHEN is_won THEN amount ELSE NULL END)) 
            / AVG(CASE WHEN is_won THEN days_to_close ELSE NULL END)
        , 0)
    END AS pipeline_velocity_per_day
FROM unified_pipeline
GROUP BY 1
HAVING COUNT(opportunity_id) > 5 -- Statistical significance filter
ORDER BY pipeline_velocity_per_day DESC;
        `
      }
    },
    {
      type: "ComparisonMatrix",
      payload: {
        title: "Arcli vs Salesforce Native Reporting",
        description: "Why high-growth RevOps teams are abandoning standard SFDC dashboards.",
        columns: ["Feature", "Arcli AI Data Agents", "Salesforce Reports & Dashboards", "Traditional BI (Tableau)"],
        rows: [
          ["Cross-Platform JOINs", "Native (DuckDB/Postgres)", "Impossible (SFDC data only)", "Requires Data Warehouse & ETL"],
          ["Custom Mathematical Metrics", "Natural Language (Semantic Layer)", "Complex Summary Formulas (Limited)", "Requires SQL/DAX expertise"],
          ["Historical Snapshotting", "Automated at ingestion", "Requires separate 'Reporting Snapshots' setup", "Depends on complex ETL architecture"],
          ["Accessibility", "Ask in Slack / Chat", "Navigate complex folder structures", "Dashboard hunting"]
        ]
      }
    },
    {
      type: "FAQs",
      payload: {
        title: "CRM Integration FAQs",
        faqs: [
          {
            question: "Does Arcli support Salesforce Custom Objects?",
            answer: "Yes. During the connection flow, Arcli dynamically profiles your Salesforce schema, automatically mapping any standard or custom objects (and custom fields) into your queryable semantic layer."
          },
          {
            question: "Will Arcli exhaust my Salesforce API limit?",
            answer: "No. Our `salesforce_connector` intelligently utilizes the Salesforce Bulk API v2 for initial loads and relies on the incremental streaming API for updates, ensuring minimal impact on your daily API quotas."
          },
          {
            question: "Can Arcli write data back to Salesforce?",
            answer: "No. Arcli operates strictly with read-only execution guarantees. We extract and analyze the data to provide insights without any risk of accidentally overwriting your production CRM records."
          },
          {
            question: "How does Arcli handle complex Account hierarchies?",
            answer: "Our Semantic Router understands recursive parent-child relationships natively. If you ask for 'Global Revenue for Microsoft', the agent will automatically traverse the `ParentId` tree to sum opportunities across all regional subsidiary accounts."
          }
        ]
      }
    }
  ]
};