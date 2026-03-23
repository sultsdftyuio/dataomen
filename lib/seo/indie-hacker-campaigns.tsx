/**
 * ARCLI.TECH - SEO & Marketing Data Engine
 * Category: The "DataFast" Indie Hacker Campaign
 * Contains 3 Distinct Pages: Database Integrations, SaaS Integrations, Competitor Comparisons
 * Strategy: Zero-Boilerplate, Executive-Friendly, Trust-First Positioning
 * Contact: support@arcli.tech
 */

import {
  Database, Server, Lock, Zap, Cpu, ShieldCheck, 
  CreditCard, Activity, LineChart, MessageSquare, 
  Layers, Combine, Workflow, Globe
} from "lucide-react";

// ---------------------------------------------------------------------------
// TYPES: 100% Functional React Readiness
// ---------------------------------------------------------------------------
export type SEOPageConfig = {
  slug: string;
  pageType: "database" | "saas" | "comparison";
  meta: { title: string; description: string; };
  hero: { badge: string; headline: string; subheadline: string; primaryCta: string; };
  roiMetrics: Array<{ metric: string; label: string; context: string; }>;
  analyticalScenarios: Array<{ title: string; difficulty: string; persona: string; challenge: string; solution: string; outcome: string; technicalEdge: string; }>;
  faqs: Array<{ question: string; answer: string; targetPersona: "CEO" | "Data Engineer" | "Founder"; }>;
  
  // Category-Specific UI Blocks (Only one will be populated per page type)
  performanceMatrix?: Array<{ feature: string; traditional: string; arcli: string; }>;
  zeroCopyPipeline?: Array<{ step: number; title: string; description: string; }>;
  extractionLifecycle?: Array<{ phase: string; title: string; description: string; }>;
  bypassingNativeLimits?: Array<{ limit: string; arcliBypass: string; }>;
  enterpriseEvaluationMatrix?: Array<{ dimension: string; legacyBI: string; arcliEvolution: string; }>;
  synergyScenarios?: Array<{ tool: string; synergy: string; }>;
  trustCenter?: { header: string; description: string; pillars: Array<{ title: string; description: string; }>; };
};

