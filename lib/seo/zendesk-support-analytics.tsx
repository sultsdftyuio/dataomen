export const zendeskSupportAnalyticsData = {
  path: "/integrations/zendesk-support-analytics",
  meta: {
    title: "AI Analytics for Zendesk | Automate CX & Support Insights | Arcli",
    description: "Connect Zendesk to Arcli's AI agents. Automatically parse nested ticket JSON arrays, extract sentiment, and join support data with Stripe revenue to identify true churn risks.",
    keywords: [
      "Zendesk AI analytics", 
      "support ticket analytics", 
      "customer experience BI", 
      "Zendesk text to SQL", 
      "support ops reporting", 
      "ticket sentiment analysis",
      "first response time automation",
      "join Zendesk and Stripe data"
    ]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "CX & Product Intelligence",
        title: "Stop Tagging. Start Understanding.",
        subtitle: "Zendesk reporting is rigid, and manual ticket tagging is fundamentally broken. Arcli’s AI agents autonomously ingest your Zendesk data, flatten the notorious custom field arrays, and let you query your entire support operation in plain English.",
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
          "Zero-ETL DuckDB Normalization"
        ]
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "The Financial Reality of Support Operations",
        businessOutcome: "Support teams are viewed as cost centers because traditional BI cannot easily correlate a 'Feature Request' ticket with the Lifetime Value (LTV) of the customer asking for it. Arcli breaks this silo, turning unstructured support data into actionable product and revenue intelligence.",
        pillars: [
          {
            title: "Correlating Support with Churn Risk",
            description: "By automatically joining Zendesk tickets with Stripe subscription data, Arcli identifies exactly how much MRR is at risk due to specific bug categories or missed SLA times."
          },
          {
            title: "Eradicating the Tagging Backlog",
            description: "Human agents mistag or ignore ticket categorizations. Arcli's Semantic Engine reads the actual ticket payload, applying consistent, retroactive NLP categorization across thousands of historical conversations."
          },
          {
            title: "Automated SLA Watchdogs",
            description: "Deploy anomaly detectors that monitor First Response Time (FRT) and automatically alert Slack when VIP Enterprise customers (identified via Salesforce/Stripe sync) are waiting longer than their contractual SLAs."
          }
        ]
      }
    },
    {
      type: "Workflow",
      payload: {
        title: "How Arcli Tames Zendesk API Complexity",
        description: "Zendesk APIs return deeply nested JSON arrays that break naive text-to-SQL tools. Arcli’s ingestion pipeline is built specifically to handle this data engineering chaos.",
        steps: [
          {
            step: 1,
            title: "Incremental API Ingestion",
            description: "The Arcli `zendesk_connector` safely paginates through your historical tickets, comments, and agent audits, syncing new data incrementally every 15 minutes without triggering Zendesk's strict 429 rate limits."
          },
          {
            step: 2,
            title: "Automated JSON Normalization",
            description: "Zendesk `custom_fields` are a nightmare of nested array objects. Arcli’s `json_normalizer` uses advanced `jsonb_array_elements` logic to flatten these arrays into queryable, strongly-typed columnar formats automatically."
          },
          {
            step: 3,
            title: "PII Sanitization & Compliance",
            description: "Before data reaches the LLM context window, the `data_sanitizer` strips out credit cards, passwords, and sensitive PII from raw ticket comments, ensuring absolute SOC2 compliance."
          },
          {
            step: 4,
            title: "Conversational Resolution",
            description: "CX leaders ask questions like, 'What is the average resolution time for billing issues this month?' Arcli translates this intent into governed PostgreSQL or DuckDB logic instantly."
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
            title: "Agent Performance & True SLA Adherence",
            businessQuestion: "Which support agents are consistently missing the 2-hour First Response Time (FRT) SLA this week, excluding weekends?",
            description: "The AI agent queries the normalized Zendesk audit logs to calculate exact timestamp deltas between ticket creation and the first public agent comment, automatically excluding weekends and out-of-office hours based on your semantic workspace definitions."
          },
          {
            level: "Intermediate",
            title: "Product Friction via NLP Extraction",
            businessQuestion: "Are there sudden spikes in tickets mentioning 'login failed' after our latest deployment?",
            description: "Instead of relying on dropdown tags, Arcli performs full-text vector analysis over the ticket descriptions. The anomaly detector flags statistical deviations in specific keyword groupings, alerting the Product team to undocumented bugs in real-time."
          },
          {
            level: "Strategic",
            title: "Support Cost vs. Customer LTV (Cross-Platform)",
            businessQuestion: "How much does it cost us in support agent time to service our lowest-tier Shopify customers versus our Enterprise Stripe subscribers?",
            description: "This is where Arcli outclasses traditional dashboards. The agent seamlessly joins Zendesk ticket handles with Stripe Customer IDs, calculating the aggregate 'cost to serve' based on total resolution hours divided by the cohort's MRR."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "The Engine Room: Joining Zendesk with Financial Data",
        description: "To answer the Strategic Scenario ('Support Cost vs. LTV'), the Arcli query planner generates this complex PostgreSQL query. It dynamically unrolls Zendesk's nested JSON arrays, calculates business hours, and bridges the gap to Stripe billing data.",
        businessOutcome: "Allows COOs and VP of CS to instantly see if they are over-servicing low-value customers, leading to data-driven pricing, gating, and support-tiering decisions.",
        language: "sql",
        code: `
-- AI Agent Generated: Support Cost vs Customer Tier (Zendesk + Stripe)
-- Dialect: Standard PostgreSQL / Snowflake
-- Target: Calculate average ticket handling time and volume, grouped by Stripe MRR.

WITH parsed_tickets AS (
    SELECT 
        id AS ticket_id,
        created_at,
        -- Safely extract email from nested requester JSONB
        requester_info->>'email' AS customer_email,
        -- COMPLEXITY: Zendesk stores custom fields as an array of objects [{"id": 123, "value": "x"}]
        -- We must unnest the array to find the specific "Category" field (assuming ID 360012345678)
        (
            SELECT cf->>'value' 
            FROM jsonb_array_elements(custom_fields) cf 
            WHERE cf->>'id' = '360012345678'
        ) AS ticket_category,
        -- Calculate total time open in hours
        EXTRACT(EPOCH FROM (updated_at - created_at))/3600.0 AS resolution_hours
    FROM tenant_workspace.zendesk.tickets
    WHERE status IN ('solved', 'closed')
      AND created_at >= CURRENT_DATE - INTERVAL '90 days'
),
stripe_customers AS (
    SELECT 
        c.email,
        s.status AS sub_status,
        -- Calculate MRR in dollars
        SUM(s.plan_amount_cents) / 100.0 AS current_mrr,
        -- Dynamically bucket customers into revenue tiers
        CASE 
            WHEN SUM(s.plan_amount_cents) / 100.0 >= 1000 THEN 'Enterprise ($1k+)'
            WHEN SUM(s.plan_amount_cents) / 100.0 >= 100 THEN 'Pro ($100+)'
            ELSE 'Basic/Free'
        END AS customer_tier
    FROM tenant_workspace.stripe.customers c
    JOIN tenant_workspace.stripe.subscriptions s ON c.id = s.customer_id
    WHERE s.status = 'active'
    GROUP BY c.email, s.status
),
cross_platform_join AS (
    -- Bridge Zendesk and Stripe via normalized email
    SELECT 
        t.ticket_id,
        t.ticket_category,
        t.resolution_hours,
        COALESCE(s.customer_tier, 'Unknown/Non-Subscriber') AS customer_tier,
        COALESCE(s.current_mrr, 0) AS mrr
    FROM parsed_tickets t
    LEFT JOIN stripe_customers s ON LOWER(TRIM(t.customer_email)) = LOWER(TRIM(s.email))
)
-- Aggregate metrics for executive view
SELECT 
    customer_tier,
    COUNT(DISTINCT ticket_id) AS total_tickets,
    ROUND(AVG(resolution_hours)::numeric, 2) AS avg_resolution_hours,
    SUM(mrr) AS total_mrr_impacted,
    -- Calculate efficiency ratio (Tickets generated per $1k of MRR)
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
        description: "Why native Zendesk Explore and generic BI tools fall short of modern Support Ops realities.",
        columns: ["Feature", "Arcli AI Data Agents", "Zendesk Explore", "Traditional BI (Tableau/Looker)"],
        rows: [
          ["Cross-Platform Joins (Stripe/Shopify)", "Native & Automated", "Impossible natively", "Requires heavy Data Engineering"],
          ["Custom JSON Array Unnesting", "Automated by Semantic Engine", "Not applicable", "Requires complex ETL pipelines"],
          ["Unstructured Text Mining", "Built-in Vector Analysis", "Limited to exact keyword match", "Requires separate NLP architecture"],
          ["Custom SLA Business Logic", "Natural Language Definition", "Rigid pre-built metrics", "Complex SQL required"],
          ["PII Redaction", "Automated at ingestion layer", "Not applicable (in platform)", "Manual script maintenance"],
          ["Ad-hoc Stakeholder Queries", "Ask in Slack / Web Chat", "Wait for CX analyst", "Wait for Data team"]
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
            title: "Zero-Retention LLM Context",
            description: "When using our text-to-SQL capabilities, we guarantee zero data retention. Your Zendesk ticket payloads are never used to train foundational AI models."
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
            question: "How does Arcli handle Zendesk API rate limits for large instances?",
            answer: "Arcli's `sync_engine` is built with exponential backoff and intelligent pagination. We respect Zendesk's API limits by prioritizing incremental syncs (fetching only updated tickets via the incremental export API) rather than full historical loads after the initial setup."
          },
          {
            question: "Can Arcli extract data from Zendesk custom fields?",
            answer: "Yes. Unlike basic connectors that fail on Zendesk's `custom_fields` array structure, Arcli automatically expands and columnarizes custom fields using Postgres/DuckDB JSONB extraction, making every custom dropdown instantly queryable."
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