/**
 * SEO v13 SYSTEM: Core Features (Part 2)
 * * Architecture:
 * - Upgraded from legacy root-object schema to strict V13 `blocks` array architecture.
 * - String-based dataMappings have been converted to deeply nested, type-safe objects (Rule 21).
 * - Content covers: Narrative Insights, Excel/WASM Analysis, and Embedded BI.
 */

export const coreFeaturesPart2 = {
  "ai-narrative-insights": {
    path: "/features/ai-narrative-insights",
    meta: {
      title: "Automated Executive Reporting & AI Summaries | Arcli",
      description: "Stop wasting hours writing weekly performance updates. Arcli automatically translates complex data into plain-English executive summaries in seconds.",
      keywords: [
        "Automated Executive Reporting", 
        "Data Storytelling", 
        "AI BI Summaries", 
        "Automated Board Reports", 
        "Root Cause Analysis AI"
      ],
      serpRealism: {
        primaryTarget: "Automated Executive Reporting AI",
        difficulty: "Medium",
        intent: "Commercial investigation & Informational"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "Narrative Intelligence",
          title: "Stop Wasting Mondays Writing Reports",
          subtitle: "Arcli replaces manual reporting by automatically translating your data into plain-English executive summaries that your entire team can understand and act upon instantly.",
          primaryCta: { label: "Automate Your Reporting", href: "/register?intent=reporting_automation" },
          secondaryCta: { label: "See Example Narratives", href: "#examples" },
          trustSignals: [
            "100% Deterministic (Zero Hallucinations)",
            "Instant Root Cause Analysis",
            "Native Slack Distribution"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "Data Storytelling Without the Fiction",
          text: "Generic LLMs fabricate numbers. Arcli's **automated executive reporting** engine is fundamentally different. It operates purely as a translation layer, reading the hard math returned by your database and converting it to text. This allows for automated **root cause analysis AI** that isolates the exact variable causing a metric to drop. Deliver perfect **AI BI summaries** and **automated board reports** that are mathematically verifiable.",
          semanticEntities: ["Automated executive reporting", "root cause analysis AI", "AI BI summaries", "automated board reports", "Data storytelling"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "ProcessStepper",
          dataMapping: {
            title: "Automated Briefing Workflow",
            steps: [
              { title: "Analyze", description: "The system monitors live dashboards for statistical significance." },
              { title: "Draft", description: "Arcli generates a clear, three-bullet plain English brief explaining the variance." },
              { title: "Distribute", description: "Leadership receives the automated briefing in Slack every Monday at 9 AM." }
            ]
          },
          interactionPurpose: "Show the automated flow from Dashboard Analysis -> Draft -> Slack Delivery.",
          intentServed: "Demonstrate operational automation for Ops Managers."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "Root Cause Variance Query Generation",
          description: "Behind the scenes, the AI doesn't just look at the top-line number; it writes complex grouping queries to find the hidden anomaly.",
          businessOutcome: "Moves the conversation from 'What happened?' directly to 'What should we do about it?'",
          language: "sql",
          code: `
-- AI Generated: Root Cause Variance Isolation
WITH current_week AS (
    SELECT region, SUM(revenue) as rev FROM sales WHERE date >= CURRENT_DATE - 7 GROUP BY 1
),
previous_week AS (
    SELECT region, SUM(revenue) as rev FROM sales WHERE date >= CURRENT_DATE - 14 AND date < CURRENT_DATE - 7 GROUP BY 1
)
SELECT 
    c.region, c.rev as current_rev, p.rev as prev_rev, 
    (c.rev - p.rev) as variance,
    ((c.rev - p.rev) / NULLIF(p.rev, 0)) * 100 as percent_change
FROM current_week c JOIN previous_week p ON c.region = p.region
ORDER BY variance ASC LIMIT 1; -- Finds the biggest drop`
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "The Reporting Time-Sink",
          description: "Contrasting the painful manual Word/PPT process against instant Arcli generation.",
          visualizationType: "ComparisonTable",
          columns: ["Reporting Step", "Arcli (AI Narrative)", "Manual Workflow"],
          rows: [
            { category: "Data Gathering", arcliAdvantage: "Continuous live connection", legacy: "Download CSVs from 4 tools" },
            { category: "Drafting", arcliAdvantage: "Seconds (AI Authored)", legacy: "2-3 Hours typing in Word" },
            { category: "Verification", arcliAdvantage: "Click any number to see SQL", legacy: "Hope the VLOOKUP is right" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "Dynamic Audience Translation",
          scenarios: [
            {
              title: "Technical to Executive Translation",
              description: "Generate a highly technical summary of a server log for engineering, and instantly rewrite that exact same data point into a financial impact summary for the CFO."
            },
            {
              title: "Instant Root Cause Analysis",
              description: "If top-line revenue dips, the system dynamically analyzes underlying segments to tell you exactly which region, product line, or sales rep caused it."
            }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "Narrative Reporting FAQs",
          faqs: [
            { question: "Will the AI miss small but important details?", answer: "The narrative engine is programmatically tuned using statistical variance thresholds. It inherently ignores background noise and focuses exclusively on the mathematical outliers that actually impact your business." },
            { question: "Is our data fed into a public LLM to write these stories?", answer: "No. We utilize secure, private inference architectures. Your data is processed entirely within an isolated environment and never trains external models." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication", "FAQPage"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [{ "@type": "SoftwareApplication", "name": "Arcli Executive Reporting AI", "applicationCategory": "BusinessApplication" }]
          }
        }
      }
    ]
  },

  "ai-excel-analysis": {
    path: "/features/ai-excel-analysis",
    meta: {
      title: "Analyze Large CSV & Excel Files with AI | Arcli",
      description: "Excel breaks at 1 million rows. Arcli doesn't. Upload massive CSV files and join them instantly using conversational AI—entirely within your browser.",
      keywords: [
        "Excel Alternative", 
        "Analyze Large CSV", 
        "Join CSV files without SQL", 
        "Excel Row Limit Workaround", 
        "Big Data Spreadsheet"
      ],
      serpRealism: {
        primaryTarget: "Excel row limit workaround",
        difficulty: "Medium",
        intent: "How-to & Informational"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "Browser-Native Compute",
          title: "Excel Breaks. This Doesn't.",
          subtitle: "Upload massive Excel or CSV files and analyze them without freezing your computer. No complex VLOOKUPs, no broken macros—just plain English conversation powered by browser-native WebAssembly.",
          primaryCta: { label: "Analyze a File Now", href: "/files" },
          secondaryCta: { label: "Read the WASM Docs", href: "/docs/architecture/wasm" },
          trustSignals: [
            "10M+ Row Processing",
            "0 Server Uploads (Total Privacy)",
            "Instant File Joins"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "Escaping the 1 Million Row Trap",
          text: "When dealing with large datasets, the **Excel row limit workaround** usually involves writing python scripts or paying for expensive cloud databases. Arcli is the ultimate **Excel alternative** for big data. We utilize local WebAssembly (WASM) to **analyze large CSV** files natively in your browser. You can **join CSV files without SQL** or VLOOKUPs; just drop them in, and ask the AI to merge them. Raw row data never touches our servers, ensuring absolute privacy for your **big data spreadsheet** needs.",
          semanticEntities: ["Excel row limit workaround", "analyze large CSV", "join CSV files without SQL", "WebAssembly", "Excel alternative"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "DataRelationshipsGraph",
          dataMapping: {
            title: "Zero-Latency WebAssembly Execution",
            traces: [
              { phase: "Local Memory Indexing", durationMs: 45, log: "1.2GB CSV loaded into browser memory via DuckDB WASM." },
              { phase: "AI SQL Compilation", durationMs: 800, log: "Prompt converted to SQL (Sent to cloud, raw data remains local)." },
              { phase: "In-Browser Execution", durationMs: 120, log: "SQL executed locally against memory. Chart rendered." }
            ]
          },
          interactionPurpose: "Visualize how raw data remains secure and lightning-fast by avoiding server uploads.",
          intentServed: "Technical validation for Privacy and Security reviewers."
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Massive File Analysis Matrix",
          description: "Why local WASM outperforms legacy spreadsheet tools.",
          visualizationType: "ComparisonTable",
          columns: ["Capability", "Arcli (WASM Engine)", "Microsoft Excel / Sheets"],
          rows: [
            { category: "Row Limits", arcliAdvantage: "10M+ (Limited only by device RAM)", legacy: "1,048,576 strictly enforced" },
            { category: "Cross-File Joins", arcliAdvantage: "Conversational prompt", legacy: "Brittle VLOOKUP / INDEX MATCH" },
            { category: "Data Privacy", arcliAdvantage: "Processed locally in browser", legacy: "Synced to Microsoft/Google servers" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "Enterprise Use Cases",
          scenarios: [
            {
              title: "Inventory Reconciliation",
              description: "Upload your physical warehouse CSV and your Shopify digital export. Tell the AI: 'Show me all items that Shopify says were sold, but are still in the warehouse file' to instantly spot fulfillment errors."
            },
            {
              title: "Instant Data Cleansing",
              description: "The platform autonomously identifies duplicate rows, standardizes broken date formats, and flags missing values before you run your analysis, saving hours of manual formatting."
            }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "Large File Analysis FAQs",
          faqs: [
            { question: "What happens if my CSV file is larger than 1GB?", answer: "Because the platform runs a specialized columnar database (DuckDB) locally inside your browser, it can seamlessly process multi-gigabyte files that would instantly crash traditional software." },
            { question: "Are my highly confidential files uploaded to your servers?", answer: "No. The file processing happens purely on your local machine using WebAssembly. Only the column headers and your text prompt hit our AI—never the raw rows." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication", "HowTo"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [{ "@type": "SoftwareApplication", "name": "Arcli Local CSV Analyzer" }]
          }
        }
      }
    ]
  },

  "embedded-analytics-api": {
    path: "/features/embedded-analytics-api",
    meta: {
      title: "Embedded Analytics API & White-Label BI | Arcli",
      description: "Turn your application's data into a revenue-generating feature. Embed white-labeled conversational AI analytics directly into your SaaS in under 48 hours.",
      keywords: [
        "Embedded Analytics", 
        "White Label BI", 
        "Customer Facing Analytics", 
        "SaaS Analytics API", 
        "Embeddable Dashboards"
      ],
      serpRealism: {
        primaryTarget: "Embedded Analytics API",
        difficulty: "High",
        intent: "Commercial Investigation"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "White-Label Solution",
          title: "Turn Your Data Into a Revenue Feature",
          subtitle: "Stop wasting engineering sprints building custom dashboards for demanding clients. Drop Arcli's secure, white-labeled AI directly into your SaaS and let your users query their own data.",
          primaryCta: { label: "Get API Access", href: "/register?intent=embedded_api" },
          secondaryCta: { label: "Read Integration Docs", href: "/docs/api" },
          trustSignals: [
            "Integrates in < 48 Hours",
            "Strict Row-Level Security (JWT)",
            "100% Brand Customization"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "The End of Custom Report Tickets",
          text: "Building **customer facing analytics** in-house diverts core engineering focus. Purchasing legacy **embedded analytics** (like Looker) requires $50k+ upfront and strict data modeling. Arcli provides a modern **SaaS Analytics API**. We offer a truly **white label BI** experience that drops securely into your frontend via iframe or React component. Empower your users with **embeddable dashboards** and conversational AI, unlocking new premium pricing tiers for your software.",
          semanticEntities: ["Embedded Analytics", "white label BI", "customer facing analytics", "SaaS Analytics API", "Row-Level Security"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "DataRelationshipsGraph",
          dataMapping: {
            title: "JWT Security Passthrough Model",
            traces: [
              { phase: "User Auths in Host App", durationMs: 0, log: "Host app generates JWT containing { tenant_id: 'acme_corp' }." },
              { phase: "User Asks Embedded Arcli", durationMs: 120, log: "Prompt + JWT passed securely to Arcli API." },
              { phase: "Hard-Filtered SQL Execution", durationMs: 400, log: "Query compiled: SELECT * FROM data WHERE tenant_id = 'acme_corp'." }
            ]
          },
          interactionPurpose: "Visualize the flow of Row-Level Security to prove multi-tenant isolation.",
          intentServed: "Security validation for CTOs and Principal Engineers."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "Injecting Tenant Filters Programmatically",
          description: "Arcli ensures that no matter what the end-user asks the AI, their specific Tenant ID is hard-coded into the underlying SQL execution.",
          businessOutcome: "Guarantees cross-tenant data isolation without needing to replicate databases.",
          language: "sql",
          code: `
-- AI Generated Query (With Embedded JWT Context)
SELECT 
    campaign_name, 
    SUM(conversions) as total
FROM production.ad_metrics
WHERE 
    -- SECURITY LAYER: Automatically injected via JWT token
    tenant_id = 'c13d9a-88f2' 
    AND date >= CURRENT_DATE - 30
GROUP BY 1;`
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Build vs. Buy vs. Arcli",
          description: "The fastest path to monetizing your platform data.",
          visualizationType: "ComparisonTable",
          columns: ["Approach", "Cost / Effort", "End-User Experience"],
          rows: [
            { category: "Arcli Embedded API", arcliAdvantage: "< 48 Hrs / Pay per usage", legacy: "Dynamic, conversational AI access" },
            { category: "Legacy BI (Sisense/Looker)", arcliAdvantage: "$50k+ / Months of modeling", legacy: "Rigid, pre-built static dashboards" },
            { category: "In-House Custom Build", arcliAdvantage: "Massive Engineering Opportunity Cost", legacy: "Basic charts, constant feature requests" }
          ]
        }
      },
      {
        type: "UseCaseBlock",
        payload: {
          title: "Monetization Strategies",
          scenarios: [
            {
              title: "Unlock Premium Pricing Tiers",
              description: "Package conversational analytics as a premium add-on. Proving the ROI of your software visually directly reduces churn and increases contract value."
            },
            {
              title: "Seamless White-Labeling",
              description: "Your customers will never know Arcli is powering the experience. The conversational UI seamlessly inherits your custom fonts, colors, and CSS variables."
            }
          ]
        }
      },
      {
        type: "FAQs",
        payload: {
          title: "Embedded Analytics FAQs",
          faqs: [
            { question: "How does the system ensure a user only sees their own data?", answer: "We use cryptographically signed tokens. Your backend signs a token containing the user's Tenant ID. Our engine injects that ID as a hard filter into every generated query." },
            { question: "Can we restrict the tables the end-user is allowed to query?", answer: "Absolutely. You explicitly define which tables and columns are exposed. Internal system logs or administrative tables remain completely hidden." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication", "APIReference"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [{ "@type": "SoftwareApplication", "name": "Arcli Embedded Analytics API", "applicationCategory": "DeveloperApplication" }]
          }
        }
      }
    ]
  }
};