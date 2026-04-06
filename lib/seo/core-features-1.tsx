// lib/seo/core-features-1.tsx

/**
 * SEO v13 SYSTEM: Core Features (Part 1)
 * * SERP Realism Layer: 
 * - Target: Position 1-3 for "Conversational AI Data Analysis", "Enterprise AI Business Intelligence", "AI Dashboard Builder", "Predictive AI Analytics", and "Slack Data Bot".
 * * Architecture:
 * - Upgraded to V13 deterministic block engine.
 * - Deep schema.org integration for Rich Snippets.
 * - Massive Information Gain via concrete SQL examples replacing generic feature claims.
 */

export const coreFeaturesPart1 = {
  "ai-data-analysis": {
    path: "/features/ai-data-analysis",
    meta: {
      title: "Conversational AI Data Analysis | Arcli",
      description: "Transform raw data into clear business answers instantly. Stop waiting on engineering tickets and get mathematically verified insights in seconds.",
      keywords: [
        "AI Data Analysis", 
        "Tableau alternative", 
        "Data Exploration AI", 
        "Natural Language Analytics", 
        "Self-Serve Data"
      ],
      serpRealism: {
        primaryTarget: "Conversational AI Data Analysis",
        difficulty: "High",
        intent: "Commercial Investigation & Informational"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "Self-Serve Analytics",
          title: "Stop Waiting for Data Tickets",
          subtitle: "Ask your database questions in plain English and receive mathematically verified insights in seconds. No SQL required. No dashboard fatigue.",
          primaryCta: { label: "Start Analyzing", href: "/register" },
          secondaryCta: { label: "View How It Works", href: "#workflow" },
          trustSignals: [
            "Near Real-Time Time to Insight",
            "~15 hrs/wk Engineering Hours Saved",
            "Zero Data Duplication"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "The End of the Analytics Bottleneck",
          text: "If you can type a question, you can analyze millions of rows. We translate your intent into optimal **SQL**, bypassing the steep learning curves of legacy BI tools. **Conversational AI data analysis** is only valuable when coupled with deterministic compilation and a **zero-data-movement** security architecture. Arcli acts as a mathematically-verified orchestration layer for your **self-serve data**, completely eliminating the operational drag of the analyst queue.",
          semanticEntities: ["Conversational AI data analysis", "SQL", "zero-data-movement", "self-serve data", "orchestration layer"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "ProcessStepper",
          dataMapping: "Connect (Provide read-only URL) -> Ask (Type plain English) -> Act (System generates interactive visualization).",
          interactionPurpose: "Visualize the speed from connection to insight, proving the elimination of the engineering bottleneck.",
          intentServed: "Onboarding friction reduction for technical evaluators."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "Translating Intent to Complex Cohort Analysis",
          description: "A business user asks: 'Compare the 30-day retention rate of users who completed onboarding vs those who skipped.' Arcli instantly generates and executes the optimal warehouse SQL.",
          businessOutcome: "Identifies high-impact product friction points to justify engineering resources instantly, without a 2-week Jira ticket delay.",
          language: "sql",
          code: `
-- AI Generated: Cohort Retention Analysis
WITH cohort AS (
    SELECT user_id, MIN(DATE_TRUNC('month', created_at)) as cohort_month 
    FROM tenant.events 
    GROUP BY 1
) 
SELECT 
    c.cohort_month, 
    COUNT(DISTINCT c.user_id) as retained 
FROM cohort c
JOIN tenant.user_activity a ON c.user_id = a.user_id
WHERE a.active_days >= 30 
GROUP BY 1;`
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Arcli vs. Traditional BI",
          description: "Why drag-and-drop tools are failing modern operations teams.",
          visualizationType: "ComparisonTable",
          columns: ["Capability", "Arcli (AI Data Analysis)", "Traditional BI (Tableau/Power BI)"],
          rows: [
            { feature: "Time to First Chart", arcli: "Seconds (AI inferred)", competitor: "Days (Manual modeling required)" },
            { feature: "Learning Curve", arcli: "Zero (Natural Language)", competitor: "High (Proprietary formulas)" },
            { feature: "Ad-Hoc Exploration", arcli: "Infinite conversational drill-downs", competitor: "Limited by pre-built dashboard filters" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "Transforming Daily Operations",
          scenarios: [
            {
              title: "No More Broken Reports on Dirty Data",
              description: "The platform automatically navigates messy date formats, duplicate entries, and null values before performing math, ensuring trustworthy numbers without manual Excel scrubbing."
            },
            {
              title: "End Manual Metric Checking",
              description: "Arcli continuously monitors core metrics and flags unusual dips or spikes automatically, eliminating the need for daily manual dashboard checks and catching silent revenue leaks."
            }
          ]
        }
      },
      {
        type: "InternalLinkingBlock",
        payload: {
          title: "Expand Your Analytical Capabilities",
          links: [
            { label: "Predictive AI Analytics", href: "/features/predictive-ai-analytics", description: "Forecast trends based on the data you just explored." },
            { label: "AI Dashboard Builder", href: "/features/ai-dashboard-builder", description: "Turn your ad-hoc queries into live dashboards." }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "AI Analysis FAQs",
          faqs: [
            { question: "Is my data used to train your AI models?", answer: "Absolutely not. Your proprietary data never leaves your secure perimeter and is strictly excluded from any global model training." },
            { question: "What happens if the platform misunderstands a question?", answer: "Every generated chart includes a transparent, plain-English summary of the exact mathematical steps taken. You can verify the logic instantly, and tweak the underlying SQL if needed." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication", "FAQPage"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "SoftwareApplication",
                "name": "Arcli AI Data Analysis",
                "applicationCategory": "BusinessApplication",
                "description": "Conversational AI platform for generating instant, mathematically verified data insights without SQL."
              }
            ]
          }
        }
      }
    ]
  },

  "ai-business-intelligence": {
    path: "/features/ai-business-intelligence",
    meta: {
      title: "Enterprise AI Business Intelligence | Arcli",
      description: "Ensure every department uses the exact same definitions for Revenue and Churn. Centralized metric governance meets self-serve AI analytics.",
      keywords: [
        "Metric Governance", 
        "Enterprise AI BI", 
        "Single Source of Truth", 
        "Data Semantic Layer", 
        "Self-Serve Analytics"
      ],
      serpRealism: {
        primaryTarget: "Enterprise AI Business Intelligence",
        difficulty: "High",
        intent: "Commercial Investigation & Architectural Comparison"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "Enterprise AI BI",
          title: "End the 'Whose Numbers Are Right?' Debate",
          subtitle: "Define your core business metrics once. Allow your entire organization to query them securely in plain English, guaranteeing 100% consistency across departments.",
          primaryCta: { label: "Establish Governance", href: "/register" },
          secondaryCta: { label: "Read Architecture", href: "#architecture" },
          trustSignals: [
            "100% Reporting Consistency",
            "Strict Row-Level Access Controls (RBAC)",
            "Native dbt Integration"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "The Semantic Layer for the AI Era",
          text: "AI analytics will fail at the enterprise level unless anchored to a strict **Data Semantic Layer** that governs mathematical definitions. **Enterprise AI BI** requires more than a chat interface; it requires **Metric Governance**. With Arcli, data leaders define 'Active User' once. Whenever anyone asks a question involving those terms, the platform forcefully applies your strict definition, ensuring a true **single source of truth** across the entire organization.",
          semanticEntities: ["Data Semantic Layer", "Enterprise AI BI", "Metric Governance", "single source of truth", "Self-Serve Analytics"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "DataRelationshipsGraph",
          dataMapping: "Semantic Hub (Defines 'Net Revenue') -> Routes identically to -> Sales Chat, Marketing Dashboard, Finance Alert.",
          interactionPurpose: "Show how a single defined metric propagates to all enterprise queries flawlessly, eliminating reporting drift.",
          intentServed: "System architecture validation for Head of Data."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "Governing Complex Calculations: NRR",
          description: "Instead of having 5 different NRR formulas floating around in various spreadsheets, Arcli locks the definition in the semantic layer.",
          businessOutcome: "Provides absolute executive confidence. Leaders make decisions based on audited, system-enforced logic.",
          language: "sql",
          code: `
-- AI Semantic Router Output: Net Revenue Retention (NRR)
-- Enforced globally for all 'NRR' related prompts
SELECT 
    customer_tier, 
    SUM(current_arr) / NULLIF(SUM(starting_arr), 0) AS net_revenue_retention 
FROM tenant.enterprise_accounts 
WHERE months_active >= 12 
GROUP BY 1;`
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Arcli vs. Legacy Headless BI",
          description: "Bridging the gap between strict governance and actual usability.",
          visualizationType: "ComparisonTable",
          columns: ["Feature", "Arcli (AI BI)", "Headless BI (Looker/dbt alone)"],
          rows: [
            { feature: "Business User Accessibility", arcli: "Plain English queries", competitor: "Requires SQL/LookML knowledge" },
            { feature: "Implementation Speed", arcli: "Hours (AI Maps Schema)", competitor: "Months (Manual YAML definition)" },
            { feature: "Metric Consistency", arcli: "System-Enforced", competitor: "System-Enforced" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "Enterprise Scale Governance",
          scenarios: [
            {
              title: "Leverage Your Existing dbt Models",
              description: "Zero wasted engineering effort. Arcli natively integrates with the modern data stack, inheriting the rigorous transformations and tables your data engineers have already perfected."
            },
            {
              title: "Stop Guessing the Root Cause",
              description: "When a KPI dips, the platform automatically performs variance analysis, highlighting the specific region or customer segment causing the drop instead of just reporting the aggregate loss."
            }
          ]
        }
      },
      {
        type: "InternalLinkingBlock",
        payload: {
          title: "Extend Your Enterprise Deployment",
          links: [
            { label: "Slack & Teams Integration", href: "/features/slack-teams-data-bot", description: "Deploy your governed metrics directly into enterprise chat." },
            { label: "Security & Auditing", href: "/compliance/query-auditing", description: "Review our cryptographic query logging and RBAC." }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "Enterprise BI FAQs",
          faqs: [
            { question: "How do you ensure metric consistency across departments?", answer: "Through our AI Semantic Routing layer. A data leader defines a term once. If Marketing and Finance both ask for 'Revenue,' the AI forcefully compiles the exact same underlying SQL block." },
            { question: "Can we restrict access to specific departments?", answer: "Yes. Arcli integrates with Okta/Azure AD to inherit row-level security. You can create isolated workspaces ensuring users only query data they are explicitly authorized to see." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication", "FAQPage"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "SoftwareApplication",
                "name": "Arcli Enterprise AI BI",
                "applicationCategory": "BusinessApplication",
                "description": "Enterprise business intelligence platform featuring strict semantic metric governance and conversational AI access."
              }
            ]
          }
        }
      }
    ]
  },

  "ai-dashboard-builder": {
    path: "/features/ai-dashboard-builder",
    meta: {
      title: "Automated AI Dashboard Builder | Arcli",
      description: "Build interactive, live business dashboards using natural language. Replace weeks of manual configuration with instant, AI-generated layouts.",
      keywords: [
        "AI Dashboard Builder", 
        "Automated Visualization", 
        "BI Dashboard Generator", 
        "Live Dashboards", 
        "Self Serve BI"
      ],
      serpRealism: {
        primaryTarget: "AI Dashboard Builder",
        difficulty: "Medium",
        intent: "Commercial Investigation & How-to"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "Automated Visualization",
          title: "Dashboards Built at the Speed of Thought",
          subtitle: "Stop dragging and dropping charts. Describe your reporting goals, and our AI automatically constructs beautiful, interactive dashboards connected to your live data.",
          primaryCta: { label: "Build a Dashboard Now", href: "/register" },
          secondaryCta: { label: "See Examples", href: "#examples" },
          trustSignals: [
            "Generate in Seconds",
            "Live Database Connection",
            "Frictionless External Sharing"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "The End of Manual Configuration",
          text: "The era of manually mapping X and Y axes is over. Your semantic intent should determine the visual layout automatically. With Arcli's **AI Dashboard Builder**, you simply type 'Build a marketing health dashboard.' The engine infers the required KPIs, writes the **live dashboard** SQL, selects the optimal **automated visualization** formats, and deploys a **self-serve BI** asset instantly.",
          semanticEntities: ["AI Dashboard Builder", "live dashboards", "automated visualization", "self-serve BI", "BI Dashboard Generator"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "AnalyticsDashboard",
          dataMapping: "Simulated generation: User Prompt -> AI infers 4 KPIs -> Renders Bar, Line, and Scatter plots instantly.",
          interactionPurpose: "Showcase the seamless transition from natural language to a fully functional, multi-panel dashboard.",
          intentServed: "Visual proof of concept for Operations and Agency Managers."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "Automating Complex Visual Aggregations: CAC",
          description: "To build a dashboard, the AI must first write perfect data extraction queries. Here is how Arcli automatically calculates CAC for a marketing dashboard generation request.",
          businessOutcome: "Replaces weeks of submitting tickets, designing layouts, and QAing aggregations. Dashboards are ephemeral and cheap to generate.",
          language: "sql",
          code: `
-- AI Generated: Dashboard Component (Customer Acquisition Cost)
SELECT 
    campaign_name, 
    SUM(spend) AS total_spend, 
    SUM(spend) / NULLIF(COUNT(DISTINCT lead_id), 0) AS customer_acquisition_cost 
FROM marketing.ad_performance 
WHERE date >= CURRENT_DATE - INTERVAL '7 days' 
GROUP BY 1
ORDER BY customer_acquisition_cost ASC;`
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Dashboard Creation Matrix",
          description: "Comparing the operational overhead of visualization tools.",
          visualizationType: "ComparisonTable",
          columns: ["Action", "Arcli (AI Generator)", "Standard BI (Metabase/Tableau)"],
          rows: [
            { feature: "Select Chart Type", arcli: "AI Inferred", competitor: "Manual Selection" },
            { feature: "Map Axes & Groupings", arcli: "AI Inferred", competitor: "Manual Configuration" },
            { feature: "Update Parameters", arcli: "Natural Language Prompt", competitor: "Click through nested menus" },
            { feature: "Drill-Down", arcli: "Conversational Follow-up", competitor: "Pre-configured drill paths only" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "Deploying Insights Instantly",
          scenarios: [
            {
              title: "End the 'Dead-End' Dashboard",
              description: "Unlike static BI images, every chart generated by Arcli is conversational. Spot an anomaly? Click it and ask a follow-up question to drill down to the row-level data immediately."
            },
            {
              title: "Frictionless External Sharing",
              description: "Publish dashboards via read-only secure links or iframes to share live metrics with investors or clients, protected by password gating and automated expirations."
            }
          ]
        }
      },
      {
        type: "InternalLinkingBlock",
        payload: {
          title: "Enhance Your Dashboards",
          links: [
            { label: "Predictive Analytics", href: "/features/predictive-ai-analytics", description: "Add forecasted trendlines to any dashboard." },
            { label: "Slack Integration", href: "/features/slack-teams-data-bot", description: "Push dashboard summaries to Slack automatically." }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "AI Dashboard FAQs",
          faqs: [
            { question: "Can I manually edit the dashboard after the AI builds it?", answer: "Absolutely. The platform provides a perfect starting baseline, but you retain full control to drag, drop, tweak the chart types, and edit the underlying SQL." },
            { question: "Do viewers of the dashboard need a paid license?", answer: "No. You can securely share read-only dashboard links with internal stakeholders or external clients without requiring them to have authoring licenses." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication"],
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Arcli AI Dashboard Builder",
            "applicationCategory": "BusinessApplication",
            "description": "Generate live, interactive data dashboards instantly using conversational AI and natural language prompts."
          }
        }
      }
    ]
  },

  "predictive-ai-analytics": {
    path: "/features/predictive-ai-analytics",
    meta: {
      title: "Predictive AI Analytics & Forecasting | Arcli",
      description: "Anticipate market shifts before they happen. Forecast revenue, predict customer churn, and model financial scenarios instantly using historical data.",
      keywords: [
        "Predictive Analytics", 
        "AI Forecasting Tool", 
        "Revenue Projection Software", 
        "Churn Prediction AI", 
        "Data Modeling SaaS"
      ],
      serpRealism: {
        primaryTarget: "AI Forecasting Tool",
        difficulty: "Medium",
        intent: "Commercial Investigation & Informational"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "AI Forecasting",
          title: "See the Future. Act Before It Happens.",
          subtitle: "Move from looking backward to planning forward. Project financial trajectories and catch customer churn weeks before it hits the P&L statement.",
          primaryCta: { label: "Model Your Data", href: "/register" },
          secondaryCta: { label: "View Forecasting Engine", href: "#engine" },
          trustSignals: [
            "Statistically Verified Models",
            "60% Reduction in Planning Cycle Time",
            "In-Warehouse Compute (No Data Export)"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "Democratizing Data Science",
          text: "You no longer need to extract data into a Python or Jupyter environment to run powerful, mathematically sound linear regressions or ARIMA forecasting. Arcli pushes **predictive analytics** down to the business operator. As a native **AI forecasting tool**, it evaluates historical seasonality in your warehouse and generates a **revenue projection** instantly. Identify **churn prediction AI** patterns without the data science bottleneck.",
          semanticEntities: ["Predictive Analytics", "AI forecasting tool", "revenue projection", "churn prediction AI", "ARIMA", "Linear regression"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "MetricsChart",
          dataMapping: "Historical Line Chart (Solid) branching into Predictive Forecast (Dotted) with 95% Confidence Interval Shading.",
          interactionPurpose: "Visual validation of forecasting capabilities, showing rigorous statistical bounds rather than random guesses.",
          intentServed: "Trust building for FP&A Teams and Data Scientists."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "Proactive Churn Modeling via SQL",
          description: "Arcli doesn't use black-box magic; it writes highly advanced statistical SQL. Here is how the AI identifies enterprise clients whose usage has dropped significantly below their historical baseline.",
          businessOutcome: "Generates a highly targeted 'At-Risk' list for Customer Success to action immediately, saving accounts before they cancel.",
          language: "sql",
          code: `
-- AI Generated: Predictive Churn Risk Detection
WITH historical_baseline AS (
    SELECT account_id, AVG(login_count) as avg_6m 
    FROM tenant.activity_logs 
    WHERE date >= CURRENT_DATE - INTERVAL '180 days' 
    GROUP BY 1
) 
SELECT 
    c.account_id,
    c.current_login_count,
    h.avg_6m,
    ((c.current_login_count - h.avg_6m) / NULLIF(h.avg_6m, 0)) * 100 AS usage_drop_percentage
FROM tenant.current_activity c 
JOIN historical_baseline h ON c.account_id = h.account_id 
WHERE c.current_login_count < (h.avg_6m * 0.7) -- Flag 30% drop
ORDER BY usage_drop_percentage ASC;`
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Forecasting Workflows",
          description: "Comparing the time-to-insight for predictive modeling.",
          visualizationType: "ComparisonTable",
          columns: ["Phase", "Arcli (In-Warehouse AI)", "Custom Data Science (Python)"],
          rows: [
            { feature: "Data Extraction", arcli: "Zero (Queries live DB)", competitor: "Export to CSV/Dataframe" },
            { feature: "Model Selection", arcli: "Automated (ARIMA/Regression)", competitor: "Manual testing via SciPy/Pandas" },
            { feature: "Scenario Adjustments", arcli: "Instant (Natural Language)", competitor: "Requires code rewrite & re-run" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "Applied Predictive Modeling",
          scenarios: [
            {
              title: "Interactive Scenario Modeling",
              description: "Adjust variables conversationally ('What if marketing spend drops 15%?') to view dynamically updated financial outcomes instantly, de-risking strategic decisions in real-time."
            },
            {
              title: "Privacy-Preserving Execution",
              description: "Forecasting is executed using aggregated numbers natively in your warehouse, entirely eliminating the need to expose sensitive individual PII to an external predictive model."
            }
          ]
        }
      },
      {
        type: "InternalLinkingBlock",
        payload: {
          title: "Integrate Your Forecasts",
          links: [
            { label: "Dashboard Builder", href: "/features/ai-dashboard-builder", description: "Pin your live forecasts to an executive dashboard." },
            { label: "Zero-Copy Security", href: "/compliance/zero-copy-analytics", description: "Learn how we forecast without moving your data." }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "Predictive Analytics FAQs",
          faqs: [
            { question: "Can I export the forecasted numbers into our financial models?", answer: "Yes. Any predictive chart can be exported as raw CSV data, allowing your finance team to import the projected baseline directly into Excel or other planning software." },
            { question: "Is our forecasting data sent to external AI providers?", answer: "No. The AI merely generates the SQL string. The actual mathematical calculations and data processing for the forecast are executed within the secure boundary of your own data warehouse." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication", "FAQPage"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "SoftwareApplication",
                "name": "Arcli Predictive AI Analytics",
                "applicationCategory": "BusinessApplication",
                "description": "In-warehouse predictive analytics and AI forecasting tool for revenue projection and churn modeling."
              }
            ]
          }
        }
      }
    ]
  },

  "slack-teams-data-bot": {
    path: "/features/slack-teams-data-bot",
    meta: {
      title: "Native Slack & MS Teams Data Bot | Arcli",
      description: "Bring live analytics directly into company chat. Query your database, pull charts, and set automated alerts without leaving Slack or Microsoft Teams.",
      keywords: [
        "Slack Data Bot", 
        "Teams Analytics Integration", 
        "ChatOps BI", 
        "Automated Data Alerts", 
        "Collaborative Analytics"
      ],
      serpRealism: {
        primaryTarget: "Slack Data Analytics Bot",
        difficulty: "Low",
        intent: "Commercial Investigation & How-to"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "ChatOps Analytics",
          title: "Live Data, Right Where Your Team Works",
          subtitle: "Stop forcing teams to log into separate reporting portals. Bring the power of conversational BI directly into the Slack and Teams channels they already use.",
          primaryCta: { label: "Install Slack Bot", href: "/register" },
          secondaryCta: { label: "View Teams Setup", href: "#setup" },
          trustSignals: [
            "3x Higher Platform Adoption",
            "Eliminated Context Switching",
            "Immediate Alert Response"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "Embedding Intelligence into Communication",
          text: "Context-switching to a BI portal kills data adoption. Delivering insights directly to the communication layer increases data-driven decisions massively. With Arcli's **Slack Data Bot** and **Teams Analytics Integration**, you bring **ChatOps BI** to your entire workforce. Query your database instantly in a thread, set up **automated data alerts** for threshold breaches, and foster true **collaborative analytics** without ever leaving the chat interface.",
          semanticEntities: ["Slack Data Bot", "Teams Analytics Integration", "ChatOps BI", "automated data alerts", "collaborative analytics"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "ProcessStepper",
          dataMapping: "Install Bot -> Type '@Arcli alert #sales if signups < 500' -> Bot monitors silently -> Triggers alert chart when threshold breached.",
          interactionPurpose: "Demonstrate the ease of setting up an automated threshold alert directly via chat syntax.",
          intentServed: "Automation setup visualization for Operations and RevOps leads."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "Automated Executive Briefings in Slack",
          description: "Behind the scenes, when a user asks '@Arcli show me the top performing reps this week', the bot compiles the SQL, executes it, and unfurls the chart directly in the Slack thread.",
          businessOutcome: "Fosters public recognition and healthy competition without waiting for a manager to export and distribute a spreadsheet.",
          language: "sql",
          code: `
-- AI Generated: Slack Bot Ad-Hoc Request
SELECT 
    rep_name, 
    SUM(deal_value) AS total_closed 
FROM sales.closed_won_deals 
WHERE close_date >= DATE_TRUNC('week', CURRENT_DATE) 
GROUP BY 1 
ORDER BY total_closed DESC 
LIMIT 5;`
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Data Distribution Methods",
          description: "Why interactive ChatOps beats static reporting.",
          visualizationType: "ComparisonTable",
          columns: ["Feature", "Arcli (Slack/Teams Bot)", "Legacy BI (Scheduled Emails)"],
          rows: [
            { feature: "Data Freshness", arcli: "Real-time query execution", competitor: "Stale at the time of sending" },
            { feature: "Interactivity", arcli: "Reply in thread to drill-down", competitor: "Static PDF/Image" },
            { feature: "Anomaly Detection", arcli: "Instant push notification", competitor: "Wait until next scheduled report" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "ChatOps Capabilities",
          scenarios: [
            {
              title: "Kill Silent Software Failures",
              description: "Set rules in plain English: 'Message #engineering immediately if API timeout errors exceed 5%.' The platform monitors silently and reduces Mean Time to Resolution (MTTR)."
            },
            {
              title: "Strict Channel-Level Enforcement",
              description: "The bot rigorously respects existing data permissions. If an employee asks for locked financial data in a public marketing channel, the bot intelligently blocks the request."
            }
          ]
        }
      },
      {
        type: "InternalLinkingBlock",
        payload: {
          title: "Power Your Bot",
          links: [
            { label: "Semantic Metric Governance", href: "/features/ai-business-intelligence", description: "Ensure the bot answers consistently across all channels." },
            { label: "Anomaly Detection", href: "/features/predictive-ai-analytics", description: "Trigger Slack alerts based on predictive forecasting deviations." }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "Slack & Teams Bot FAQs",
          faqs: [
            { question: "Will the bot read all of our private conversations?", answer: "No. By design, the bot operates on a strictly 'mention-only' basis. It only processes text when explicitly tagged with the @ symbol in an authorized channel." },
            { question: "How does the bot handle massive datasets that don't fit in a chat message?", answer: "If a question requires deep analysis or returns a massive table, the bot provides a top-line visual summary in chat and securely links the user to the Arcli web portal for deeper exploration." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication"],
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Arcli ChatOps Data Bot",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Slack, Microsoft Teams",
            "description": "Slack and MS Teams bot for live database querying, automated alerts, and conversational business intelligence."
          }
        }
      }
    ]
  }
};