export const seoPagesList: SEOPageConfig[] = [
  // =========================================================================================
  // PAGE 1: DATABASE INTEGRATIONS (Focus: Supabase / Vercel Postgres / Trust Center)
  // =========================================================================================
  {
    slug: "postgres-analytics",
    pageType: "database",
    meta: {
      title: "Zero-ETL Postgres Analytics for Supabase & Vercel | Arcli",
      description: "Connect your Supabase or Vercel Postgres read-replica in 60 seconds. Arcli delivers AI-driven analytical dashboards directly on your production data with a Zero-Mutation Guarantee.",
    },
    hero: {
      badge: "Database Integrations",
      headline: "Chat with your Supabase & Vercel Postgres Data in Seconds.",
      subheadline: "Stop writing complex JOINs for ad-hoc questions. Arcli connects directly to your Postgres database, leveraging read-only connections and DuckDB push-down compute to deliver sub-second answers without moving your raw data.",
      primaryCta: "Connect Postgres (Zero-ETL)",
    },
    roiMetrics: [
      { metric: "0 Data Moved", label: "Zero-Copy Architecture", context: "The math happens where the data lives. We only extract structural metadata." },
      { metric: "< 50ms", label: "Push-Down Compute", context: "Queries are pushed down to your Postgres read-replica, minimizing memory overhead." },
      { metric: "100%", label: "Read-Only Mandate", context: "Strict AES-256 vault encryption combined with isolated, read-only user roles." }
    ],
    // Category-Specific UI: The Zero-Copy Pipeline & Performance Matrix
    zeroCopyPipeline: [
      { step: 1, title: "Secure URI Handshake", description: "Paste your Vercel or Supabase connection string. Arcli encrypts the URI in Vault and establishes a secure, read-only TLS connection." },
      { step: 2, title: "Metadata Introspection", description: "Arcli scans your table schemas, relationships, and JSONB structures, creating a semantic map without reading raw row data." },
      { step: 3, title: "LLM Contextual Grounding", description: "Your schema headers are fed to our AI, eliminating hallucinations by forcing the LLM to write precise, dialect-accurate SQL." },
      { step: 4, title: "Push-Down Execution", description: "When you ask a question, the generated SQL is executed securely on your database. Only the aggregated math is returned to your dashboard." }
    ],
    performanceMatrix: [
      { feature: "JSONB Querying", traditional: "Requires complex manual unnesting and CTEs.", arcli: "AI automatically writes Postgres-native JSONB arrow operators (->>)." },
      { feature: "Infrastructure Cost", traditional: "Requires a secondary warehouse (Snowflake) and Fivetran.", arcli: "Uses your existing Vercel/DigitalOcean database compute." }
    ],
    trustCenter: {
      header: "The Zero-Mutation Guarantee",
      description: "Your production database is sacred. Our architecture ensures your data is never altered.",
      pillars: [
        { title: "Physical Sandboxing", description: "The Semantic Compiler cannot issue INSERT, UPDATE, or DELETE commands." },
        { title: "Least-Privilege Access", description: "We enforce connection strings that are restricted to analytical read-replicas." }
      ]
    },
    analyticalScenarios: [
      {
        title: "Unnesting JSONB User Preferences",
        difficulty: "Intermediate",
        persona: "Founder",
        challenge: "User settings in Supabase are often stored in a single JSONB column, making it hard to count how many users have 'dark_mode' enabled.",
        solution: "The founder types: 'Show me the percentage of active users using dark mode.' Arcli's semantic engine recognizes the JSONB schema.",
        outcome: "Arcli generates the exact Postgres dialect (e.g., `preferences->>'theme' = 'dark'`) and returns a perfect pie chart.",
        technicalEdge: "Dialect Precision. Arcli doesn't write generic SQL; it writes highly optimized Postgres JSONB operators."
      },
      {
        title: "Cross-Table Cohort Retention",
        difficulty: "Strategic",
        persona: "CEO",
        challenge: "Calculating Month-1 to Month-3 retention requires complex self-joins across 'users' and 'events' tables.",
        solution: "Arcli grounds the AI in the schema headers for both tables. The AI writes a multi-stage CTE to track user drop-off dynamically.",
        outcome: "A visual cohort retention matrix is generated instantly, highlighting exactly when users churn.",
        technicalEdge: "The heavy computation is pushed down to the Postgres server; Arcli only pulls back the final 10x10 matrix payload."
      },
      {
        title: "Edge Telemetry Consolidation",
        difficulty: "Advanced",
        persona: "Data Engineer",
        challenge: "Web traffic lives in a Cloudflare Worker, but conversion data lives in Vercel Postgres.",
        solution: "Arcli's SyncEngine ingests the Cloudflare edge telemetry into managed DuckDB Parquet files, while querying Vercel Postgres directly.",
        outcome: "Founders can JOIN their top-of-funnel pageviews with backend conversions in a single conversational prompt.",
        technicalEdge: "Hybrid Compute. Arcli federates the query, merging DuckDB edge data with Postgres backend data in memory."
      }
    ],
    faqs: [
      { question: "Will Arcli slow down my production database?", answer: "No. We strongly recommend connecting Arcli to your Supabase or Postgres read-replica. Furthermore, our Push-Down Compute architecture offloads heavy analytical processing so we only pull back tiny, aggregated payloads.", targetPersona: "Data Engineer" },
      { question: "Do you store my database data on your servers?", answer: "No. Arcli operates a Zero-Copy architecture for Postgres. We store your structural metadata (schema names, column types) to train the AI, but the raw data stays on your Vercel or DigitalOcean infrastructure.", targetPersona: "CEO" },
      { question: "Can the AI accidentally delete a table?", answer: "Impossible. First, we mandate read-only database user credentials. Second, our Semantic Compiler is physically sandboxed with a Zero-Mutation Guarantee, meaning it cannot parse or execute DROP, DELETE, or UPDATE commands.", targetPersona: "Founder" },
      { question: "How does the AI know my table names?", answer: "During the secure URI handshake, Arcli performs a lightweight introspection query (e.g., reading information_schema). This grounds the LLM, preventing hallucinations.", targetPersona: "Data Engineer" },
      { question: "What if my database is behind a VPC?", answer: "Arcli provides static IP addresses for our SyncEngine, allowing you to easily whitelist our traffic in your DigitalOcean or AWS security groups.", targetPersona: "Data Engineer" },
      { question: "Does Arcli understand custom Postgres extensions like PostGIS?", answer: "Yes. Because we push the query down to your database, any native Postgres extension installed on your server can be utilized by the AI's generated SQL.", targetPersona: "Data Engineer" },
      { question: "How much does it cost?", answer: "We offer a transparent, $19/mo flat-rate tier. Executing standard queries costs fractions of a compute credit, ensuring predictable billing.", targetPersona: "CEO" },
      { question: "Do I need to write dbt models first?", answer: "No. Arcli's semantic engine acts as a dynamic modeling layer, transforming raw tables into analytical answers on the fly without rigid dbt boilerplate.", targetPersona: "Founder" }
    ]
  },

  // =========================================================================================
  // PAGE 2: SAAS INTEGRATIONS (Focus: Stripe / Shopify / Extraction Lifecycle)
  // =========================================================================================
  {
    slug: "stripe-zero-etl-analytics",
    pageType: "saas",
    meta: {
      title: "Zero-ETL Stripe & Shopify Analytics | Arcli",
      description: "Bypass native dashboard limits. Arcli pulls your Stripe and Shopify data directly into an AI-powered DuckDB engine for instant MRR, Churn, and custom metrics.",
    },
    hero: {
      badge: "SaaS Integrations",
      headline: "Escape the Limits of Native SaaS Dashboards.",
      subheadline: "Stripe and Shopify dashboards are great, until you need to ask a custom question. Arcli extracts your SaaS data via APIs into a blazing-fast, managed DuckDB instance, giving you total analytical freedom.",
      primaryCta: "Connect Stripe",
    },
    roiMetrics: [
      { metric: "60s", label: "Time to Instant Dashboard", context: "Arcli auto-seeds 'Starter Pack' dashboards for MRR and Churn the moment you connect." },
      { metric: "100M+", label: "Rows Queried in ms", context: "Extracted data is stored in memory-mapped Parquet files powered by Polars." },
      { metric: "Zero", label: "API Rate Limit Errors", context: "Our async SyncEngine chunking prevents SaaS API timeouts." }
    ],
    // Category-Specific UI: Extraction Lifecycle & Bypassing Limits
    extractionLifecycle: [
      { phase: "Phase 1: Secure OAuth / API Key", title: "Restricted Access", description: "You provide a restricted, read-only Stripe API key. Vault encrypts it." },
      { phase: "Phase 2: Async Historical Sync", title: "Memory-Safe Polling", description: "Our SyncEngine uses C++ optimized Polars DataFrames to pull years of Stripe history without RAM exhaustion." },
      { phase: "Phase 3: Real-Time Webhooks", title: "Edge Ingestion", description: "Cloudflare Workers catch live Stripe webhooks, instantly updating your Parquet storage layer." },
      { phase: "Phase 4: Instant Dashboarding", title: "Zero-Prompt Value", description: "Arcli bypasses the chat box and immediately renders your MRR and Churn dashboards." }
    ],
    bypassingNativeLimits: [
      { limit: "Stripe: Can't JOIN with Marketing Spend", arcliBypass: "Arcli JOINs your Stripe revenue with Meta/Google Ads data to calculate True ROAS." },
      { limit: "Shopify: Rigid Cohort Timeframes", arcliBypass: "Use natural language to define completely custom cohort windows (e.g., 'Black Friday buyers vs Summer buyers')." }
    ],
    analyticalScenarios: [
      {
        title: "The 'Starter Pack' Dashboard",
        difficulty: "Basic",
        persona: "Solo Founder",
        challenge: "Founders want Baremetrics-style dashboards without paying Baremetrics prices.",
        solution: "Upon connecting Stripe, Arcli automatically runs 5 pre-generated DuckDB SQL views in the background.",
        outcome: "An instant, beautiful dashboard populates with MRR, DAU, Signups, and Churn Rate.",
        technicalEdge: "These queries are cached and cost 0.0 compute credits, protecting Arcli's LLM margins while delivering immense value."
      },
      {
        title: "True ROAS (Return on Ad Spend)",
        difficulty: "Strategic",
        persona: "Growth Marketer",
        challenge: "Ad platforms claim high ROI, but bank accounts disagree. Unifying Stripe cash with Meta Ad spend is tedious.",
        solution: "Arcli's SyncEngine detects both integrations and automatically seeds a 'Golden Metric' FULL OUTER JOIN.",
        outcome: "The founder gets an un-gamable, daily 'True Cash ROAS' metric combining actual Stripe receipts against Meta invoices.",
        technicalEdge: "Cross-platform data unification without writing a single Fivetran pipeline."
      },
      {
        title: "Dispute & Refund Anomaly Detection",
        difficulty: "Advanced",
        persona: "CEO",
        challenge: "A sudden spike in Stripe chargebacks can cripple a business, but native alerts are often too slow.",
        solution: "Arcli's Watchdog Service runs linear algebra (Z-scores) over the synced Stripe Parquet files daily.",
        outcome: "If refunds spike 3σ above the 30-day moving average, the AI sends an emergency narrative summary to the CEO.",
        technicalEdge: "Mathematical precision ensures sensitivity to seasonality, preventing alert fatigue."
      }
    ],
    faqs: [
      { question: "Why extract Stripe data if you do 'Zero-ETL' for databases?", answer: "SaaS APIs (like Stripe) have strict rate limits that prevent fast, ad-hoc queries. By extracting it into Arcli's managed DuckDB Parquet storage, we bypass Stripe's API limits, giving you sub-second query speeds.", targetPersona: "Data Engineer" },
      { question: "How real-time is the SaaS data?", answer: "Near real-time. We combine an initial historical sync with an edge-deployed Cloudflare Webhook catcher. When a Stripe charge succeeds, the webhook updates your dashboard instantly.", targetPersona: "Founder" },
      { question: "Can I join Stripe data with my custom Postgres database?", answer: "Yes! This is Arcli's superpower. You can ask a question that JOINs your Stripe subscription data with your Supabase custom user table in a single prompt.", targetPersona: "CEO" },
      { question: "Do you pull PII like credit card numbers?", answer: "No. Our DataSanitizer explicitly hashes or drops sensitive PII (like emails) before it ever touches our storage layer, operating strictly under PCI-compliant boundaries.", targetPersona: "Data Engineer" },
      { question: "What happens if the Stripe API goes down?", answer: "Your dashboards stay up. Because Arcli stores a mirrored Parquet state in DuckDB, you can continue analyzing historical data even if the SaaS provider experiences an outage.", targetPersona: "Founder" },
      { question: "How does Arcli handle pagination for massive Shopify stores?", answer: "Our SyncEngine uses asynchronous cursor pagination and Polars chunking to process millions of rows efficiently without causing out-of-memory (OOM) errors.", targetPersona: "Data Engineer" },
      { question: "Is this cheaper than Fivetran?", answer: "Significantly. Traditional ELT charges you per-row extracted. Arcli uses a flat-rate billing model optimized for indie hackers, regardless of your Shopify volume.", targetPersona: "CEO" },
      { question: "Can I share my Stripe MRR publicly?", answer: "Yes. Our 'Open Startup' feature allows you to 1-click share a read-only, branded version of your MRR chart to Twitter/X.", targetPersona: "Founder" }
    ]
  },

  // =========================================================================================
  // PAGE 3: COMPETITOR COMPARISONS (Focus: The Evolutionary Complement)
  // =========================================================================================
  {
    slug: "arcli-vs-traditional-bi",
    pageType: "comparison",
    meta: {
      title: "Arcli vs. Traditional BI (Tableau, Looker, Baremetrics) | DataFast",
      description: "See why modern startup founders are evolving past rigid BI tools. Arcli complements your stack with Conversational AI and Zero-ETL speed.",
    },
    hero: {
      badge: "The Evolutionary Complement",
      headline: "Beyond Rigid Dashboards.",
      subheadline: "Traditional BI tools like Looker and Tableau are powerful, but they require a data engineering team to maintain. Arcli is the lightweight, AI-driven complement that answers the ad-hoc 'why' behind the numbers in seconds.",
      primaryCta: "Start Free Trial",
    },
    roiMetrics: [
      { metric: "$0", label: "Implementation Cost", context: "No external consultants needed. Connect your database and start asking questions." },
      { metric: "100x", label: "Faster Ad-Hoc Answers", context: "Skip the IT ticket backlog. Ask the AI directly." },
      { metric: "Infinite", label: "Dashboard Flexibility", context: "Stop rebuilding static charts. Generate new views via natural language." }
    ],
    // Category-Specific UI: Enterprise Evaluation Matrix & Synergy Scenarios
    enterpriseEvaluationMatrix: [
      { dimension: "Setup Time", legacyBI: "Weeks (Requires data warehousing and dbt models).", arcliEvolution: "60 Seconds (Direct read-replica and SaaS API connections)." },
      { dimension: "User Interface", legacyBI: "Drag-and-drop builders requiring SQL knowledge.", arcliEvolution: "Natural language chat with semantic reasoning." },
      { dimension: "Target Audience", legacyBI: "Dedicated Data Analysts and Engineers.", arcliEvolution: "CEOs, Founders, and Growth Marketers." }
    ],
    synergyScenarios: [
      { tool: "Tableau / Looker", synergy: "Use Tableau for board-level static reporting, and use Arcli for daily, ad-hoc conversational queries by the marketing team." },
      { tool: "Baremetrics", synergy: "Use Baremetrics for standard Stripe metrics, and use Arcli when you need to JOIN that revenue data with your custom product database." }
    ],
    analyticalScenarios: [
      {
        title: "Bypassing the IT Ticket Backlog",
        difficulty: "Basic",
        persona: "Growth Marketer",
        challenge: "The marketing team needs to know the LTV of users from a specific campaign, but the data team's Jira backlog is 2 weeks long.",
        solution: "The marketer logs into Arcli and asks, 'What is the lifetime value of users acquired via the Summer2024 campaign?'",
        outcome: "Arcli's Semantic RAG generates the SQL, executes the push-down query, and delivers the chart instantly.",
        technicalEdge: "Empowers non-technical users while maintaining strict, read-only security over the production database."
      },
      {
        title: "Contextual RAG vs. AI Hallucinations",
        difficulty: "Intermediate",
        persona: "Data Engineer",
        challenge: "Generic LLMs (like ChatGPT) hallucinate column names when asked to write SQL, making them useless for production data.",
        solution: "Arcli uses Semantic Routing. We only feed the LLM the specific schema headers relevant to the user's question, completely eliminating token bloat.",
        outcome: "The generated SQL is 100% dialect-accurate and executes flawlessly on the first try.",
        technicalEdge: "Arcli doesn't just use AI; it uses 'Grounded AI' restricted by architectural constraints."
      },
      {
        title: "The Indie Hacker Stack Unification",
        difficulty: "Strategic",
        persona: "Solo Founder",
        challenge: "Founders can't afford to buy PostHog for tracking, Baremetrics for revenue, and Snowflake for warehousing.",
        solution: "Arcli consolidates the stack. The founder uses our JS Snippet for tracking, our Stripe integration for revenue, and our DuckDB engine for warehousing.",
        outcome: "A single, unified Analytics OS for $19/mo.",
        technicalEdge: "Leverages Cloudflare Edge and local DuckDB compute to keep Arcli's operational margins highly profitable."
      }
    ],
    faqs: [
      { question: "Is Arcli trying to replace Tableau or Looker?", answer: "No. Arcli is an evolutionary complement. Giant enterprises need Tableau for highly governed, static reporting. Fast-moving startups use Arcli for conversational, ad-hoc discovery.", targetPersona: "CEO" },
      { question: "How do you prevent the AI from generating inefficient SQL?", answer: "Our query planner optimizes the LLM's output. Furthermore, by utilizing DuckDB and columnar Parquet formats, even sub-optimal queries execute in milliseconds.", targetPersona: "Data Engineer" },
      { question: "Why is Arcli better than just using ChatGPT Advanced Data Analysis?", answer: "ChatGPT requires you to manually export, clean, and upload CSVs every time you want an answer. Arcli connects directly to your live production infrastructure securely via Vault.", targetPersona: "Founder" },
      { question: "What happens if the AI misunderstands my question?", answer: "Arcli provides full transparency. Below every chart, there is a 'View Math Logic' toggle that shows exactly what DuckDB SQL was generated, allowing engineers to verify the logic.", targetPersona: "Data Engineer" },
      { question: "How does Arcli handle complex business logic?", answer: "You can define 'Semantic Metrics' in the platform. If you have a specific definition for 'Active User', you define it once, and the AI will reference that definition for all future questions.", targetPersona: "Founder" },
      { question: "Are my chat queries used to train your AI?", answer: "Never. Your metadata and queries are strictly isolated per-tenant. We do not use your proprietary business logic to train foundational LLMs.", targetPersona: "CEO" },
      { question: "Can I embed Arcli charts into my own app?", answer: "Currently, we support 'Public Read-Only Dashboards' via secure URL sharing. Full iFrame embedding for customer-facing analytics is on our roadmap.", targetPersona: "Founder" },
      { question: "Why flat-rate pricing?", answer: "Startups hate variable consumption billing (like Snowflake's credit system) because it causes 'bill shock'. We use flat-rate pricing to give solo founders peace of mind.", targetPersona: "CEO" }
    ]
  }
];