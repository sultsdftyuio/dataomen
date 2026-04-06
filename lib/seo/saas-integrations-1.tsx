import React from 'react';
import { Cloud, ShoppingCart } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Application Intelligence Blueprint" schema. 
 * Standardized keys (pipelinePhases, workflowUpgrade, competitiveAdvantage) 
 * to plug perfectly into the Omni-Renderer (page.tsx).
 */
export interface SEOPageData {
  type: 'integration';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  schemaMarkup?: 'FAQ' | 'HowTo' | 'Article';
  quickAnswer?: string;
  stepByStep?: string[];
  features: string[];
  
  // Interactive Demo Payload
  demoPipeline?: {
    userPrompt: string;
    aiInsight: string;
    generatedSql: string;
    chartMetric: string;
  };

  // Audience Segmentation
  targetPersonas?: {
    role: string;
    iconType: 'exec' | 'ops' | 'data';
    description: string;
    capabilities: string[];
  }[];

  // CTA Hierarchy
  ctaHierarchy?: {
    primary: { text: string; href: string };
    secondary: { text: string; href: string };
  };

  // Standardized to match Omni-Renderer
  pipelinePhases: {
    phase: string;
    description: string;
    outcome?: string;
  }[];
  
  domainSpecificCapabilities: {
    handlingQuirks: string[];
    aiAdvantage: string;
  };
  
  // Standardized to match Omni-Renderer
  workflowUpgrade: {
    legacyBottleneck: string[];
    arcliAutomation: string[];
  };
  
  // Standardized to match Omni-Renderer
  competitiveAdvantage?: {
    category: string;
    legacyTool: string;
    limitation: string;
    arcliAdvantage: string;
  }[];
  
  analyticalScenarios: {
    level: 'Basic' | 'Intermediate' | 'Advanced' | 'Strategic';
    title: string;
    description: string;
    exampleQuery: string;
    exampleSql: string;
    businessOutcome: string;
  }[];
  
  businessValueAndROI: {
    metric: string;
    impact: string;
    timeframe: string;
  }[];
  
  faqs: {
    persona?: 'CEO' | 'Data Engineer' | 'CISO' | 'RevOps' | 'E-commerce Director';
    q: string;
    a: string;
  }[];
  
  relatedSlugs: string[];
}

