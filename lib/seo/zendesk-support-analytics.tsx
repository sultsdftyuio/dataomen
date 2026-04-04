// lib/seo/zendesk-support-analytics.tsx

export const zendeskSupportAnalyticsData = {
  path: "/integrations/zendesk-support-analytics",
  meta: {
    title: "AI Analytics for Zendesk | Automate CX & Support Insights | Arcli",
    description: "Connect Zendesk to Arcli's AI agents. Automatically parse nested ticket JSON, extract sentiment, calculate true resolution times, and join support data with Stripe revenue to identify churn risks.",
    keywords: [
      "Zendesk AI analytics", 
      "support ticket analytics", 
      "customer experience BI", 
      "Zendesk text to SQL", 
      "support ops reporting", 
      "ticket sentiment analysis",
      "first response time automation"
    ]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "CX & Product Intelligence",
        title: "Stop Tagging. Start Understanding.",
        subtitle: "Zendesk reporting is rigid, and manual ticket tagging is fundamentally broken. Arcli’s AI agents autonomously ingest your Zendesk data, structure the unstructured text, and let you query your entire support operation in plain English.",
        primaryCta: {
          label: "Connect Zendesk Workspace",
          href: "/register?intent=cx_ops"
        },
        secondaryCta: {
          label: "View Cross-Platform SQL",
          href: "#strategic-query"
        },
        trustSignals: [
          "Native Zendesk API Connector",
          "Automated PII Redaction Engine",
          "Sub-second JSON normalization via DuckDB"
        ]
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "The Financial Reality of Support Operations",
        businessOutcome: "Support teams are viewed as cost centers because traditional BI cannot easily correlate a 'Feature Request' ticket with the Lifetime Value (LTV) of the customer asking for it. Arcli breaks this silo, turning support data into actionable product and revenue intelligence.",
        pillars: [
          {
            title: "Correlating Support with Churn",
            description: "By automatically joining Zendesk tickets with Stripe subscription data, Arcli identifies exactly how much MRR is at risk due to specific bug categories or high resolution times."
          },
          {
            title: "Eradicating the Tagging Backlog",
            description: "Human agents mistag or ignore ticket categorizations. Arcli's Semantic Engine reads the actual ticket payload, applying consistent, retroactive categorization across thousands of historical conversations."
          },
          {
            title: "Automated SLA Watchdogs",
            description: "Deploy anomaly detectors that monitor First Response Time (FRT) and automatically alert Slack when VIP Enterprise customers are waiting longer than their contractual SLAs."
          }
        ]
      }
    },
    {
      type: "Workflow",
      payload: {
        title: "How Arcli Tames Zendesk Complexity",
        description: "Zendesk APIs return deeply nested JSON arrays that break naive text-to-SQL tools. Arcli’s ingestion pipeline is built specifically to handle this chaos.",
        steps: [
          {
            step: 1,
            title: "Incremental API Ingestion",
            description: "The Arcli `zendesk_connector` safely paginates through your historical tickets, comments, and agent audits, syncing new data incrementally every 15 minutes without hitting API rate limits."
          },
          {
            step: 2,
            title: "Automated JSON Normalization",
            description: "Zendesk custom fields are a nightmare of nested key-value pairs. Arcli’s `json_normalizer` flattens these arrays into queryable, strongly-typed columnar formats automatically."
          },
          {
            step: 3,
            title: "PII Sanitization & Compliance",
            description: "Before data reaches the LLM context window, the `data_sanitizer` strips out credit cards, passwords, and sensitive PII from raw ticket comments, ensuring SOC2 compliance."
          },
          {
            step: 4,
            title: "Conversational Resolution",
            description: "CX leaders ask questions like, 'What is the average resolution time for billing issues this month?' Arcli translates this intent into governed PostgreSQL or DuckDB logic."
          }
        ]
      }
    },
    {
      type: "UseCases",
      payload: {
        title: "CX & Support Data Scenarios",
        scenarios: [
          {
            level: "Basic",
            title: "Agent Performance & SLA Adherence",
            businessQuestion: "Which support agents are consistently missing the 2-hour First Response Time (FRT) SLA this week?",
            description: "The AI agent queries the normalized Zendesk audit logs to calculate exact timestamp deltas between ticket creation and the first public agent comment, excluding weekends and out-of-office hours based on your semantic definitions."
          },
          {
            level: "Intermediate",
            title: "Product Friction via NLP Extraction",
            businessQuestion: "Are there sudden spikes in tickets mentioning 'login failed' after our latest deployment?",
            description: "Instead of relying on dropdown tags, Arcli performs full-text analysis over the ticket descriptions. The anomaly detector flags statistical deviations in specific keyword groupings, alerting the Product team to undocumented bugs."
          },
          {
            level: "Strategic",
            title: "Support Cost vs. Customer LTV (Cross-Platform)",
            businessQuestion: "How much does it cost us in support agent time to service our lowest-tier Shopify customers versus our Enterprise Stripe subscribers?",
            description: "This is where Arcli outclasses traditional dashboards. The agent seamlessly joins Zendesk ticket handles with Stripe Customer IDs and Shopify emails, calculating the aggregate 'cost to serve' based on total resolution hours divided by the cohort's MRR."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "The Engine Room: Joining Zendesk with Financial Data",
        description: "To answer the Strategic Scenario ('Support Cost vs. LTV'), the Arcli query planner generates this complex PostgreSQL query. It flattens Zendesk JSON, calculates business hours, and bridges the gap to Stripe billing data.",
        businessOutcome: "Allows COOs and VP of CS to instantly see if they are over-servicing low-value customers, leading to data-driven pricing and support-tiering decisions.",
        language: "sql",
        code: `
-- AI Agent Generated: Support Cost vs Customer Tier (Zendesk + Stripe)
-- Dialect: PostgreSQL
-- Target: Calculate average ticket handling time and volume, grouped by the customer's Stripe MRR tier.

WITH parsed_tickets AS (
    -- Flatten Zendesk tickets and extract the requester's email
    SELECT 
        id AS ticket_id,
        created_at,
        -- Extract email from nested requester JSON using Postgres JSONB operators
        requester_info->>'email' AS customer_email,
        -- Extract custom field for 'Category'
        custom_fields->>'category' AS ticket_category,
        -- Calculate total time open (simple delta, assumes continuous hours for this view)
        EXTRACT(EPOCH FROM (updated_at - created_at))/3600.0 AS resolution_hours
    FROM tenant_workspace.zendesk.tickets
    WHERE status IN ('solved', 'closed')
      AND created_at >= CURRENT_DATE - INTERVAL '90 days'
),
stripe_customers AS (
    -- Map emails to Stripe subscriptions to determine tier
    SELECT 
        c.email,
        s.status AS sub_status,
        -- Calculate MRR in dollars
        SUM(s.plan_amount_cents) / 100.0 AS current_mrr,
        CASE 
            WHEN SUM(s.plan_amount_cents) / 100.0 >= 1000 THEN 'Enterprise'
            WHEN SUM(s.plan_amount_cents) / 100.0 >= 100 THEN 'Pro'
            ELSE 'Basic/Free'
        END AS customer_tier
    FROM tenant_workspace.stripe.customers c
    JOIN tenant_workspace.stripe.subscriptions s ON c.id = s.customer_id
    WHERE s.status = 'active'
    GROUP BY c.email, s.status
),
cross_platform_join AS (
    -- Bridge Zendesk and Stripe via email
    SELECT 
        t.ticket_id,
        t.ticket_category,
        t.resolution_hours,
        COALESCE(s.customer_tier, 'Unknown/Non-Subscriber') AS customer_tier,
        COALESCE(s.current_mrr, 0) AS mrr
    FROM parsed_tickets t
    LEFT JOIN stripe_customers s ON LOWER(t.customer_email) = LOWER(s.email)
)
-- Aggregate metrics for executive view
SELECT 
    customer_tier,
    COUNT(DISTINCT ticket_id) AS total_tickets,
    ROUND(AVG(resolution_hours)::numeric, 2) AS avg_resolution_hours,
    SUM(mrr) AS total_mrr_impacted,
    -- Calculate efficiency ratio (Tickets per $1k of MRR)
    CASE 
        WHEN SUM(mrr) = 0 THEN 0
        ELSE ROUND((COUNT(DISTINCT ticket_id) / (SUM(mrr) / 1000))::numeric, 2) 
    END AS tickets_per_1k_mrr
FROM cross_platform_join
GROUP BY 1
ORDER BY avg_resolution_hours DESC;
        `
      }
    },
    {
      type: "ComparisonMatrix",
      payload: {
        title: "Evaluating CX Analytics Approaches",
        description: "Why native Zendesk reporting and generic BI tools fall short of modern Support Ops needs.",
        columns: ["Feature", "Arcli AI Data Agents", "Zendesk Explore", "Traditional BI (Tableau/Metabase)"],
        rows: [
          ["Cross-Platform Data (Stripe/Shopify)", "Native & Automated", "Impossible natively", "Requires heavy ETL engineering"],
          ["Unstructured Text Mining", "Built-in AI Semantic Layer", "Limited to exact keyword match", "Requires separate NLP pipeline"],
          ["Custom Business Logic (SLAs)", "Natural Language Definition", "Rigid pre-built metrics", "Complex SQL required"],
          ["PII Redaction", "Automated at ingestion", "Not applicable (in platform)", "Manual script maintenance"],
          ["Ad-hoc Stakeholder Queries", "Ask in Slack / Chat", "Wait for CX analyst", "Wait for Data team"]
        ]
      }
    },
    {
      type: "SecurityGuardrails",
      payload: {
        title: "Enterprise Security for Sensitive Support Data",
        description: "Zendesk tickets contain user passwords, addresses, and sensitive complaints. Arcli treats this data with military-grade isolation.",
        features: [
          {
            title: "Automated Data Sanitizer",
            description: "Arcli's `data_sanitizer` acts as a middleware layer during ingestion, utilizing regex and local NER models to mask credit cards, SSNs, and API keys before they ever hit the database."
          },
          {
            title: "Zero-Retention LLM Prompts",
            description: "When using our text-to-SQL capabilities, we guarantee zero data retention. Your Zendesk tickets are never used to train foundational models."
          },
          {
            title: "Row-Level Multi-Tenancy",
            description: "In embedded SaaS scenarios, Arcli strictly enforces Tenant IDs. Agent A can never accidentally query or aggregate tickets belonging to Agent B."
          }
        ]
      }
    },
    {
      type: "FAQs",
      payload: {
        title: "Technical Implementation FAQs",
        faqs: [
          {
            question: "How does Arcli handle Zendesk API rate limits?",
            answer: "Arcli's `sync_engine` is built with exponential backoff and intelligent pagination. We respect Zendesk's API limits by prioritizing incremental syncs (fetching only updated tickets) rather than full historical loads after the initial setup."
          },
          {
            question: "Can Arcli analyze Zendesk Chat and Talk data?",
            answer: "Yes. The connector ingests the entire Zendesk omni-channel suite, including chat transcripts and call logs. These are flattened into the same semantic layer, allowing you to compare resolution times between phone and email support."
          },
          {
            question: "Zendesk Explore gives me average handle time. Why do I need Arcli?",
            answer: "Explore cannot tell you the LTV of the customers creating those tickets, nor can it map a spike in 'billing' tickets to a specific failed Stripe deployment. Arcli is for cross-platform business intelligence, not isolated silo reporting."
          },
          {
            question: "Do I need a data warehouse to store all these tickets?",
            answer: "No. Arcli provides high-performance embedded storage via DuckDB, allowing sub-second analytical queries over millions of tickets without you needing to manage a Snowflake or Postgres instance. However, if you already have a warehouse, we can deploy in a zero-copy architecture."
          }
        ]
      }
    }
  ]
};