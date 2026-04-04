// lib/seo/ai-agents-anomaly-detection.tsx

export const aiAgentsAnomalyDetectionData = {
  path: "/use-cases/ai-agents-anomaly-detection",
  meta: {
    title: "AI Agents for Automated Anomaly Detection & Metric Governance | Arcli",
    description: "Deploy omniscient AI data agents to monitor your semantic layer, detect revenue leaks in real-time, and govern enterprise metrics automatically without manual SQL.",
    keywords: ["AI data agents", "automated anomaly detection", "metric governance", "semantic layer AI", "revenue leak detection", "text-to-sql agents"]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "AI & Metric Governance",
        title: "Omniscient AI Agents for Real-Time Anomaly Detection",
        subtitle: "Stop waiting for dashboards to break. Deploy persistent AI agents that autonomously monitor your semantic layer, detect hidden revenue leaks, and provide root-cause analysis in plain English.",
        primaryCta: {
          label: "Deploy Your First Agent",
          href: "/register"
        },
        secondaryCta: {
          label: "View Architecture",
          href: "#architecture"
        },
        trustSignals: [
          "Connects to Snowflake, BigQuery, Postgres & DuckDB",
          "Zero-copy analytics",
          "Read-only execution guarantees"
        ]
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "Why AI-Driven Metric Governance Matters",
        businessOutcome: "Traditional BI requires humans to actively look for problems. Arcli flips the paradigm: our AI agents continuously monitor your data warehouse, identifying statistically significant deviations before they impact your P&L.",
        pillars: [
          {
            title: "Risk Reduction",
            description: "Catch silent failures—like regional Stripe payment drops or broken checkout flows—within minutes, not at the end of the month."
          },
          {
            title: "Speed to Resolution",
            description: "Agents don't just alert you that a metric dropped; they automatically generate and run the diagnostic SQL to tell you exactly *why*."
          },
          {
            title: "Engineering Efficiency",
            description: "Free your data team from writing ad-hoc diagnostic queries. Stakeholders interact directly with the agent via natural language."
          }
        ]
      }
    },
    {
      type: "Workflow",
      payload: {
        title: "How the Autonomous Agent Pipeline Works",
        description: "From raw database connection to proactive Slack alerts, powered by our multi-tenant execution engine.",
        steps: [
          {
            step: 1,
            title: "Semantic Layer Definition",
            description: "Map your raw tables (e.g., Stripe, Shopify, Snowflake) into governed, standardized metrics (e.g., 'Active Subscriptions', 'Blended CAC')."
          },
          {
            step: 2,
            title: "Agent Deployment & Memory Allocation",
            description: "Spin up a dedicated AI agent. Arcli grants it contextual memory of your schema and historical metric baseline data."
          },
          {
            step: 3,
            title: "Continuous Watchdog Execution",
            description: "The agent writes and schedules highly optimized, dialect-specific SQL (using DuckDB or your cloud warehouse) to poll for anomalies."
          },
          {
            step: 4,
            title: "Root-Cause Orchestration",
            description: "Upon detecting a 2σ (sigma) deviation, the agent autonomously queries adjacent tables to find the correlating dimension (e.g., 'iOS users in Germany')."
          }
        ]
      }
    },
    {
      type: "UseCases",
      payload: {
        title: "Data Agent Scenarios",
        scenarios: [
          {
            level: "Basic",
            title: "Automated MRR Drop Alerts",
            businessQuestion: "Are our Stripe subscriptions failing at a higher rate than normal today?",
            description: "The agent continuously monitors the Stripe MRR semantic metric. If failed payments spike above the 30-day moving average, it triggers a webhook alerting the RevOps team in Slack with the exact cohort of affected users."
          },
          {
            level: "Intermediate",
            title: "Cross-Platform Ad Spend vs. Conversion Decay",
            businessQuestion: "Did our Meta Ads CPC spike while our Shopify conversion rate dropped?",
            description: "The agent cross-references ingestion streams from Meta Ads and Shopify. It identifies anomalies in blended ROAS and proactively flags inefficient campaigns, preventing wasted ad spend over weekends."
          },
          {
            level: "Strategic",
            title: "High-Frequency Fraud & Revenue Leakage Detection",
            businessQuestion: "Are there systemic anomalies in high-value transaction patterns indicating fraud or technical leakage?",
            description: "By executing complex window functions over transactional data, the agent detects micro-anomalies (e.g., high-velocity small transactions from specific IP ranges) and isolates the variables without manual data engineering intervention."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "Inside the Brain: Snowflake Anomaly Detection Query",
        description: "How the AI Agent translates a request to 'monitor for unusual transaction drops' into highly optimized, dialect-specific Snowflake SQL utilizing Z-scores.",
        businessOutcome: "Eliminates the need for a data engineer to write complex statistical SQL. The agent generates, optimizes, and executes this code directly against your warehouse, saving hours of manual diagnostic time and preventing revenue loss.",
        language: "sql",
        code: `
-- AI Agent Generated: Anomaly Detection via Z-Score calculation
-- Dialect: Snowflake
-- Target: Identify regions where hourly revenue deviates > 2.5 standard deviations from the 14-day trailing average.

WITH hourly_revenue AS (
    SELECT 
        DATE_TRUNC('hour', transaction_timestamp) AS txn_hour,
        region_code,
        SUM(amount_usd) AS total_revenue
    FROM enterprise_tenant.core.fact_transactions
    WHERE transaction_timestamp >= DATEADD(day, -14, CURRENT_TIMESTAMP())
      AND status = 'captured'
    GROUP BY 1, 2
),
rolling_stats AS (
    SELECT 
        txn_hour,
        region_code,
        total_revenue,
        AVG(total_revenue) OVER (
            PARTITION BY region_code 
            ORDER BY txn_hour 
            ROWS BETWEEN 336 PRECEDING AND 1 PRECEDING -- 14 days of hours
        ) AS rolling_avg,
        STDDEV(total_revenue) OVER (
            PARTITION BY region_code 
            ORDER BY txn_hour 
            ROWS BETWEEN 336 PRECEDING AND 1 PRECEDING
        ) AS rolling_stddev
    FROM hourly_revenue
)
SELECT 
    txn_hour,
    region_code,
    total_revenue,
    rolling_avg,
    rolling_stddev,
    -- Calculate Z-Score
    (total_revenue - rolling_avg) / NULLIF(rolling_stddev, 0) AS z_score
FROM rolling_stats
-- Isolate statistically significant anomalies (negative drops)
WHERE z_score <= -2.5 
  AND txn_hour >= DATEADD(hour, -1, CURRENT_TIMESTAMP())
ORDER BY z_score ASC;
        `
      }
    },
    {
      type: "SecurityGuardrails",
      payload: {
        title: "Agent Boundaries & Data Security",
        description: "Giving AI access to your data requires enterprise-grade constraints. Arcli agents operate inside a heavily fortified security perimeter.",
        features: [
          {
            title: "Strict Row-Level Security (RLS)",
            description: "Agents inherit the exact permissions of the tenant they operate within. Multi-tenant boundaries are strictly enforced at the query execution engine layer."
          },
          {
            title: "Read-Only Execution",
            description: "All agent-generated SQL is parsed and validated by our DuckDB/Postgres execution engine to ensure absolutely no DML (INSERT, UPDATE, DELETE) or DDL commands can be run."
          },
          {
            title: "Audit Logging & Query Transparency",
            description: "Every query generated and executed by an agent is logged with an immutable hash. Administrators can review exactly what the AI asked the database."
          }
        ]
      }
    },
    {
      type: "FAQs",
      payload: {
        title: "Frequently Asked Questions",
        faqs: [
          {
            question: "Will the AI agent hallucinate queries and return bad data?",
            answer: "Arcli mitigates LLM hallucinations by forcing the agent to query against your pre-defined Semantic Layer, not raw untyped tables. If the agent generates invalid SQL, our internal Query Planner catches the syntax error before execution, self-corrects, and retries."
          },
          {
            question: "How does the agent handle massive datasets?",
            answer: "The agent does not pull raw data into the LLM context window. It uses zero-copy analytics. It writes the SQL, pushes the compute down to your data warehouse (like Snowflake or BigQuery), and only ingests the aggregated results (the answer) back into its memory."
          },
          {
            question: "Can I limit what the agent has access to?",
            answer: "Yes. You assign specific datasets and metric definitions to an agent's 'Workspace'. It cannot query or 'see' tables outside of the precise scope you have authorized."
          },
          {
            question: "How long does it take to train an agent?",
            answer: "Zero training time. Because Arcli relies on semantic mapping and dynamic schema injection, the agent understands your data structure the second you connect your database and define your core metrics."
          }
        ]
      }
    }
  ]
};