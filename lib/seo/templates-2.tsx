import React from 'react';
import { Users, ShoppingCart, Database, Download, Zap, BarChart2 } from 'lucide-react';

/**
 * [V13 ENFORCED] TemplateBlueprint Schema
 * Upgraded for SEO, Conversion, and High-Performance Programmatic Generation.
 * Designed to capture high-intent long-tail keywords (CAC, ROAS, Shopify Analytics)
 * while providing instant value (SQL snippets) to Marketing, E-commerce, and RevOps leaders.
 */
export interface TemplateBlueprint {
  id: string;
  type: 'template';
  metadata: {
    title: string;
    description: string;
    canonicalDomain: string; // arcli.tech
    primaryKeyword: string;
    secondaryKeywords: string[];
    intent: 'template' | 'guide' | 'comparison';
  };
  
  // 🧬 STRUCTURED DATA LAYER
  schemaEnforcement: {
    enableFAQ: boolean;
    enableSoftwareApplication: boolean;
    enableHowTo: boolean;
  };

  // 🎯 CONVERSION ENGINE
  conversionMatrix: {
    primaryCTA: string;
    secondaryCTA: string;
    contextualCTA: string;
  };

  hero: {
    h1: string;
    subtitle: string;
    icon: React.ReactElement;
  };
  
  userQuestions: string[];
  immediateValue: string[];
  
  quickStart: {
    timeToValue: string;
    steps: string[];
  };
  
  assets?: {
    type: 'sql' | 'csv' | 'notion' | 'pdf';
    label: string;
    url: string;
    icon: React.ReactElement;
  }[];
  
  comparison?: {
    vsTool: string;
    metrics: {
      feature: string;
      competitor: string;
      arcli: string;
    }[];
  };
  
  technicalStack: {
    engine: 'DuckDB' | 'Polars' | 'SQL-Pushdown';
    format: 'Parquet' | 'Columnar' | 'JSONB-Unnested';
    compute: string;
  };
  
  performanceMetrics: string[];
  
  orchestrationWorkflow: {
    phase1: { name: string; description: string };
    phase2: { name: string; description: string };
    phase3: { name: string; description: string };
  };
  
  strategicContext: {
    title: string;
    industrialConstraints: string[];
    arcliEfficiency: string;
  };
  
  analyticalScenarios: {
    level: 'Basic' | 'Intermediate' | 'Advanced' | 'Strategic';
    title: string;
    description: string;
    exampleQuery: string;
    exampleSql: string;
    businessOutcome: string;
    // 🧱 UI VISUALIZATION ENGINE
    visualizationConfig: {
      type: 'BarChart' | 'LineChart' | 'Funnel' | 'MetricCard' | 'Scatter';
      dataMapping: { x: string; y: string; groupBy?: string };
      interactionPurpose: string;
    };
  }[];
  
  businessValueAndROI: {
    metric: string;
    impact: string;
    timeframe: string;
  }[];
  
  enterpriseApplications: {
    vertical: string;
    application: string;
  }[];
  
  trustAndSecurity: {
    guarantee: string;
    mechanism: string;
  }[];
  
  faqs: {
    persona: 'CEO' | 'CFO' | 'Data Engineer' | 'CISO' | 'RevOps' | 'Marketing Director' | 'E-commerce Director';
    q: string;
    a: string;
  }[];
  
  relatedBlueprints: string[];
}

