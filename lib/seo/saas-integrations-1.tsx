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
    title: 'Analyze Salesforce Data with AI | Arcli Analytics',
    description: 'Connect Salesforce to Arcli. Bypass rigid native reports and use generative AI to track pipeline velocity, custom objects, and rep performance instantly.',
    h1: 'How to Analyze Salesforce Data (Without SOQL)',
    subtitle: 'Stop wrestling with rigid Salesforce Report builders. Ask complex questions about your pipeline in plain English to unlock instant architectural visibility.',
    icon: <Cloud className="w-12 h-12 text-sky-500 mb-6" />,
    schemaMarkup: 'HowTo',
    
    demoPipeline: {
      userPrompt: "Why did our Enterprise win rate drop last quarter?",
      aiInsight: "Enterprise win rates dropped by 8.4% in Q3. The primary bottleneck was a 22-day increase in the 'Legal Review' stage for accounts sourced via Outbound Sales.",
      generatedSql: "SELECT lead_source, AVG(days_in_legal) as avg_legal_delay, win_rate FROM sfdc_opportunities WHERE type = 'Enterprise' AND close_date >= '2023-07-01' GROUP BY lead_source;",
      chartMetric: "-8.4% Q/Q"
    },

    targetPersonas: [
      {
        role: 'For Founders & CROs',
        iconType: 'exec',
        description: 'Get real-time answers to strategic pipeline questions without waiting for RevOps to build a new dashboard.',
        capabilities: ['Executive Board Summaries', 'Predictive Forecasting']
      },
      {
        role: 'For RevOps',
        iconType: 'ops',
        description: 'Instantly connect and merge CRM metrics with external quota sheets using natural language.',
        capabilities: ['Automated Slack Reports', 'Cross-object Semantic Joins']
      },
      {
        role: 'For Data Engineering',
        iconType: 'data',
        description: 'Offload ad-hoc SFDC reporting. Arcli securely connects via read-only OAuth, respecting your exact schema.',
        capabilities: ['Zero-Mutation Architecture', 'Automated Custom Field Sync']
      }
    ],

    ctaHierarchy: {
      primary: { text: 'Start Analyzing Free', href: '/register' },
      secondary: { text: 'View Architecture', href: '#how-it-works' }
    },

    quickAnswer: 'To analyze Salesforce data efficiently, connect your CRM to an analytical query engine, extract opportunities into a columnar format, and calculate metrics like win rate, pipeline velocity, and deal size using automated SQL or AI tools.',
    stepByStep: [
      'Connect Salesforce via OAuth 2.0 API or warehouse replica',
      'Extract opportunities, account data, and custom objects',
      'Calculate core metrics like win rate and pipeline velocity',
      'Visualize trends dynamically in an interactive dashboard'
    ],
    features: [
      'Vectorized Pipeline Velocity Tracking', 
      'Dynamic Cross-Object Joins via RAG', 
      'Automated Custom Field Detection',
      'Sub-Second In-Browser Charting'
    ],
    
    pipelinePhases: [
      {
        phase: '1. The Zero-Copy Pipeline',
        description: 'Authorize Arcli using enterprise-grade Salesforce OAuth 2.0 protocols. We strictly enforce read-only access scopes.'
      },
      {
        phase: '2. Automated Metadata Ingestion',
        description: 'Our Semantic Router automatically scans and indexes your complex schema, including custom objects and polymorphic fields.'
      },
      {
        phase: '3. Conversational Compute',
        description: 'By bypassing traditional REST bottlenecks and compiling queries into optimized SQL over Parquet formats, operations execute in sub-seconds.'
      }
    ],
    
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Native recognition and mapping of custom fields (e.g., `industry__c`).',
        'Translates natural language into complex relational joins, bypassing SOQL limitations.'
      ],
      aiAdvantage: 'Arcli’s semantic router embeds your unique Salesforce terminology (like specific deal stages) into the AI context, preventing hallucinations.'
    },
    
    workflowUpgrade: {
      legacyBottleneck: [
        'Native Salesforce report builders require clicking through 5+ menus just to group by a secondary dimension.',
        'Exporting data to Excel breaks version control and introduces human error.'
      ],
      arcliAutomation: [
        'Generates complex, multi-object analytical logic instantly via conversational prompts.',
        'Seamlessly joins Salesforce pipeline data with external billing databases.'
      ]
    },
    
    competitiveAdvantage: [
      { category: 'Data Blending', legacyTool: 'Salesforce Native Reports', limitation: 'Limited (Requires Custom Report Types)', arcliAdvantage: 'Unlimited (Automated Semantic Joins)' },
      { category: 'Query Execution Speed', legacyTool: 'Standard API Pulls', limitation: 'Slow (API Constrained)', arcliAdvantage: 'Instant (Columnar Execution)' }
    ],
    
    analyticalScenarios: [
      {
        level: 'Intermediate',
        title: 'Pipeline Velocity by Vertical',
        description: 'Measure the exact number of days it takes to close a deal, cross-referenced with account custom fields.',
        exampleQuery: "Show me the average sales cycle length for closed-won opportunities, grouped by the Account's Industry.",
        exampleSql: `SELECT a.industry__c AS account_industry, AVG(DATE_PART('day', o.close_date::timestamp - o.created_date::timestamp)) AS avg_cycle_days FROM salesforce_opportunities o JOIN salesforce_accounts a ON o.account_id = a.id WHERE o.is_won = TRUE GROUP BY 1 ORDER BY 2 DESC;`,
        businessOutcome: 'Reveals that Healthcare deals require an average of 142 days to close, enabling more accurate quarterly forecasting.'
      }
    ],
    
    businessValueAndROI: [
      { metric: 'Data Engineering Hours Saved', impact: 'Reduce SFDC report-building ticket queues by 85%.', timeframe: 'Immediate (Day 1)' }
    ],
    
    faqs: [
      {
        persona: 'CEO',
        q: 'How does this accelerate our Board reporting?',
        a: 'Instead of waiting two weeks for RevOps to compile static slides from Salesforce exports, Arcli allows you to ask conversational questions live during a board meeting.'
      },
      {
        persona: 'CISO',
        q: 'Is our pipeline data used for public AI training?',
        a: 'No. Arcli adheres to a strict Zero-Mutation and Local-First Processing model where possible. Your data is isolated per tenant and encrypted at rest. We never use customer schema or row-level data to train foundational LLMs.'
      },
      {
        persona: 'RevOps',
        q: 'What happens when we add new custom fields or alter our sales stages?',
        a: 'Arcli\'s Semantic Router detects schema drift dynamically. The next time you sync, the new metadata (`new_field__c`) is automatically embedded into the LLM\'s context window.'
      }
    ],
    relatedSlugs: ['hubspot-ai-analytics', 'natural-language-to-sql']
  },

  'analyze-shopify-data': {
    type: 'integration',
    title: 'Analyze Shopify E-Commerce Data with AI | Arcli Analytics',
    description: 'Turn massive Shopify store data into actionable insights. Evaluate how Arcli automatically unpacks nested JSON to calculate true margins, LTV, and inventory forecasting.',
    h1: 'How to Analyze Shopify Data (LTV, CAC, Profit)',
    subtitle: 'Move beyond basic gross revenue dashboards. Let our engine unpack nested JSON payloads to calculate exact SKU profitability and cohort LTV.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-500 mb-6" />,
    schemaMarkup: 'HowTo',
    
    demoPipeline: {
      userPrompt: "Which influencer discount code actually drove the highest net profit last month?",
      aiInsight: "While 'SUMMER25' drove the highest gross revenue, 'TECHREVIEW10' resulted in 42% higher Net Profit because it was applied primarily to high-margin hardware SKUs.",
      generatedSql: "SELECT discount_code, SUM(gross_sales) as gross, SUM(gross_sales - total_discount - cogs) as net_profit FROM shopify_orders JOIN inventory_cogs ON sku = sku WHERE created_at >= current_date - 30 GROUP BY discount_code ORDER BY net_profit DESC;",
      chartMetric: "+42% Net Margin"
    },

    targetPersonas: [
      {
        role: 'For E-com Founders',
        iconType: 'exec',
        description: 'Stop looking at vanity Gross Revenue metrics. Get conversational access to your true net profitability after COGS and returns.',
        capabilities: ['True Net Margin Visibility', 'Discount ROI Tracking']
      },
      {
        role: 'For Growth Marketing',
        iconType: 'ops',
        description: 'Blend Shopify purchase data directly with Meta/Google ad spend to calculate true blended Customer Acquisition Cost (CAC).',
        capabilities: ['Vectorized Cohort LTV', 'Blended CAC Calculation']
      },
      {
        role: 'For Operations',
        iconType: 'data',
        description: 'Automate inventory forecasting. Connect securely to the Admin API to predict exact run-out dates based on trailing velocity.',
        capabilities: ['Predictive Stock Depletion', 'Nested JSON Unpacking']
      }
    ],

    ctaHierarchy: {
      primary: { text: 'Connect Shopify Free', href: '/register' },
      secondary: { text: 'See Live Demo', href: '#interactive-demo' }
    },

    quickAnswer: 'To deeply analyze Shopify data, extract raw order and inventory records, flatten nested JSON elements (like line items and discounts), map against your Cost of Goods Sold (COGS), and calculate net profit and cohort LTV.',
    stepByStep: [
      'Connect the Shopify Admin API securely',
      'Flatten nested JSON arrays (line items, discounts, taxes)',
      'Map raw sales data against Cost of Goods Sold (COGS)',
      'Calculate net profit, cohort LTV, and predictive inventory velocity'
    ],
    features: [
      'Predictive Inventory Forecasting', 
      'Vectorized Cohort LTV Tracking', 
      'True Net Margin & COGS Calculation',
      'Nested JSON Unpacking'
    ],
    
    pipelinePhases: [
      {
        phase: '1. API Synchronization',
        description: 'Connect your Shopify store via our secure integration portal using strictly scoped read-only access.'
      },
      {
        phase: '2. Automated Payload Normalization',
        description: 'Shopify order data is notoriously nested. Arcli automatically cleans and flattens complex JSON arrays into optimized columnar structures.'
      },
      {
        phase: '3. Conversational Extraction',
        description: 'Data is instantly available for querying via plain English prompts, executing in sub-seconds via DuckDB.'
      }
    ],
    
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Natively extracts and aggregates deeply nested JSON arrays commonly found in modern E-commerce APIs.',
        'Facilitates explicit Cost of Goods Sold (COGS) mapping.'
      ],
      aiAdvantage: 'The AI is specifically trained on E-commerce relational models, attributing proportional discounts down to the individual SKU level.'
    },
    
    workflowUpgrade: {
      legacyBottleneck: [
        'Native Shopify dashboards over-index on Gross Revenue, ignoring variable COGS and return rates.',
        'Calculating LTV across specific customer segments is notoriously difficult in the native UI.'
      ],
      arcliAutomation: [
        'Generates mathematically precise Net Margin and COGS reporting instantly via natural language.',
        'Allows for cross-platform data blending (e.g., joining Shopify revenue with Meta Ads spend).'
      ]
    },
    
    competitiveAdvantage: [
      { category: 'Profitability Metrics', legacyTool: 'Native Dashboards', limitation: 'Gross Revenue Focus', arcliAdvantage: 'True Net Profit & COGS mapping' },
      { category: 'Inventory Forecasting', legacyTool: 'Manual Spreadsheets', limitation: 'Manual (Excel exports)', arcliAdvantage: 'Predictive Velocity Analytics' }
    ],
    
    analyticalScenarios: [
      {
        level: 'Strategic',
        title: 'Predictive Inventory Depletion',
        description: 'Combine historical sales velocity with current stock levels to forecast exact run-out dates.',
        exampleQuery: "Which SKUs have less than 30 days of inventory remaining based on their 14-day trailing sales velocity?",
        exampleSql: `WITH trailing_velocity AS (SELECT sku, SUM(quantity) / 14.0 AS daily_sales_velocity FROM shopify_order_line_items WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' GROUP BY sku) SELECT i.sku, i.inventory_quantity AS current_stock, (i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)) AS days_of_inventory_left FROM shopify_inventory_levels i JOIN trailing_velocity tv ON i.sku = tv.sku WHERE (i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)) < 30;`,
        businessOutcome: 'Prevents catastrophic stockouts during high-demand periods by enabling proactive reordering based on mathematical reality.'
      }
    ],
    
    businessValueAndROI: [
      { metric: 'Net Margin Visibility', impact: 'Identify and eliminate unprofitable discount strategies, instantly improving net margins by 5-15%.', timeframe: 'First 30 Days' }
    ],
    
    faqs: [
      {
        persona: 'CEO',
        q: 'Can this show me true net profit after returns and discounts?',
        a: 'Yes. By mapping your COGS and unpacking the complex Shopify JSON payloads regarding refunds and discount allocations, Arcli provides exact net profitability, not just vanity gross revenue.'
      },
      {
        persona: 'Data Engineer',
        q: 'How do you handle deeply nested JSON arrays for line items?',
        a: 'Our ingestion engine automatically flattens and normalizes `line_items`, `tax_lines`, and `refunds` into distinct, optimized columnar structures (Parquet), allowing for rapid vectorized querying.'
      },
      {
        persona: 'CISO',
        q: 'Are the connections strictly read-only?',
        a: '100%. We enforce a Zero-Mutation Architecture. The API keys utilized to extract your Shopify data are programmatically restricted from creating, updating, or deleting any records in your store.'
      }
    ],
    relatedSlugs: ['stripe-revenue-recognition', 'ecommerce-dashboard-template']
  }
};