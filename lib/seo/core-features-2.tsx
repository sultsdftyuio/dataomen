import React from 'react';
import { FileText, FileSpreadsheet, LayoutTemplate } from 'lucide-react';

/**
 * CoreFeatures Schema - V13 SYSTEM ARCHITECTURE
 * Enforces scannability, pain-centric messaging, competitive positioning, and high-value SEO hooks.
 * Upgraded with: Search Intent Routing, SERP Realism, Information Gain, UI Blocks, Conversion Engine, and Structured Data.
 */
export type SEOPageData = {
  type: 'feature';
  title: string;
  description: string;
  metaKeywords: string[];
  searchIntent: {
    primary: string;
    secondary: string[];
    queryPriority: 'Tier 1' | 'Tier 2' | 'Tier 3';
    queryClass: ('Informational' | 'Commercial investigation' | 'Comparison' | 'How-to')[];
  };
  serpRealism: {
    targetPosition: string;
    competitionDifficulty: 'High' | 'Medium' | 'Low';
    domainAdvantage: string;
  };
  informationGain: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  idealFor: string[];
  
  // V13 CONVERSION ENGINE
  conversionCTA: {
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
  };

  businessValueMetrics: {
    label: string;
    value: string;
    description: string;
  }[];
  capabilities: {
    name: string; // Pain-Centric
    depthLevel: 'Surface' | 'Intermediate' | 'Deep';
    benefit: string;
    executiveExplanation: string;
  }[];
  competitiveAdvantage: {
    legacyTool: string;
    limitation: string;
    arcliAdvantage: string;
  }[];
  trustAndSecurity: {
    principle: string; // Engineered, sharp
    howWeDeliver: string;
  }[];
  onboardingExperience: {
    phase: string;
    userAction: string;
    outcome: string;
  }[];
  analyticalScenarios: {
    title: string;
    complexity: 'Basic' | 'Advanced';
    businessQuestion: string;
    businessOutcome: string;
    sqlSnippet?: string;
  }[];
  seoExamples: {
    keyword: string;
    description: string;
  }[];
  uiBlocks: {
    visualizationType: 'ComparisonTable' | 'MetricsChart' | 'ProcessStepper' | 'AnalyticsDashboard' | 'DataRelationshipsGraph';
    dataMapping: string;
    interactionPurpose: string;
    intentServed: string;
  }[];
  
  // V13 STRUCTURED DATA
  faqs: { q: string; a: string; intent: string; schemaEnabled: boolean }[];
  
  // V13 INTERNAL LINKING ENGINE
  relatedSlugs: { label: string; slug: string; intent: 'Parent' | 'Supporting' | 'Conversion' }[];
};