export const saasIntegrationsPart1: Record<string, SEOPageData> = {
  'analyze-salesforce-data': {
    type: 'integration',
    title: 'Analyze Salesforce Data with AI | Zero-ETL CRM Analytics | Arcli',
    description: 'Connect Salesforce to Arcli. Bypass rigid native reports and use generative AI to track pipeline velocity, cross-object joins, and rep performance instantly.',
    h1: 'How to Analyze Salesforce Data (Without SOQL)',
    subtitle: 'Stop wrestling with rigid Salesforce Report builders and custom object limitations. Ask complex questions about your pipeline in plain English to unlock instant architectural visibility.',
    icon: <Cloud className="w-12 h-12 text-sky-500 mb-6" />,
    schemaMarkup: 'HowTo',
    
    demoPipeline: {
      userPrompt: "Why did our Enterprise win rate drop last quarter?",
      aiInsight: "Enterprise win rates dropped by 8.4% in Q3. The primary bottleneck was a 22-day increase in the 'Legal Review' stage for accounts sourced via Outbound Sales.",
      generatedSql: `WITH stage_duration AS (
  SELECT opportunity_id, AVG(DATE_PART('day', exit_time - enter_time)) AS days_in_legal 
  FROM sfdc_opportunity_history WHERE stage_name = 'Legal Review' GROUP BY 1
)
SELECT o.lead_source, sd.days_in_legal, o.is_won 
FROM sfdc_opportunities o JOIN stage_duration sd ON o.id = sd.opportunity_id 
WHERE o.type = 'Enterprise' AND o.close_date >= '2023-07-01';`,
      chartMetric: "-8.4% Win Rate (Q/Q)"
    },

    targetPersonas: [
      {
        role: 'For Founders & CROs',
        iconType: 'exec',
        description: 'Get real-time answers to strategic pipeline questions without waiting for RevOps to build a new dashboard.',
        capabilities: ['Executive Board Summaries', 'Predictive Win-Rate Forecasting']
      },
      {
        role: 'For RevOps Leaders',
        iconType: 'ops',
        description: 'Instantly connect and merge CRM metrics with external quota sheets or marketing data using natural language.',
        capabilities: ['Multi-Touch Attribution', 'Cross-object Semantic Joins']
      },
      {
        role: 'For Data Engineering',
        iconType: 'data',
        description: 'Offload ad-hoc SFDC reporting. Arcli securely connects via read-only OAuth, flattening complex object schemas dynamically.',
        capabilities: ['Zero-Mutation Architecture', 'Automated Custom Field Detection']
      }
    ],

    ctaHierarchy: {
      primary: { text: 'Connect Salesforce Free', href: '/register' },
      secondary: { text: 'View Security Architecture', href: '/security' }
    },

    quickAnswer: 'To analyze Salesforce data efficiently, bypass SOQL by connecting your CRM to an analytical query engine like Arcli. Extract opportunities into a columnar format, allowing AI to calculate metrics like pipeline velocity and snapshot trends using standard SQL.',
    stepByStep: [
      'Connect Salesforce via OAuth 2.0 API or direct warehouse replica',
      'Let the Semantic Router index custom objects and polymorphic fields',
      'Extract and flatten opportunity history for velocity calculations',
      'Query the mapped schema using plain English to generate dynamic dashboards'
    ],
    features: [
      'Vectorized Pipeline Velocity Tracking', 
      'Dynamic Cross-Object Joins via AI', 
      'Automated Custom Field (__c) Detection',
      'Sub-Second In-Browser Charting'
    ],
    
    pipelinePhases: [
      {
        phase: '1. The Zero-ETL Sync',
        description: 'Authorize Arcli using enterprise-grade Salesforce OAuth 2.0. We strictly enforce read-only access and immediately normalize the payload into DuckDB Parquet formats.'
      },
      {
        phase: '2. Automated Metadata Ingestion',
        description: 'Our Semantic Router automatically scans and indexes your complex CRM schema, understanding the relationships between Standard Objects and deeply nested Custom Objects.'
      },
      {
        phase: '3. Conversational Compute',
        description: 'By bypassing traditional SOQL limits and compiling queries directly against the in-memory columnar replica, operations execute in milliseconds.'
      }
    ],
    
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Native recognition and mapping of custom fields (e.g., `industry__c`) and lookup relationships.',
        'Seamlessly handles Salesforce Opportunity History tracking for time-in-stage analytics.'
      ],
      aiAdvantage: 'Arcli’s semantic layer embeds your unique Salesforce terminology (like specific custom deal stages) into the AI context, preventing query hallucinations.'
    },
    
    workflowUpgrade: {
      legacyBottleneck: [
        'Native Salesforce report builders require custom report types just to join more than 3 objects.',
        'Tracking historical snapshot data (e.g., "What was the pipeline value on Day 1 of the quarter?") is notoriously difficult natively.'
      ],
      arcliAutomation: [
        'Generates complex, multi-object analytical logic (CTEs, Window Functions) instantly via conversational prompts.',
        'Seamlessly joins Salesforce pipeline data with external billing databases (like Stripe) for true ROI mapping.'
      ]
    },
    
    competitiveAdvantage: [
      { category: 'Data Blending', legacyTool: 'Salesforce Native Reports', limitation: 'Restricted to predefined Custom Report Types', arcliAdvantage: 'Unlimited automated semantic SQL joins' },
      { category: 'Historical Trending', legacyTool: 'Standard SFDC Dashboards', limitation: 'Requires expensive CRM Analytics add-ons', arcliAdvantage: 'Native snapshot and time-travel querying' }
    ],
    
    analyticalScenarios: [
      {
        level: 'Strategic',
        title: 'Pipeline Velocity by Account Vertical',
        description: 'Measure the exact number of days it takes to close a deal, cross-referenced with account custom fields to identify bottlenecks.',
        exampleQuery: "Show me the average sales cycle length for closed-won opportunities, grouped by the Account's Industry.",
        exampleSql: `-- Generated by Arcli Query Planner
SELECT 
  a.industry__c AS account_industry, 
  AVG(DATE_PART('day', o.close_date::timestamp - o.created_date::timestamp)) AS avg_cycle_days 
FROM 
  salesforce_opportunities o 
JOIN 
  salesforce_accounts a ON o.account_id = a.id 
WHERE 
  o.is_won = TRUE 
GROUP BY 
  1 
ORDER BY 
  2 DESC;`,
        businessOutcome: 'Reveals that Healthcare Enterprise deals require an average of 142 days to close, enabling more accurate quarterly sales forecasting.'
      }
    ],
    
    businessValueAndROI: [
      { metric: 'Data Engineering Hours Saved', impact: 'Reduce SFDC ad-hoc report-building ticket queues by 85%.', timeframe: 'Immediate (Day 1)' }
    ],
    
    faqs: [
      {
        persona: 'CEO',
        q: 'How does this accelerate our Board reporting?',
        a: 'Instead of waiting two weeks for RevOps to compile static slides from Salesforce CSV exports, Arcli allows you to ask conversational questions live during a board meeting.'
      },
      {
        persona: 'CISO',
        q: 'Is our pipeline data used for public AI training?',
        a: 'No. Arcli adheres to a strict Zero-Mutation and Local-First Processing model where possible. Your data is isolated per tenant and encrypted at rest. We NEVER use customer schema or row-level data to train foundational LLMs.'
      },
      {
        persona: 'RevOps',
        q: 'What happens when we add new custom fields or alter our sales stages?',
        a: 'Arcli\'s Semantic Router detects schema drift dynamically. The next time you sync, the new metadata (`new_field__c`) is automatically embedded into the LLM\'s context window without manual mapping.'
      }
    ],
    relatedSlugs: ['hubspot-ai-analytics', 'natural-language-to-sql', 'b2b-revenue-dashboard']
  },

  'analyze-shopify-data': {
    type: 'integration',
    title: 'Analyze Shopify E-Commerce Data with AI | Arcli Analytics',
    description: 'Turn massive Shopify store data into actionable insights. Evaluate how Arcli automatically unpacks nested JSON to calculate true margins, LTV, and inventory forecasting.',
    h1: 'How to Analyze Shopify Data (LTV, CAC, Net Profit)',
    subtitle: 'Move beyond basic gross revenue dashboards. Let our engine unpack nested JSON payloads to calculate exact SKU profitability, cohort LTV, and inventory velocity.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-500 mb-6" />,
    schemaMarkup: 'HowTo',
    
    demoPipeline: {
      userPrompt: "Which influencer discount code drove the highest net profit last month?",
      aiInsight: "While 'SUMMER25' drove the highest gross revenue, 'TECHREVIEW10' resulted in 42% higher Net Profit because it was applied primarily to high-margin hardware SKUs.",
      generatedSql: `SELECT d.code AS discount_code, SUM(li.price * li.quantity) AS gross, SUM((li.price - c.cogs) * li.quantity - d.amount) AS net_profit 
FROM shopify_orders o 
CROSS JOIN UNNEST(o.line_items) AS li 
CROSS JOIN UNNEST(o.discount_applications) AS d 
JOIN inventory_cogs c ON li.sku = c.sku 
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days' 
GROUP BY 1 ORDER BY 3 DESC;`,
      chartMetric: "+42% Net Margin"
    },

    targetPersonas: [
      {
        role: 'For E-com Founders',
        iconType: 'exec',
        description: 'Stop looking at vanity Gross Revenue metrics. Get conversational access to your true net profitability after COGS, discounts, and returns.',
        capabilities: ['True Net Margin Visibility', 'Discount ROI Tracking']
      },
      {
        role: 'For Growth Marketing',
        iconType: 'ops',
        description: 'Blend Shopify purchase data directly with Meta/Google ad spend to calculate true blended Customer Acquisition Cost (CAC) and LTV.',
        capabilities: ['Vectorized Cohort LTV', 'Blended CAC Calculation']
      },
      {
        role: 'For Operations & Logistics',
        iconType: 'data',
        description: 'Automate inventory forecasting. Connect securely to the Admin API to predict exact run-out dates based on trailing velocity.',
        capabilities: ['Predictive Stock Depletion', 'Automated JSON Unpacking']
      }
    ],

    ctaHierarchy: {
      primary: { text: 'Connect Shopify Free', href: '/register' },
      secondary: { text: 'See E-Commerce Demo', href: '#interactive-demo' }
    },

    quickAnswer: 'To deeply analyze Shopify data, extract raw order records, flatten nested JSON elements (like line_items and discount_applications), map them against your Cost of Goods Sold (COGS), and execute SQL to calculate net profit and cohort LTV.',
    stepByStep: [
      'Connect the Shopify Admin API via secure OAuth',
      'Use Arcli to automatically unnest complex JSON arrays (line items, discounts, taxes)',
      'Map raw sales data against a COGS (Cost of Goods Sold) table',
      'Prompt the AI to calculate net profit, cohort retention, and predictive inventory velocity'
    ],
    features: [
      'Predictive Inventory Forecasting', 
      'Vectorized Cohort LTV Tracking', 
      'True Net Margin & COGS Mapping',
      'Native JSON Array Unnesting'
    ],
    
    pipelinePhases: [
      {
        phase: '1. API Synchronization',
        description: 'Connect your Shopify store via our secure integration portal using strictly scoped read-only access to prevent data mutation.'
      },
      {
        phase: '2. Automated Payload Normalization',
        description: 'Shopify order data is notoriously nested. Arcli automatically cleans and flattens complex JSON arrays into optimized columnar structures for rapid querying.'
      },
      {
        phase: '3. Conversational Extraction',
        description: 'Data is instantly available for querying via plain English prompts, executing in sub-seconds via our embedded analytical engine.'
      }
    ],
    
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Natively extracts and aggregates deeply nested JSON arrays (`line_items`, `tax_lines`) commonly found in modern E-commerce APIs.',
        'Facilitates explicit Cost of Goods Sold (COGS) mapping to calculate actual contribution margins.'
      ],
      aiAdvantage: 'The AI is specifically trained on E-commerce relational models, accurately attributing proportional discounts and refunds down to the individual SKU level.'
    },
    
    workflowUpgrade: {
      legacyBottleneck: [
        'Native Shopify dashboards over-index on Gross Revenue, ignoring variable COGS and escalating return rates.',
        'Calculating Lifetime Value (LTV) across specific customer cohorts requires messy Excel exports and VLOOKUPs.'
      ],
      arcliAutomation: [
        'Generates mathematically precise Net Margin reporting instantly via natural language, unpacking JSON on the fly.',
        'Allows for cross-platform data blending (e.g., joining Shopify revenue with Meta Ads spend in a single prompt).'
      ]
    },
    
    competitiveAdvantage: [
      { category: 'Profitability Metrics', legacyTool: 'Native Shopify Analytics', limitation: 'Focuses primarily on Gross Revenue', arcliAdvantage: 'Calculates True Net Profit & COGS instantly' },
      { category: 'Inventory Forecasting', legacyTool: 'Manual Spreadsheets', limitation: 'Requires constant manual CSV exports', arcliAdvantage: 'Real-time Predictive Velocity Analytics' }
    ],
    
    analyticalScenarios: [
      {
        level: 'Strategic',
        title: 'Predictive Inventory Depletion',
        description: 'Combine historical sales velocity with current stock levels to forecast exact run-out dates per SKU.',
        exampleQuery: "Which SKUs have less than 30 days of inventory remaining based on their 14-day trailing sales velocity?",
        exampleSql: `-- Generated by Arcli Query Planner
WITH trailing_velocity AS (
  SELECT sku, SUM(quantity) / 14.0 AS daily_sales_velocity 
  FROM shopify_order_line_items 
  WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' 
  GROUP BY sku
) 
SELECT 
  i.sku, 
  i.inventory_quantity AS current_stock, 
  (i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)) AS days_left 
FROM 
  shopify_inventory_levels i 
JOIN 
  trailing_velocity tv ON i.sku = tv.sku 
WHERE 
  (i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)) < 30;`,
        businessOutcome: 'Prevents catastrophic stockouts during high-demand BFCM periods by enabling proactive reordering based on mathematical reality.'
      }
    ],
    
    businessValueAndROI: [
      { metric: 'Net Margin Visibility', impact: 'Identify and eliminate unprofitable discount strategies, instantly improving net margins by 5-15%.', timeframe: 'First 30 Days' }
    ],
    
    faqs: [
      {
        persona: 'CEO',
        q: 'Can this show me true net profit after returns and discounts?',
        a: 'Yes. By mapping your COGS and unpacking the complex Shopify JSON payloads regarding refunds and discount allocations, Arcli provides exact net profitability, not just vanity gross sales.'
      },
      {
        persona: 'Data Engineer',
        q: 'How do you handle deeply nested JSON arrays for line items?',
        a: 'Our ingestion engine automatically flattens and normalizes `line_items`, `tax_lines`, and `refunds` into distinct, optimized columnar structures (Parquet), allowing for rapid vectorized querying via tools like UNNEST().'
      },
      {
        persona: 'CISO',
        q: 'Are the connections strictly read-only?',
        a: '100%. We enforce a Zero-Mutation Architecture. The API keys utilized to extract your Shopify data are programmatically restricted from creating, updating, or deleting any records in your store.'
      }
    ],
    relatedSlugs: ['stripe-revenue-recognition', 'ecommerce-dashboard-template', 'blended-roas-analytics']
  }
};