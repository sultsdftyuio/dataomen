// lib/seo/saas-integrations-1.tsx
import React from 'react';
import { Cloud, ShoppingCart } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Application Intelligence Blueprint" schema. 
 * Designed for RevOps, E-commerce, and Growth leaders who are bottlenecked 
 * by native SaaS reporting UIs. Focuses on API data extraction, domain-specific 
 * data handling (custom fields, nested JSON), and conversational acceleration.
 */
export type SEOPageData = {
  type: 'integration';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  dataExtractionArchitecture: {
    connectionProtocol: string;
    schemaMapping: string;
    syncFrequency: string;
  };
  domainSpecificCapabilities: {
    handlingQuirks: string[];
    aiAdvantage: string;
  };
  nativeUiBypass: {
    legacyLimitations: string[];
    arcliAcceleration: string[];
  };
  steps: { name: string; text: string }[];
  realExample?: {
    query: string;
    sql: string;
    output: string;
    insight: string;
  };
  useCases: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  relatedSlugs: string[];
};

export const saasIntegrationsPart1: Record<string, SEOPageData> = {
  'analyze-salesforce-data': {
    type: 'integration',
    title: 'Analyze Salesforce Data with AI | Arcli Analytics',
    description: 'Connect Salesforce to Arcli. Bypass rigid native reports and use generative AI to track pipeline velocity, custom objects, and rep performance instantly.',
    h1: 'Conversational Intelligence for Salesforce',
    subtitle: 'Stop wrestling with rigid Salesforce Report builders and SOQL limitations. Ask complex questions about your pipeline in plain English to unlock instant architectural visibility.',
    icon: <Cloud className="w-12 h-12 text-sky-500 mb-6" />,
    features: [
      'Vectorized Pipeline Velocity Tracking', 
      'Dynamic Cross-Object Joins via RAG', 
      'Automated Custom Field Detection',
      'Sub-Second In-Browser Charting'
    ],
    dataExtractionArchitecture: {
      connectionProtocol: 'Secure, read-only integration via Salesforce OAuth 2.0 or direct synchronization through your existing data warehouse.',
      schemaMapping: 'Automated extraction of Salesforce Metadata APIs to index both standard objects (Accounts, Opportunities) and custom schemas.',
      syncFrequency: 'Supports real-time API querying or high-frequency batch syncing to ensure pipeline data is never stale.'
    },
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Native recognition and mapping of custom fields (e.g., `industry__c`).',
        'Translates natural language into complex relational joins, bypassing SOQL\'s rigid parent-to-child query limitations.',
        'Flawlessly handles polymorphic relationships within the Salesforce schema.'
      ],
      aiAdvantage: 'Arcli’s semantic router embeds your unique Salesforce terminology (like specific deal stages or custom object names) into the AI context, ensuring it speaks your exact revenue language.'
    },
    nativeUiBypass: {
      legacyLimitations: [
        'Native Salesforce report builders require clicking through 5+ menus just to group by a secondary dimension.',
        'Building cross-object relationships (Report Types) requires specialized Salesforce Admin intervention.',
        'Exporting data to Excel to merge CRM metrics with external quota sheets breaks version control.'
      ],
      arcliAcceleration: [
        'Generates complex, multi-object analytical logic instantly via conversational prompts.',
        'Leverages underlying standard SQL for unlimited analytical flexibility (CTEs, Window Functions) that SOQL cannot support.',
        'Seamlessly joins Salesforce pipeline data with external billing or marketing databases in a single workspace.'
      ]
    },
    steps: [
      { name: '1. Secure Authentication', text: 'Authorize Arcli using enterprise-grade Salesforce OAuth protocols with strictly scoped, read-only access.' },
      { name: '2. Metadata Ingestion', text: 'Our Semantic Router automatically scans and indexes your complex schema, including all Custom Objects.' },
      { name: '3. Conversational Discovery', text: 'Ask "What is our win rate for Enterprise deals, grouped by lead source?" to execute pristine analytics.' }
    ],
    realExample: {
      query: "Show me the average sales cycle length (in days) for closed-won opportunities this year, grouped by the Account's Industry custom field.",
      sql: `SELECT 
  a.industry__c AS account_industry,
  AVG(DATE_PART('day', o.close_date::timestamp - o.created_date::timestamp)) AS avg_cycle_days,
  COUNT(o.id) AS total_won_deals
FROM salesforce_opportunities o
JOIN salesforce_accounts a ON o.account_id = a.id
WHERE o.is_won = TRUE 
  AND o.close_date >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY 1
HAVING COUNT(o.id) > 5
ORDER BY 2 DESC;`,
      output: "Horizontal Bar Chart with Average Line Overlay",
      insight: "Healthcare deals require an average of 142 days to close, nearly double the velocity of the SaaS vertical (74 days)."
    },
    useCases: [
      { title: 'Sales Leadership Briefings', description: 'Generate automated weekly pipeline health dashboards for the CRO via secure RAG routing, eliminating the RevOps report-building queue.' },
      { title: 'Rep Performance Coaching', description: 'Instantly isolate specific Account Executives to review their win/loss ratios against specific competitors tracked in custom fields.' }
    ],
    faqs: [
      { q: 'Can Arcli read my custom Salesforce objects and fields?', a: 'Yes. Upon connection, Arcli maps your entire metadata structure. Custom objects and fields (ending in `__c`) are embedded into our semantic router so the AI natively understands your unique business terminology.' },
      { q: 'Does this write back to Salesforce or alter my data?', a: 'No. Arcli operates on a strict Read-Only analytical basis. We extract the data for high-speed querying and charting, guaranteeing your underlying CRM records are never modified or deleted.' }
    ],
    relatedSlugs: ['sales-dashboard-template', 'natural-language-to-sql']
  },

  'analyze-shopify-data': {
    type: 'integration',
    title: 'Analyze Shopify E-Commerce Data with AI | Arcli',
    description: 'Turn massive Shopify store data into actionable insights. Evaluate how Arcli automatically unpacks nested JSON to calculate true margins and LTV.',
    h1: 'Generative Intelligence for Shopify Stores',
    subtitle: 'Move beyond basic gross revenue dashboards. Let our high-performance compute engine unpack nested JSON payloads to calculate exact SKU profitability and cohort LTV.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-500 mb-6" />,
    features: [
      'Predictive Inventory Forecasting', 
      'Vectorized Cohort LTV Tracking', 
      'True Net Margin & COGS Calculation',
      'Discount Code ROI Attribution'
    ],
    dataExtractionArchitecture: {
      connectionProtocol: 'Secure integration via the Shopify Admin REST/GraphQL APIs or through seamless data warehouse synchronization.',
      schemaMapping: 'Automated flattening of complex, deeply nested JSON order payloads into highly optimized columnar data structures.',
      syncFrequency: 'Supports webhook-driven event streaming or scheduled batch ingestion to ensure financial metrics are always current.'
    },
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Natively extracts and aggregates deeply nested JSON arrays (e.g., `line_items`, `discount_allocations`, `tax_lines`).',
        'Automates the complex SQL logic required to calculate accurate Customer Lifetime Value (LTV) across monthly cohorts.',
        'Facilitates explicit Cost of Goods Sold (COGS) mapping to calculate exact net profitability.'
      ],
      aiAdvantage: 'The AI is specifically trained on E-commerce relational models, allowing it to accurately attribute proportional discounts and shipping costs down to the individual SKU level.'
    },
    nativeUiBypass: {
      legacyLimitations: [
        'Native Shopify dashboards over-index on Gross Revenue, providing a dangerous and false sense of profitability by ignoring variable COGS.',
        'Calculating LTV or repurchase rates across specific customer segments is notoriously difficult in the native UI.',
        'Inventory reorder forecasting is largely manual, relying on historical Excel exports.'
      ],
      arcliAcceleration: [
        'Generates mathematically precise Net Margin and COGS reporting instantly via natural language.',
        'Allows for cross-platform data blending (e.g., joining Shopify revenue with Meta Ads spend) to calculate true Blended CAC.',
        'Provides fully interactive React-Vega charting built dynamically via conversational intent.'
      ]
    },
    steps: [
      { name: '1. API Authorization', text: 'Connect your Shopify store via our secure integration portal using least-privilege, read-only access scopes.' },
      { name: '2. Payload Normalization', text: 'Arcli automatically cleans and flattens nested JSON payloads into optimized analytical tables.' },
      { name: '3. Conversational Extraction', text: 'Ask "Which product bundle had the highest net margin during the Black Friday sale?" for instant visualization.' }
    ],
    realExample: {
      query: "Calculate the total gross revenue, total discounts given, and net revenue specifically for the 'SUMMER2025' discount code.",
      sql: `WITH discount_orders AS (
  SELECT 
    order_id,
    total_price AS gross_revenue,
    total_discounts
  FROM shopify_orders
  WHERE discount_codes @> '[{"code": "SUMMER2025"}]'::jsonb
)
SELECT 
  COUNT(order_id) AS total_orders,
  SUM(gross_revenue) AS total_gross_revenue,
  SUM(total_discounts) AS total_discount_amount,
  SUM(gross_revenue - total_discounts) AS net_revenue
FROM discount_orders;`,
      output: "Financial KPI Scorecard",
      insight: "The SUMMER2025 campaign drove $45k in net revenue but gave away $12k in discounts, compressing overall margins by 18%."
    },
    useCases: [
      { title: 'Inventory Velocity Management', description: 'Deploy predictive analytics to determine exact reorder points based on historical SKU depletion rates and supplier lead times.' },
      { title: 'Merchandising Optimization', description: 'Identify which low-ticket "gateway" items reliably lead to the highest 12-month Customer Lifetime Value.' }
    ],
    faqs: [
      { q: 'Will connecting Arcli slow down my store\'s front-end?', a: 'Not at all. Arcli syncs data asynchronously via the Shopify Admin API. It operates entirely in the background with zero impact on your customer checkout experience or page load speeds.' },
      { q: 'How does it handle massive stores with millions of historical orders?', a: 'Arcli utilizes heavily optimized columnar data structures (Parquet) and streams aggregated results into an in-browser WebAssembly engine (DuckDB). This allows for zero-latency cross-filtering on massive transactional datasets.' }
    ],
    relatedSlugs: ['ecommerce-dashboard-template', 'google-analytics-ai-dashboard']
  }
};