export const coreFeaturesPart2: Record<string, SEOPageData> = {
  'ai-narrative-insights': {
    type: 'feature',
    title: 'Automated Executive Reporting & AI Summaries | Arcli',
    description: 'Stop wasting hours writing weekly performance updates. Arcli automatically translates complex data into plain-English executive summaries in seconds.',
    metaKeywords: [
      'Automated Executive Reporting', 
      'Data Storytelling', 
      'AI BI Summaries', 
      'Automated Board Reports', 
      'Root Cause Analysis AI'
    ],
    searchIntent: {
      primary: 'Automate executive data reporting and summaries with AI',
      secondary: ['AI data storytelling', 'automated root cause analysis', 'Slack automated reporting'],
      queryPriority: 'Tier 2',
      queryClass: ['Commercial investigation', 'Informational']
    },
    serpRealism: {
      targetPosition: 'Top 3 for "Automated Executive Reporting AI"',
      competitionDifficulty: 'Medium',
      domainAdvantage: 'Moving beyond generic LLM summaries by strictly mapping narratives to mathematically verifiable database queries (no hallucinated insights).'
    },
    informationGain: 'Proving that data storytelling shouldn\'t just summarize *what* happened, but must autonomously calculate variance to identify *root causes* across dimensions without human intervention.',
    h1: 'Stop Wasting Mondays Writing Reports',
    subtitle: 'Arcli replaces manual reporting by automatically translating your data into plain-English executive summaries that your entire team can understand and act upon instantly.',
    icon: <FileText className="w-12 h-12 text-emerald-500 mb-6" />,
    idealFor: ['Sales Managers', 'VP of Operations', 'Chief of Staff'],
    
    conversionCTA: {
      primaryLabel: 'Automate Your Reporting',
      primaryHref: '/register?intent=reporting_automation',
      secondaryLabel: 'See Example Narratives'
    },

    uiBlocks: [
      {
        visualizationType: 'ComparisonTable',
        dataMapping: 'competitiveAdvantage',
        interactionPurpose: 'Contrast the painful manual Word/PPT process against the instant Arcli generation.',
        intentServed: 'Workflow friction realization for Operations Managers.'
      },
      {
        visualizationType: 'ProcessStepper',
        dataMapping: 'onboardingExperience',
        interactionPurpose: 'Show the automated flow from Dashboard Analysis -> Draft -> Slack Delivery.',
        intentServed: 'Demonstrate operational automation.'
      }
    ],
    businessValueMetrics: [
      { label: 'Reporting Overhead', value: 'Eliminated', description: 'Reduces the hours spent manually drafting "Weekly Performance Updates" down to zero.' },
      { label: 'Cross-Team Alignment', value: '100%', description: 'Ensures non-analytical team members immediately understand exactly why a metric moved.' },
      { label: 'Actionable Clarity', value: 'Instant', description: 'Moves the conversation from "What happened?" directly to "What should we do about it?"' }
    ],
    capabilities: [
      { 
        name: 'Automate the Weekly Update', 
        depthLevel: 'Surface',
        benefit: 'Clear communication without the manual effort.', 
        executiveExplanation: 'The platform reviews your live charts and generates a concise, boardroom-ready paragraph explaining the most important takeaways and overall trajectory. Perfect for copying directly into Slack.' 
      },
      { 
        name: 'Instant Root Cause Analysis', 
        depthLevel: 'Deep',
        benefit: 'Stop guessing why numbers dropped.', 
        executiveExplanation: 'If top-line revenue dips, the system dynamically analyzes underlying segments to tell you exactly which region, product line, or sales rep caused it. Pair this with predictive models for complete visibility.' 
      },
      { 
        name: 'Dynamic Audience Translation', 
        depthLevel: 'Intermediate',
        benefit: 'Tailored messaging for different stakeholders.', 
        executiveExplanation: 'Generate a highly technical summary of a server log for engineering, and instantly rewrite that exact same data point into a financial impact summary for the CFO.' 
      }
    ],
    competitiveAdvantage: [
      {
        legacyTool: 'Manual Reporting (Word / PPT / Email)',
        limitation: 'Managers spend hours every week downloading CSVs, creating charts, and typing out subjective summaries of what happened.',
        arcliAdvantage: 'Reports are generated instantly based on mathematically verified data, removing human error and freeing up your leadership’s time.'
      }
    ],
    trustAndSecurity: [
      { 
        principle: 'Deterministic Narrative Engine (No Fabricated Numbers)', 
        howWeDeliver: 'Our engine is architecturally blocked from "hallucinating." It operates purely as a translation layer, reading the hard math returned by your database and converting it to text.' 
      },
      { 
        principle: 'Verifiable Source-Linking', 
        howWeDeliver: 'Every metric mentioned in a written summary acts as a hyperlink. Clicking the number instantly reveals the underlying data table and SQL logic used to generate it.' 
      }
    ],
    onboardingExperience: [
      { phase: 'Analyze', userAction: 'View any dashboard or chart in your workspace.', outcome: 'The system monitors the data for statistical significance.' },
      { phase: 'Draft', userAction: 'Click "Generate Executive Summary".', outcome: 'Within seconds, a clear, three-bullet brief is drafted.' },
      { phase: 'Distribute', userAction: 'Automatically schedule delivery.', outcome: 'Leadership receives the automated briefing in Slack every Monday.' }
    ],
    analyticalScenarios: [
      {
        title: 'Weekly Sales Performance Briefing',
        complexity: 'Basic',
        businessQuestion: 'Summarize our closed-won revenue for this week compared to last week.',
        businessOutcome: 'Replaces the manual Monday morning routine. The system autonomously writes: "Revenue increased 12% to $145k, primarily driven by a surge in Enterprise renewals in EMEA."',
        sqlSnippet: `SELECT region, SUM(amount) AS revenue FROM opportunities WHERE status = 'Closed Won' AND close_date >= CURRENT_DATE - 7 GROUP BY 1 ORDER BY 2 DESC;`
      },
      {
        title: 'Churn Anomaly Root Cause',
        complexity: 'Advanced',
        businessQuestion: 'Explain the sudden spike in user cancellations yesterday.',
        businessOutcome: 'Rather than simply reporting the spike, the narrative isolates the variable: "Cancellations spiked 40%. 85% of these originated from Legacy Basic Tier users who experienced the billing migration error."',
      }
    ],
    seoExamples: [
      { keyword: 'Automated executive summary template', description: 'See how Arcli automatically generates perfect executive summaries from raw data.' },
      { keyword: 'Root cause analysis automated', description: 'Automatically drill down into the "why" behind data anomalies without writing complex grouping SQL.' }
    ],
    faqs: [
      { q: 'Will the AI miss small but important details?', a: 'The narrative engine is programmatically tuned using statistical variance thresholds. It inherently ignores background noise and focuses exclusively on the mathematical outliers that actually impact your business.', intent: 'Accuracy/Trust', schemaEnabled: true },
      { q: 'Is our data fed into a public LLM to write these stories?', a: 'No. We utilize secure, private inference architectures. Your data is processed entirely within an isolated environment and never trains external models.', intent: 'Data Privacy', schemaEnabled: true }
    ],
    relatedSlugs: [
      { label: 'Conversational BI Architecture', slug: '/use-cases/conversational-bi', intent: 'Parent' },
      { label: 'Automated Anomaly Detection', slug: '/seo/ai-agents-anomaly-detection', intent: 'Supporting' },
      { label: 'Start Free Trial', slug: '/register', intent: 'Conversion' }
    ]
  },

  'ai-excel-analysis': {
    type: 'feature',
    title: 'Analyze Large CSV & Excel Files with AI | Arcli',
    description: 'Excel breaks at 1 million rows. Arcli doesn\'t. Upload massive CSV files and join them instantly using conversational AI—entirely within your browser.',
    metaKeywords: [
      'Excel Alternative', 
      'Analyze Large CSV', 
      'Join CSV files without SQL', 
      'Excel Row Limit Workaround', 
      'Big Data Spreadsheet'
    ],
    searchIntent: {
      primary: 'Bypass Excel row limits and analyze massive CSV files with AI',
      secondary: ['AI for large CSV files', 'Excel alternatives for big data', 'Browser based data analysis'],
      queryPriority: 'Tier 1',
      queryClass: ['How-to', 'Informational', 'Commercial investigation']
    },
    serpRealism: {
      targetPosition: 'Top 1-3 for "Excel row limit workaround" & "Analyze large CSV files"',
      competitionDifficulty: 'Medium',
      domainAdvantage: 'Leveraging local WebAssembly (WASM) execution to process 10M+ rows instantly without the dreaded server upload latency of traditional cloud tools.'
    },
    informationGain: 'Highlighting the massive security and speed benefits of local browser-side WASM compute over legacy cloud-upload BI tools for analyzing massive flat files.',
    h1: 'Excel Breaks. This Doesn’t.',
    subtitle: 'Upload massive Excel or CSV files and analyze them without freezing your computer. No complex VLOOKUPs, no broken macros—just plain English conversation.',
    icon: <FileSpreadsheet className="w-12 h-12 text-green-600 mb-6" />,
    idealFor: ['Data Analysts', 'RevOps Professionals', 'Performance Marketers'],
    
    conversionCTA: {
      primaryLabel: 'Analyze a File Now',
      primaryHref: '/files',
      secondaryLabel: 'Read the WASM Documentation'
    },

    uiBlocks: [
      {
        visualizationType: 'ProcessStepper',
        dataMapping: 'onboardingExperience',
        interactionPurpose: 'Illustrate the frictionless flow: Ingest -> Cross-Query -> Export, emphasizing no cloud upload wait times.',
        intentServed: 'Workflow speed validation for Data Analysts.'
      },
      {
        visualizationType: 'DataRelationshipsGraph',
        dataMapping: 'capabilities',
        interactionPurpose: 'Visualize how conversational prompts replace brittle VLOOKUPs to join multiple files securely.',
        intentServed: 'Educational clarity on non-SQL joins.'
      }
    ],
    businessValueMetrics: [
      { label: 'Data Processing Limit', value: '10M+ Rows', description: 'Analyze massive datasets that would instantly crash or freeze standard desktop spreadsheet software.' },
      { label: 'Data Cleansing Speed', value: 'Instant', description: 'Replaces brittle, easily-broken manual cell formulas with robust, auto-generated data logic.' },
      { label: 'Privacy & Security', value: 'Local-First', description: 'Your sensitive files are processed directly in your browser\'s memory; raw row data never rests on our servers.' }
    ],
    capabilities: [
      { 
        name: 'Bypass the 1M Row Limit', 
        depthLevel: 'Surface',
        benefit: 'Enterprise speed without enterprise infrastructure.', 
        executiveExplanation: 'We utilize a specialized WebAssembly (WASM) analytical engine (DuckDB) that runs entirely inside your web browser (no upload required). Filter and aggregate multi-gigabyte files with zero latency.' 
      },
      { 
        name: 'Conversational File Joins', 
        depthLevel: 'Deep',
        benefit: 'Connect disparate data silos instantly.', 
        executiveExplanation: 'Need to compare a "Marketing Spend" CSV with your "Internal Sales" Excel file? Upload both and tell the platform to "Join them by Email." Say goodbye to #REF! and broken VLOOKUPs.' 
      },
      { 
        name: 'Instant Data Cleansing', 
        depthLevel: 'Intermediate',
        benefit: 'Ensures your numbers are actually reliable.', 
        executiveExplanation: 'The platform autonomously identifies duplicate rows, standardizes broken date formats, and flags missing values before you run your analysis, saving hours of manual formatting.' 
      }
    ],
    competitiveAdvantage: [
      {
        legacyTool: 'Microsoft Excel / Google Sheets',
        limitation: 'Strict row limits (1M for Excel, less for Sheets). Heavy VLOOKUPs freeze the application, and files must be manually scrubbed.',
        arcliAdvantage: 'Handles 10M+ rows effortlessly. Joins and aggregations are handled via compiled browser-side SQL, not brittle cell references.'
      }
    ],
    trustAndSecurity: [
      { 
        principle: '100% Local Browser Processing (WASM)', 
        howWeDeliver: 'When you drop a file, it does not go to a central cloud server. It is loaded into a secure WebAssembly sandbox on your local machine. Raw row data never touches our servers.' 
      },
      { 
        principle: 'Ephemeral Memory State', 
        howWeDeliver: 'Once you close your browser tab, the uploaded file data is completely wiped from local memory. Total privacy for sensitive HR or financial files.' 
      }
    ],
    onboardingExperience: [
      { phase: 'Ingest', userAction: 'Drag and drop massive CSVs directly into the browser.', outcome: 'The local engine instantly indexes the data without waiting for network uploads.' },
      { phase: 'Cross-Query', userAction: 'Ask: "Which customers appear in both exports?"', outcome: 'The system authors the exact logic to merge the files perfectly.' },
      { phase: 'Export', userAction: 'Click "Download Cleaned Dataset".', outcome: 'The merged, filtered data is saved back to your computer.' }
    ],
    analyticalScenarios: [
      {
        title: 'Enterprise Inventory Reconciliation',
        complexity: 'Advanced',
        businessQuestion: 'Compare our physical Warehouse export with our Shopify digital export. Show me all items that Shopify says were sold, but are still in the warehouse file.',
        businessOutcome: 'Identifies mislabeled inventory and fulfillment errors immediately, protecting the company\'s bottom line and customer satisfaction.',
      }
    ],
    seoExamples: [
      { keyword: 'How to analyze large CSV files', description: 'Arcli uses browser-based DuckDB WASM to process gigabyte-scale CSVs without crashing.' },
      { keyword: 'Excel row limit workaround', description: 'Bypass the 1,048,576 row limit in Excel by querying your files conversationally.' },
      { keyword: 'Join multiple CSV files without SQL', description: 'Upload two CSVs and let Arcli\'s AI join them on common keys instantly.' }
    ],
    faqs: [
      { q: 'Does this replace Microsoft Excel entirely?', a: 'No. Excel is excellent for manual data entry. Arcli is built for Data Discovery at Scale. You use Excel to collect numbers, and Arcli to analyze them when they become too large.', intent: 'Product Scope', schemaEnabled: true },
      { q: 'What happens if my CSV file is larger than 1GB?', a: 'Because the platform runs a specialized columnar database locally inside your browser, it can seamlessly process multi-gigabyte files that would instantly crash traditional software.', intent: 'Technical Capability', schemaEnabled: true },
      { q: 'Are my highly confidential files uploaded to your servers?', a: 'No. The file processing happens purely on your local machine using WebAssembly. Only the column headers and your text prompt hit our AI—never the raw rows.', intent: 'Security', schemaEnabled: true }
    ],
    relatedSlugs: [
      { label: 'Secure Architecture', slug: '/security', intent: 'Parent' },
      { label: 'Shopify File Integration', slug: '/seo/templates-shopify-1', intent: 'Supporting' },
      { label: 'Upload a File Now', slug: '/files', intent: 'Conversion' }
    ]
  },

  'embedded-analytics-api': {
    type: 'feature',
    title: 'Embedded Analytics API & White-Label BI | Arcli',
    description: 'Turn your application’s data into a revenue-generating feature. Embed white-labeled conversational AI analytics directly into your SaaS in under 48 hours.',
    metaKeywords: [
      'Embedded Analytics', 
      'White Label BI', 
      'Customer Facing Analytics', 
      'SaaS Analytics API', 
      'Embeddable Dashboards'
    ],
    searchIntent: {
      primary: 'Embed AI analytics and white label BI into SaaS products',
      secondary: ['Customer facing analytics API', 'SaaS dashboard embedding', 'White label AI BI'],
      queryPriority: 'Tier 1',
      queryClass: ['Commercial investigation', 'Comparison']
    },
    serpRealism: {
      targetPosition: 'Top 3 for "Embedded AI Analytics API"',
      competitionDifficulty: 'High',
      domainAdvantage: 'Contrasting the extreme $50k+ cost and rigidity of legacy embedded BI (Looker/Sisense) against rapid, JWT-secured conversational drop-ins.'
    },
    informationGain: 'Shifting the paradigm of embedded BI from "giving users static charts" to "giving users a secure chat interface to query their own tenant data."',
    h1: 'Turn Your Data Into a Revenue Feature',
    subtitle: 'Stop wasting engineering sprints building custom dashboards for demanding clients. Drop Arcli’s secure, white-labeled AI directly into your SaaS and let your users query their own data.',
    icon: <LayoutTemplate className="w-12 h-12 text-indigo-500 mb-6" />,
    idealFor: ['SaaS Founders', 'Product Managers', 'CTOs'],
    
    conversionCTA: {
      primaryLabel: 'Get API Access',
      primaryHref: '/register?intent=embedded_api',
      secondaryLabel: 'Read Integration Docs'
    },

    uiBlocks: [
      {
        visualizationType: 'DataRelationshipsGraph',
        dataMapping: 'trustAndSecurity',
        interactionPurpose: 'Visualize the flow of Row-Level Security via JWT tokens to prove multi-tenant isolation.',
        intentServed: 'Security validation for CTOs and Principal Engineers.'
      },
      {
        visualizationType: 'AnalyticsDashboard',
        dataMapping: 'analyticalScenarios',
        interactionPurpose: 'Showcase what a white-labeled Arcli instance looks like natively injected into a fictional SaaS application.',
        intentServed: 'Visual conversion for Product Managers.'
      }
    ],
    businessValueMetrics: [
      { label: 'Engineering Bandwidth', value: 'Protected', description: 'Stops your developers from wasting time building one-off custom reporting features.' },
      { label: 'New Revenue Streams', value: 'Unlocked', description: 'Package conversational analytics as a premium add-on tier to increase your ARPU.' },
      { label: 'Integration Speed', value: '< 48 Hours', description: 'Drop a secure iframe or API snippet into your React/Vue frontend and go live immediately.' }
    ],
    capabilities: [
      { 
        name: 'Kill Custom Report Requests', 
        depthLevel: 'Surface',
        benefit: 'Empower users with self-serve answers.', 
        executiveExplanation: 'Instead of forcing customers to export static CSVs or submit support tickets, they can simply type "Show me my top performing campaigns this week" directly inside your application.' 
      },
      { 
        name: 'Unlock Premium Pricing Tiers', 
        depthLevel: 'Intermediate',
        benefit: 'Monetize your platform’s data exhaust.', 
        executiveExplanation: 'Use our embedded analytics as a gate for your Enterprise tier. Proving the ROI of your software visually directly reduces churn and increases contract value.' 
      },
      { 
        name: 'Seamless White-Labeling', 
        depthLevel: 'Deep',
        benefit: 'Matches your brand perfectly.', 
        executiveExplanation: 'Your customers will never know Arcli is powering the experience. The conversational UI seamlessly inherits your custom fonts, colors, and CSS variables.' 
      }
    ],
    competitiveAdvantage: [
      {
        legacyTool: 'Legacy Embedded BI (Sisense / Looker)',
        limitation: 'Costs $50k+ upfront, requires months of rigid data modeling, and only provides static, unchangeable dashboards to your users.',
        arcliAdvantage: 'Deploys in days, connects to your existing database, and gives your users the freedom to ask ad-hoc questions conversationally.'
      },
      {
        legacyTool: 'Building it In-House',
        limitation: 'Diverts your core engineering team for months to build charting libraries and maintain infrastructure.',
        arcliAdvantage: 'Zero maintenance overhead. Drop in a secure snippet and get world-class AI analytics instantly.'
      }
    ],
    trustAndSecurity: [
      { 
        principle: 'Strict Row-Level Security (RLS) Pass-Through', 
        howWeDeliver: 'Our embedding architecture relies on secure JSON Web Tokens (JWTs). When Customer A asks a question, the platform cryptographically locks the query to Customer A’s Tenant ID. Total isolation.' 
      },
      { 
        principle: 'No Duplicate Data Silos', 
        howWeDeliver: 'We query your existing multi-tenant database dynamically. You do not need to sync, copy, or maintain a secondary data warehouse just to serve customer-facing analytics.' 
      }
    ],
    onboardingExperience: [
      { phase: 'Configure', userAction: 'Define authorized metrics and styling in the Arcli Portal.', outcome: 'A custom-tailored environment is generated.' },
      { phase: 'Embed', userAction: 'Paste the provided snippet into your app, passing the active user’s Tenant ID.', outcome: 'The interface renders seamlessly within your layout.' },
      { phase: 'Monetize', userAction: 'Upsell the feature to your enterprise user base.', outcome: 'Immediate increase in platform ARPU and stickiness.' }
    ],
    analyticalScenarios: [
      {
        title: 'Premium ROI Reporting',
        complexity: 'Advanced',
        businessQuestion: 'A premium client asks your embedded platform: "Compare the conversion rate of Campaign A vs Campaign B over the last 90 days."',
        businessOutcome: 'Elevates your product from a standard software tool to a strategic partner. The client visually sees the ROI your platform is driving, heavily reducing churn.',
      }
    ],
    seoExamples: [
      { keyword: 'Embedded analytics React component', description: 'Easily drop Arcli’s conversational UI directly into your Next.js or React application.' },
      { keyword: 'White label BI tool for SaaS', description: 'Maintain complete brand control while offering enterprise-grade analytics.' }
    ],
    faqs: [
      { q: 'How does the system ensure a user only sees their own data?', a: 'We use cryptographically signed tokens. Your backend signs a token containing the user’s Tenant ID. Our engine injects that ID as a hard filter into every generated query.', intent: 'Security/Architecture', schemaEnabled: true },
      { q: 'Can we restrict the tables the end-user is allowed to query?', a: 'Absolutely. You explicitly define which tables and columns are exposed. Internal system logs or administrative tables remain completely hidden.', intent: 'Data Governance', schemaEnabled: true },
      { q: 'How is the embedded product priced?', a: 'Embedded analytics is priced on a predictable usage model rather than per-seat, ensuring you maintain strong profit margins as you scale to thousands of customers.', intent: 'Pricing', schemaEnabled: true },
      { q: 'Does the AI ever generate slow queries that impact our production database?', a: 'Our query planner enforces strict execution timeouts and mandatory indexed filtering. Heavy table scans are blocked before execution.', intent: 'Performance/Safety', schemaEnabled: true }
    ],
    relatedSlugs: [
      { label: 'Multi-Tenant Security Architecture', slug: '/seo/multi-tenant-analytics-security', intent: 'Parent' },
      { label: 'Compare ThoughtSpot vs Arcli', slug: '/comparisons/thoughtspot-vs-ai-analytics', intent: 'Supporting' },
      { label: 'Request an API Key', slug: '/register', intent: 'Conversion' }
    ]
  }
};