export const dashboardTemplatesPart2: Record<string, TemplateBlueprint> = {
  'marketing-dashboard-template': {
    id: 'mkt-blueprint-003',
    type: 'template',
    metadata: {
      title: 'Marketing Dashboard Template (CAC, ROAS, LTV SQL) | Arcli',
      description: 'Track true marketing ROI by connecting ad spend to real revenue. Free SQL templates for CAC, ROAS, and attribution across Google Ads, Meta, and CRM data.',
      canonicalDomain: 'arcli.tech',
      primaryKeyword: 'marketing dashboard template',
      secondaryKeywords: ['true roas calculation', 'blended cac sql', 'marketing attribution dashboard', 'ga4 alternative sql', 'ltv to cac ratio'],
      intent: 'template'
    },
    schemaEnforcement: {
      enableFAQ: true,
      enableSoftwareApplication: true,
      enableHowTo: true
    },
    conversionMatrix: {
      primaryCTA: "Run this SQL in Arcli Instantly",
      secondaryCTA: "Download Marketing SQL Pack",
      contextualCTA: "See How Arcli Outperforms GA4"
    },
    hero: {
      h1: 'Marketing Dashboard Template (CAC, ROAS, LTV SQL)',
      subtitle: 'Track true marketing ROI by connecting ad spend directly to real CRM revenue. Includes ready-to-use SQL templates for Blended CAC, True ROAS, and multi-touch attribution.',
      icon: <Users className="w-12 h-12 text-pink-500 mb-6" />
    },
    userQuestions: [
      'What is our real Blended CAC by acquisition channel?',
      'Which campaigns actually generate revenue, not just clicks?',
      'How do I calculate true ROAS bypassing ad platform metrics?',
      'What is the LTV:CAC ratio for our Paid Social cohort?'
    ],
    immediateValue: [
      'Copy and paste SQL queries for CAC, ROAS, and attribution.',
      'Blend Google Ads and Meta spend with Stripe/CRM revenue instantly.',
      'Eliminate manual spreadsheet reconciliation and VLOOKUPs.',
      'No complex BI tools or long data engineering pipelines required.'
    ],
    quickStart: {
      timeToValue: '< 5 minutes',
      steps: [
        'Connect your ad platforms (Google/Meta) and billing database via read-only access.',
        'Arcli automatically maps your UTM parameters to customer IDs.',
        'Run the SQL below in your environment to generate instant charts.'
      ]
    },
    assets: [
      {
        type: 'sql',
        label: 'Download the Marketing SQL Query Pack (.sql)',
        url: '#',
        icon: <Database className="w-4 h-4 mr-2" />
      },
      {
        type: 'pdf',
        label: 'The True ROAS Calculation Guide',
        url: '#',
        icon: <Zap className="w-4 h-4 mr-2" />
      }
    ],
    comparison: {
      vsTool: 'Google Analytics 4 (GA4)',
      metrics: [
        { feature: 'Revenue Attribution', competitor: 'Probabilistic / Session-based', arcli: 'Exact (SQL-based from CRM)' },
        { feature: 'B2B CRM Integration', competitor: 'Limited / High-friction', arcli: 'Native & Seamless' },
        { feature: 'Custom Logic / SQL Access', competitor: 'No direct querying', arcli: 'Full SQL & AI Querying' }
      ]
    },
    technicalStack: {
      engine: 'DuckDB',
      format: 'Columnar',
      compute: 'WASM-Powered Cross-Platform Joins'
    },
    performanceMetrics: [
      'Automated Blended CAC Tracking',
      'True Multi-Touch Attribution Logic',
      'Instant UTM Parsing and Grouping',
      'Zero-Latency Funnel Rendering'
    ],
    strategicContext: {
      title: 'Break the Marketing Analytics Silo',
      industrialConstraints: [
        'Ad platforms (Google Ads, Meta) inflate their own conversion numbers, leading to over-reported ROI.',
        'Linking fragmented ad spend to actual downstream CRM revenue takes months to build in standard data pipelines.',
        'Legacy BI dashboards freeze or lag when trying to filter millions of rows of web traffic and event logs.'
      ],
      arcliEfficiency: 'Arcli acts as an instant semantic bridge. We join your ad spend warehouse directly with your CRM or billing database, enabling you to trace a UTM click directly to a closed-won dollar using optimized SQL.'
    },
    orchestrationWorkflow: {
      phase1: {
        name: 'Connect Spend & Revenue',
        description: 'Securely link your ad-spend warehouses alongside your transactional CRM or billing datasets.'
      },
      phase2: {
        name: 'The Semantic Bridge',
        description: 'Arcli automatically maps the relationships, linking front-end UTM parameters with back-end customer IDs.'
      },
      phase3: {
        name: 'Run & Reallocate',
        description: 'Execute plain-English queries to evaluate true ROAS instantly, guiding budget reallocation without waiting for data teams.'
      }
    },
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'Blended CAC by Acquisition Channel',
        description: 'Calculate exactly how much it costs to acquire a paying customer, combining spend across all platforms. Copy this query directly.',
        exampleQuery: "Calculate our Blended CAC by UTM Source for the last 90 days, joining total ad spend with new paying customers.",
        exampleSql: `WITH spend_attr AS (
  SELECT utm_source, SUM(spend) as total_spend 
  FROM consolidated_ad_spend 
  WHERE date >= CURRENT_DATE - 90 
  GROUP BY 1
),
conversions AS (
  SELECT utm_source, COUNT(DISTINCT customer_id) as new_customers 
  FROM internal_billing_events 
  WHERE event_type = 'subscription_created' 
    AND created_at >= CURRENT_DATE - 90 
  GROUP BY 1
)
SELECT 
  s.utm_source, 
  s.total_spend,
  c.new_customers,
  ROUND(s.total_spend / NULLIF(c.new_customers, 0), 2) AS blended_cac
FROM spend_attr s 
JOIN conversions c USING (utm_source) 
ORDER BY blended_cac ASC;`,
        businessOutcome: 'Immediately reveals which channels burn cash and which generate profitable, high-intent customers.',
        visualizationConfig: {
          type: 'BarChart',
          dataMapping: { x: 'utm_source', y: 'blended_cac' },
          interactionPurpose: 'Quickly identify the most expensive acquisition channels to reallocate budget.'
        }
      },
      {
        level: 'Intermediate',
        title: 'True Return on Ad Spend (ROAS)',
        description: 'Compare marketing spend directly against actual cash collected in Stripe, ignoring ad platform vanity metrics.',
        exampleQuery: "Show me the true ROAS for our 'Q4_Enterprise' campaign by joining Google Ads spend with Stripe captured revenue.",
        exampleSql: `WITH campaign_spend AS (
  SELECT campaign_name, SUM(cost) as total_cost 
  FROM google_ads_campaigns 
  WHERE campaign_name = 'Q4_Enterprise'
  GROUP BY 1
),
campaign_revenue AS (
  SELECT 
    u.acquisition_campaign, 
    SUM(c.amount_captured) as total_revenue
  FROM users u
  JOIN stripe_charges c ON u.stripe_customer_id = c.customer
  WHERE u.acquisition_campaign = 'Q4_Enterprise'
    AND c.status = 'succeeded'
  GROUP BY 1
)
SELECT 
  s.campaign_name,
  s.total_cost,
  r.total_revenue,
  ROUND((r.total_revenue / NULLIF(s.total_cost, 0)) * 100, 2) AS true_roas_percentage
FROM campaign_spend s
JOIN campaign_revenue r ON s.campaign_name = r.acquisition_campaign;`,
        businessOutcome: 'Provides the CFO with undeniable proof of marketing efficiency based on cash-in-bank, not algorithm estimates.',
        visualizationConfig: {
          type: 'MetricCard',
          dataMapping: { x: 'campaign_name', y: 'true_roas_percentage' },
          interactionPurpose: 'High-level executive validation of campaign profitability.'
        }
      },
      {
        level: 'Advanced',
        title: 'Time-to-Conversion Funnel',
        description: 'Measure the exact number of days it takes for a lead acquired via a specific channel to actually pay you.',
        exampleQuery: "What is the average number of days between lead creation and first payment, grouped by acquisition medium?",
        exampleSql: `WITH customer_journey AS (
  SELECT 
    u.id AS user_id,
    u.utm_medium,
    u.created_at AS lead_created_date,
    MIN(s.created_at) AS first_payment_date
  FROM users u
  JOIN stripe_charges s ON u.stripe_customer_id = s.customer
  WHERE s.status = 'succeeded'
  GROUP BY 1, 2, 3
)
SELECT 
  utm_medium,
  COUNT(user_id) AS total_converted_leads,
  ROUND(AVG(DATE_PART('day', first_payment_date - lead_created_date)), 1) AS avg_days_to_convert
FROM customer_journey
WHERE utm_medium IS NOT NULL
GROUP BY 1
HAVING COUNT(user_id) > 10
ORDER BY avg_days_to_convert ASC;`,
        businessOutcome: 'Helps accurately forecast cash flow (e.g., knowing LinkedIn leads take 45 days to convert, while Google Search takes 12 days).',
        visualizationConfig: {
          type: 'Funnel',
          dataMapping: { x: 'avg_days_to_convert', y: 'utm_medium' },
          interactionPurpose: 'Visualize sales cycle length against ad channel origin.'
        }
      },
      {
        level: 'Strategic',
        title: 'LTV:CAC Ratio by Cohort',
        description: 'The ultimate growth metric: dividing the lifetime value of a customer cohort by their exact acquisition cost.',
        exampleQuery: "Calculate the LTV:CAC ratio for customers acquired via Paid Social in Q1 2024.",
        exampleSql: `/* Arcli seamlessly executes deep Data Blending: Spend + Conversions + Revenue */
WITH cohort_spend AS (
  SELECT SUM(spend) as total_cac_spend
  FROM consolidated_ad_spend
  WHERE date >= '2024-01-01' AND date < '2024-04-01' AND channel = 'Paid Social'
),
cohort_customers AS (
  SELECT 
    COUNT(DISTINCT u.id) as acquired_customers,
    SUM(c.amount_captured) as lifetime_revenue
  FROM users u
  JOIN stripe_charges c ON u.stripe_customer_id = c.customer
  WHERE u.created_at >= '2024-01-01' AND u.created_at < '2024-04-01' 
    AND u.utm_source IN ('facebook', 'linkedin', 'tiktok')
    AND c.status = 'succeeded'
)
SELECT 
  s.total_cac_spend / NULLIF(c.acquired_customers, 0) AS cohort_cac,
  c.lifetime_revenue / NULLIF(c.acquired_customers, 0) AS cohort_ltv,
  ROUND((c.lifetime_revenue / NULLIF(c.acquired_customers, 0)) / NULLIF((s.total_cac_spend / NULLIF(c.acquired_customers, 0)), 0), 2) AS ltv_to_cac_ratio
FROM cohort_spend s
CROSS JOIN cohort_customers c;`,
        businessOutcome: 'Delivers the golden 3:1 ratio proof to investors, unlocking approval to aggressively scale paid acquisition.',
        visualizationConfig: {
          type: 'MetricCard',
          dataMapping: { x: 'ltv_to_cac_ratio', y: 'cohort_cac' },
          interactionPurpose: 'Provide VC/Board-ready KPI metrics instantaneously.'
        }
      }
    ],
    businessValueAndROI: [
      {
        metric: 'Eliminate Wasted Ad Spend',
        impact: 'Identify and pause low-converting campaigns instantly, typically saving 10-15% of the monthly budget.',
        timeframe: 'First 30 Days'
      },
      {
        metric: 'Data Engineering Bandwidth',
        impact: 'Remove the need for data teams to build and maintain fragile, custom ETL pipelines just to calculate CAC.',
        timeframe: 'Immediate (Day 1)'
      },
      {
        metric: 'Agency Accountability',
        impact: 'Force external agencies to report on true CRM revenue generated, not just platform "clicks".',
        timeframe: 'Ongoing'
      }
    ],
    enterpriseApplications: [
      { vertical: 'Growth Marketing', application: 'Execute real-time budget reallocation based on true pipeline ROI.' },
      { vertical: 'Performance Agencies', application: 'Provide enterprise clients with transparent, revenue-backed reporting.' }
    ],
    trustAndSecurity: [
      { guarantee: 'Zero-Copy Architecture', mechanism: 'Arcli pushes compute down to your existing data warehouse. Your sensitive CRM data is never duplicated onto our servers.' },
      { guarantee: 'PII Sanitization', mechanism: 'Arcli ensures that emails and IP addresses used in tracking are hashed or excluded from the LLM context window.' }
    ],
    faqs: [
      {
        persona: 'Marketing Director',
        q: 'Why shouldn\'t I just use Google Analytics 4 for attribution?',
        a: 'GA4 is fundamentally a web analytics tool reliant on cookies. It cannot reliably link a web visit to a B2B CRM deal that closes 6 months later. Arcli bridges that gap natively via SQL.'
      },
      {
        persona: 'Data Engineer',
        q: 'How does Arcli handle massive event-tracking data volume?',
        a: 'We convert raw event logs into highly compressed Parquet formats. Using an in-process DuckDB engine, Arcli filters millions of rows in milliseconds directly in the browser.'
      },
      {
        persona: 'CEO',
        q: 'Can this show me if our marketing agency is actually delivering ROI?',
        a: 'Absolutely. By joining the agency\'s spend with actual Stripe or CRM revenue, you get unmanipulated proof of whether campaigns generate profitable customers or just empty traffic.'
      },
      {
        persona: 'RevOps',
        q: 'What if our UTM tagging is messy or inconsistent?',
        a: 'Arcli\'s semantic layer automatically executes string parsing (e.g., standardizing `fb`, `Facebook`, and `facebook.com` into `Paid Social`) before executing the final aggregation.'
      }
    ],
    relatedBlueprints: ['google-analytics-ai-dashboard', 'sales-dashboard-template', 'data-blending-guide']
  },

  'ecommerce-dashboard-template': {
    id: 'ecom-blueprint-004',
    type: 'template',
    metadata: {
      title: 'Shopify Analytics Dashboard Template (SQL + Profit Tracking) | Arcli',
      description: 'Track true profit, LTV, and inventory in Shopify. Free SQL templates for net margin, repeat purchase rates, and stock forecasting without exporting to Excel.',
      canonicalDomain: 'arcli.tech',
      primaryKeyword: 'shopify analytics dashboard template',
      secondaryKeywords: ['ecommerce sql queries', 'how to calculate true net margin shopify', 'shopify cohort analysis', 'inventory forecasting sql', 'shopify ltv calculator'],
      intent: 'template'
    },
    schemaEnforcement: {
      enableFAQ: true,
      enableSoftwareApplication: true,
      enableHowTo: true
    },
    conversionMatrix: {
      primaryCTA: "Sync Shopify to Arcli (Free)",
      secondaryCTA: "Copy E-commerce SQL Snippets",
      contextualCTA: "See How We Predict Inventory"
    },
    hero: {
      h1: 'Shopify Analytics Dashboard Template (SQL + Profit Tracking)',
      subtitle: 'Track true profit, LTV, and inventory velocity. Includes ready-to-use SQL for net margin calculation, repeat purchase rates, and automated stock forecasting.',
      icon: <ShoppingCart className="w-12 h-12 text-emerald-400 mb-6" />
    },
    userQuestions: [
      'What is our True Net Profit by SKU after discounts and COGS?',
      'Which products drive the highest Customer Lifetime Value (LTV)?',
      'When exactly will we run out of inventory for our top items?',
      'What is the 30-day repeat purchase rate for the Black Friday cohort?'
    ],
    immediateValue: [
      'Pre-built SQL to unpack nested Shopify JSON data automatically.',
      'Calculate True Net Margin by factoring in COGS and discounts.',
      'Forecast inventory depletion mathematically based on trailing velocity.',
      'Replace manual Excel exports and fragile VLOOKUPs completely.'
    ],
    quickStart: {
      timeToValue: '< 5 minutes',
      steps: [
        'Connect your Shopify database and your operational COGS tables.',
        'Arcli automatically flattens complex Shopify JSON line items.',
        'Run the SQL templates below to generate real-time retail intelligence.'
      ]
    },
    assets: [
      {
        type: 'sql',
        label: 'Copy Shopify SQL Analytics Pack',
        url: '#',
        icon: <Database className="w-4 h-4 mr-2" />
      },
      {
        type: 'notion',
        label: 'Duplicate E-commerce Command Center',
        url: '#',
        icon: <BarChart2 className="w-4 h-4 mr-2" />
      }
    ],
    comparison: {
      vsTool: 'Shopify Native Analytics',
      metrics: [
        { feature: 'Profit Tracking', competitor: 'Gross Revenue focus', arcli: 'True Net Margin (w/ COGS)' },
        { feature: 'Data Blending', competitor: 'Siloed to Shopify ecosystem', arcli: 'Joins w/ ERP, Ads, and Support' },
        { feature: 'Custom Metrics', competitor: 'Rigid, unchangeable reports', arcli: 'Infinite SQL flexibility' }
      ]
    },
    technicalStack: {
      engine: 'DuckDB',
      format: 'JSONB-Unnested',
      compute: 'Predictive Inventory Depletion via Linear Extrapolation'
    },
    performanceMetrics: [
      'Instant Inventory Depletion Forecasting',
      'Automated True Net Margin Calculation',
      'Vectorized Cohort Repurchase Rates',
      'Nested JSON Order Parsing in Milliseconds'
    ],
    strategicContext: {
      title: 'Move Beyond Vanity Retail Metrics',
      industrialConstraints: [
        'Native dashboards over-index on Gross Revenue, ignoring shipping costs, returns, and COGS—inflating perceived profitability.',
        'Calculating Customer Lifetime Value (LTV) and repurchase rates across cohorts breaks standard spreadsheets.',
        'Inventory reordering relies on "gut feel" or static averages, ignoring recent viral velocity or seasonal traffic.'
      ],
      arcliEfficiency: 'Arcli unites transactional and operational data. We use heavily optimized columnar structures to forecast inventory and calculate True Net Margin at the SKU level—instantly, without server lag.'
    },
    orchestrationWorkflow: {
      phase1: {
        name: 'Automated JSON Normalization',
        description: 'Arcli automatically cleans and un-nests complex Shopify JSON arrays (like `line_items`) into optimized analytical tables.'
      },
      phase2: {
        name: 'Link Operational Data',
        description: 'Seamlessly join your transactional line items with external operational tables like Supplier COGS and Carrier Rates.'
      },
      phase3: {
        name: 'Query & Forecast',
        description: 'Filter and chart massive historical order datasets in sub-seconds using plain English or the provided SQL templates.'
      }
    },
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'True Net Profit Margin by SKU',
        description: 'Calculate the actual profit a product generates after stripping away discounts and base costs. Copy this query.',
        exampleQuery: "List my top 10 products by True Net Profit, factoring in product cost and proportional order discounts.",
        exampleSql: `SELECT 
  li.sku,
  li.title AS product_name,
  SUM(li.quantity) AS total_sold,
  SUM(li.price * li.quantity) AS gross_sales,
  SUM(li.total_discount) AS proportional_discounts,
  SUM(li.quantity * COALESCE(cogs.unit_cost, 0)) AS total_cogs,
  SUM((li.price * li.quantity) - li.total_discount - (li.quantity * COALESCE(cogs.unit_cost, 0))) AS net_profit
FROM shopify_order_line_items li
LEFT JOIN inventory_cogs_mapping cogs ON li.sku = cogs.sku
GROUP BY 1, 2
ORDER BY net_profit DESC
LIMIT 10;`,
        businessOutcome: 'Shifts merchandising focus away from break-even "loss leaders" toward the high-margin items that actually sustain your business.',
        visualizationConfig: {
          type: 'BarChart',
          dataMapping: { x: 'product_name', y: 'net_profit' },
          interactionPurpose: 'Highlight highest-margin products for advertising priority.'
        }
      },
      {
        level: 'Intermediate',
        title: 'Cohort Repurchase Rate Tracking',
        description: 'Track the loyalty of customers grouped by the specific month they made their first purchase.',
        exampleQuery: "Show me the 30-day repeat purchase rate for customers acquired during our Black Friday sale.",
        exampleSql: `WITH first_purchases AS (
  SELECT customer_id, MIN(created_at) as cohort_date
  FROM shopify_orders
  GROUP BY customer_id
),
bf_cohort AS (
  SELECT customer_id FROM first_purchases 
  WHERE cohort_date BETWEEN '2025-11-25' AND '2025-11-30'
),
repeats AS (
  SELECT DISTINCT o.customer_id 
  FROM shopify_orders o
  JOIN bf_cohort b ON o.customer_id = b.customer_id
  JOIN first_purchases fp ON o.customer_id = fp.customer_id
  WHERE o.created_at > fp.cohort_date 
    AND o.created_at <= fp.cohort_date + INTERVAL '30 days'
)
SELECT 
  COUNT(DISTINCT r.customer_id) * 100.0 / NULLIF(COUNT(DISTINCT b.customer_id), 0) AS bf_repeat_rate_pct
FROM bf_cohort b
LEFT JOIN repeats r ON b.customer_id = r.customer_id;`,
        businessOutcome: 'Quantifies whether steep holiday discounts acquire loyal, long-term customers, or just transient bargain-hunters.',
        visualizationConfig: {
          type: 'MetricCard',
          dataMapping: { x: 'cohort_date', y: 'bf_repeat_rate_pct' },
          interactionPurpose: 'Evaluate the true success of promotional discount events.'
        }
      },
      {
        level: 'Advanced',
        title: 'Identify High-LTV "Gateway" Products',
        description: 'Discover which specific products, when purchased first, lead to the highest 12-month Customer Lifetime Value.',
        exampleQuery: "Which initial product purchase reliably leads to the highest 12-month LTV for new customers?",
        exampleSql: `WITH first_order_items AS (
  SELECT 
    o.customer_id, 
    li.product_id, 
    li.title,
    ROW_NUMBER() OVER(PARTITION BY o.customer_id ORDER BY o.created_at ASC) as rn
  FROM shopify_orders o
  JOIN shopify_order_line_items li ON o.id = li.order_id
),
gateway_sku AS (
  SELECT customer_id, product_id, title FROM first_order_items WHERE rn = 1
),
customer_ltv AS (
  SELECT 
    o.customer_id, 
    SUM(o.total_price) as total_12m_revenue
  FROM shopify_orders o
  JOIN first_order_items f ON o.customer_id = f.customer_id
  WHERE o.created_at <= f.created_at + INTERVAL '1 year'
  GROUP BY 1
)
SELECT 
  g.title AS gateway_product,
  COUNT(DISTINCT g.customer_id) AS total_customers_acquired,
  AVG(l.total_12m_revenue) AS avg_12m_ltv
FROM gateway_sku g
JOIN customer_ltv l ON g.customer_id = l.customer_id
GROUP BY 1
HAVING COUNT(DISTINCT g.customer_id) > 50
ORDER BY avg_12m_ltv DESC
LIMIT 10;`,
        businessOutcome: 'Directs your marketing team to intentionally advertise specific high-LTV "gateway" products, maximizing long-term revenue.',
        visualizationConfig: {
          type: 'Scatter',
          dataMapping: { x: 'total_customers_acquired', y: 'avg_12m_ltv', groupBy: 'gateway_product' },
          interactionPurpose: 'Plot product volume vs. long-term customer value potential.'
        }
      },
      {
        level: 'Strategic',
        title: 'Predictive Inventory Depletion',
        description: 'Combine historical sales velocity with current stock levels to mathematically forecast exact run-out dates.',
        exampleQuery: "Which SKUs have less than 30 days of inventory remaining based on their 14-day trailing sales velocity?",
        exampleSql: `WITH trailing_velocity AS (
  SELECT 
    sku,
    SUM(quantity) / 14.0 AS daily_sales_velocity
  FROM shopify_order_line_items
  WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
  GROUP BY sku
)
SELECT 
  i.sku,
  i.inventory_quantity AS current_stock,
  tv.daily_sales_velocity,
  ROUND((i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)), 1) AS days_of_inventory_left
FROM shopify_inventory_levels i
JOIN trailing_velocity tv ON i.sku = tv.sku
WHERE (i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)) < 30
  AND tv.daily_sales_velocity > 0
ORDER BY days_of_inventory_left ASC;`,
        businessOutcome: 'Prevents catastrophic stockouts by enabling proactive reordering perfectly aligned with supplier lead times.',
        visualizationConfig: {
          type: 'BarChart',
          dataMapping: { x: 'sku', y: 'days_of_inventory_left' },
          interactionPurpose: 'Immediate identification of critical supply chain vulnerabilities.'
        }
      }
    ],
    businessValueAndROI: [
      {
        metric: 'Net Margin Optimization',
        impact: 'Identify and eliminate structurally unprofitable discount strategies, instantly improving net margins by 5-15%.',
        timeframe: 'First 30 Days'
      },
      {
        metric: 'Reduction of Stockouts',
        impact: 'Reduce lost revenue from "Out of Stock" notices by shifting to predictive, velocity-based reordering.',
        timeframe: 'First Quarter'
      },
      {
        metric: 'Reporting Agility',
        impact: 'Eliminate the weekly requirement to export raw Shopify data to Excel for manual COGS calculations.',
        timeframe: 'Immediate (Day 1)'
      }
    ],
    enterpriseApplications: [
      { vertical: 'Merchandising', application: 'Optimize product mix by identifying "gateway" SKUs that drive the highest LTV.' },
      { vertical: 'Operations & Supply Chain', application: 'Manage warehouse stock dynamically based on real-time depletion rates.' }
    ],
    trustAndSecurity: [
      { guarantee: 'Local-First Execution', mechanism: 'Arcli aggregates sensitive purchasing data locally using WebAssembly, preventing raw PII from being transmitted.' },
      { guarantee: 'API Scope Governance', mechanism: 'Connections to platforms like Shopify utilize OAuth 2.0 with strict read-only scopes. We cannot alter your store data.' }
    ],
    faqs: [
      {
        persona: 'E-commerce Director',
        q: 'Can this show me true net profit after returns and marketing discounts?',
        a: 'Yes. By mapping your COGS and unpacking complex JSON payloads for refunds and discounts, Arcli provides exact net profitability.'
      },
      {
        persona: 'Data Engineer',
        q: 'How do you handle deeply nested JSON arrays for line items?',
        a: 'Our ingestion engine flattens arrays like `line_items` into optimized columnar structures, allowing rapid SQL querying without complex unnesting logic.'
      },
      {
        persona: 'CEO',
        q: 'How does this replace our current combination of Google Sheets and BI tools?',
        a: 'Spreadsheets lack scale, and BI requires heavy engineering. Arcli is conversational—ask a question, get perfect SQL and an instant chart. Zero boilerplate.'
      },
      {
        persona: 'E-commerce Director',
        q: 'Can it accurately forecast inventory run-out dates?',
        a: 'Yes. By analyzing trailing sales velocity against your synchronized stock levels, Arcli forecasts exact depletion dates so you can reorder accurately.'
      }
    ],
    relatedBlueprints: ['marketing-attribution-blueprint', 'analyze-shopify-data', 'stripe-revenue-recognition']
  }
};