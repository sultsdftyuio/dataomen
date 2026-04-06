// lib/seo/shopify-campaign.tsx

import { SEOPageData } from './index';

/**
 * 🚀 V10.1 SEO UPGRADE: Shopify Campaigns
 * Upgraded from flat/thin content to deep, multi-block V2 architecture.
 * Optimized for: Information Gain, SERP Realism, E-E-A-T, and Semantic Density.
 */

// ----------------------------------------------------------------------
// 1. INVENTORY FORECASTING
// ----------------------------------------------------------------------
export const shopifyInventoryForecasting: SEOPageData = {
  path: '/shopify-inventory-forecasting',
  type: 'campaign',
  meta: {
    title: 'Shopify Inventory Forecasting & Restock Alerts AI | Arcli',
    description: 'Stop losing revenue to stockouts. Arcli analyzes your Shopify sales velocity and supplier lead times to provide accurate, predictive inventory forecasting.',
    keywords: ['shopify inventory forecasting', 'shopify restock alerts', 'predictive inventory ai', 'ecommerce run-rate calculator'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Never Run Out of Your Best Sellers Again.',
        subtitle: 'AI-Driven Shopify Inventory Forecasting',
        description: 'Arcli monitors your Shopify sales velocity in real-time. Get algorithmic inventory forecasting and predictive restock alerts before you lose a single dollar to a stockout.',
        primaryCta: { text: 'Connect Shopify', href: '/register' }
      }
    },
    {
      type: 'ContrarianBanner',
      payload: {
        heading: 'Stockouts aren’t a supply chain problem. They are a data latency problem.',
        description: 'Relying on trailing 30-day averages in a spreadsheet guarantees you will either over-order during a slump or stock out during a spike. You need dynamic run-rate calculations.'
      }
    },
    {
      type: 'Features',
      payload: {
        heading: 'Predictive Inventory Intelligence',
        features: [
          {
            title: 'Dynamic Run-Rate Calculation',
            description: 'Arcli ingests your daily order volume and automatically adjusts your sales velocity based on recent trends, rather than static historical averages.'
          },
          {
            title: 'Lead-Time Aware Restock Alerts',
            description: 'Input your supplier lead times. Arcli mathematically calculates exactly when you need to place a Purchase Order (PO) so inventory arrives precisely as your current stock depletes.'
          },
          {
            title: 'Lost Revenue Recovery',
            description: 'Instantly visualize exactly how much gross profit you are losing per day on out-of-stock SKUs, prioritizing which POs to expedite.'
          }
        ]
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'Ask Arcli Anything About Your Inventory',
        examples: [
          { intent: 'Run-rate check', query: 'Based on last week’s velocity, when will we run out of SKU-123?' },
          { intent: 'Seasonal planning', query: 'How many units of the Black T-Shirt do I need to order to survive Q4?' },
          { intent: 'Loss analysis', query: 'How much revenue did we lose last month due to out-of-stock items?' }
        ]
      }
    },
    {
      type: 'FAQs',
      payload: {
        heading: 'Technical FAQs',
        faqs: [
          { q: 'Does Arcli account for days when an item was out of stock?', a: 'Yes. Standard calculators artificially lower your run-rate if you had zero sales due to a stockout. Arcli automatically excludes zero-inventory days from the velocity calculation.' },
          { q: 'Can I set different lead times per supplier?', a: 'Yes, lead times and buffer days can be modeled at the individual vendor or SKU level in the transformation layer.' }
        ]
      }
    }
  ]
};

// ----------------------------------------------------------------------
// 2. INCREASE AOV (PRODUCT BUNDLING)
// ----------------------------------------------------------------------
export const shopifyAovBundling: SEOPageData = {
  path: '/increase-shopify-aov',
  type: 'campaign',
  meta: {
    title: 'Increase Shopify AOV with AI Product Bundling | Arcli',
    description: 'Use Market Basket Analysis to discover exactly which products your customers buy together. Increase your Shopify Average Order Value instantly.',
    keywords: ['increase shopify aov', 'shopify product bundling ai', 'market basket analysis ecommerce'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Increase Shopify AOV Without Spending More on Ads.',
        subtitle: 'Algorithmic Market Basket Analysis',
        description: 'Customer acquisition is expensive. Arcli analyzes millions of order combinations to reveal the exact product bundles that will instantly increase your Average Order Value (AOV).',
        primaryCta: { text: 'Analyze AOV', href: '/register' }
      }
    },
    {
      type: 'ExecutiveSummary',
      payload: {
        heading: 'The Math Behind Scaling',
        text: 'When CAC (Customer Acquisition Cost) rises across Meta and Google, the only mathematical escape velocity is raising your AOV. Guessing which products belong together leaves margin on the table. You need deterministic affinity analysis.',
        pillars: [
          { title: 'Affinity Scoring', description: 'Measure the exact correlation between any two SKUs.' },
          { title: 'Margin Protection', description: 'Bundle high-margin accessories with low-margin hero products.' }
        ]
      }
    },
    {
      type: 'ComparisonBlock',
      payload: {
        heading: 'Manual Bundling vs. Arcli AI',
        rows: [
          { feature: 'Methodology', competitor: 'Guessing / Intuition', arcli: 'Apriori Algorithm (Market Basket)' },
          { feature: 'Data Processing', competitor: 'Manual CSV Exports', arcli: 'Real-time via Shopify API' },
          { feature: 'Scale', competitor: 'Top 5 products only', arcli: 'Analyzes 10,000+ SKU combinations' }
        ]
      }
    },
    {
      type: 'FAQs',
      payload: {
        heading: 'Implementation',
        faqs: [
          { q: 'How much order history is required for accurate bundles?', a: 'We recommend at least 1,000 historical orders to achieve statistical significance in the affinity analysis.' },
          { q: 'Does this create the bundles in Shopify?', a: 'Arcli acts as the intelligence layer. We provide the exact SKUs to group; you then implement them using Shopify Native Bundles or a 3rd-party bundling app.' }
        ]
      }
    }
  ]
};

// ----------------------------------------------------------------------
// 3. CUSTOMER SEGMENTATION
// ----------------------------------------------------------------------
export const shopifyCustomerSegmentation: SEOPageData = {
  path: '/shopify-customer-segmentation',
  type: 'campaign',
  meta: {
    title: 'Advanced Shopify Customer Segmentation & RFM | Arcli',
    description: 'Identify your VIPs, At-Risk buyers, and one-hit wonders. Arcli provides automated RFM customer segmentation for Shopify stores.',
    keywords: ['shopify customer segmentation', 'rfm analysis shopify', 'ecommerce audience targeting'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Know Exactly Who Your Best Buyers Are.',
        subtitle: 'Automated RFM Customer Segmentation',
        description: 'Stop treating all your customers the same. Arcli automatically segments your Shopify buyers by Recency, Frequency, and Monetary value so you can target them profitably.',
        primaryCta: { text: 'Segment Customers', href: '/register' }
      }
    },
    {
      type: 'UseCaseBlock',
      payload: {
        heading: 'Stop Mass-Discounting. Start Segmenting.',
        useCases: [
          { title: 'The VIP "Whales"', description: 'Identify the top 5% of customers driving 40% of your revenue. Exclude them from discount ladders to protect margins.' },
          { title: 'The "At-Risk" Churners', description: 'Spot users who used to buy monthly but haven\'t purchased in 60 days. Hit them with aggressive win-back flows.' },
          { title: 'The One-Hit Wonders', description: 'Isolate buyers who purchased during Black Friday and never returned. Analyze which gateway products lead to dead-ends.' }
        ]
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'Conversational Segmentation',
        examples: [
          { intent: 'Win-back targeting', query: 'Show me all customers who spent over $500 total but haven\'t ordered in the last 4 months.' },
          { intent: 'Cross-selling', query: 'List customers who bought the Cleanser but never bought the Moisturizer.' }
        ]
      }
    }
  ]
};

// ----------------------------------------------------------------------
// 4. COHORT ANALYSIS
// ----------------------------------------------------------------------
export const shopifyCohortAnalysis: SEOPageData = {
  path: '/shopify-cohort-analysis',
  type: 'campaign',
  meta: {
    title: 'Automated Shopify Cohort Analysis & Retention | Arcli',
    description: 'Understand customer retention and lifetime value with automated Shopify cohort tracking. Ditch Excel and let AI build your layer-cake charts.',
    keywords: ['shopify cohort analysis', 'shopify retention tracking', 'ecommerce layer cake chart'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Track Customer Retention Like a Data Scientist.',
        subtitle: 'Automated Cohort Matrix Generation',
        description: 'Knowing exactly when your customers come back is the key to scaling profitability. Arcli automatically generates pristine triangular cohort analyses from your raw Shopify data.',
        primaryCta: { text: 'View Cohorts', href: '/register' }
      }
    },
    {
      type: 'ContrarianBanner',
      payload: {
        heading: 'Excel pivot tables are killing your productivity.',
        description: 'Manually joining acquisition dates to subsequent order dates in spreadsheets is prone to error and takes hours. Arcli compiles your retention matrix in milliseconds using SQL window functions.'
      }
    },
    {
      type: 'Features',
      payload: {
        heading: 'Deep Retention Analytics',
        features: [
          { title: 'Month-Over-Month Tracking', description: 'See exactly what percentage of users acquired in January came back to purchase in February, March, and beyond.' },
          { title: 'Subscription vs. One-Off', description: 'Filter your cohorts to instantly compare the lifetime retention of subscribers against one-time purchasers.' },
          { title: 'Revenue Cohorts', description: 'Toggle from percentage-based retention to absolute cumulative revenue to see exactly when a cohort breaks even on CAC.' }
        ]
      }
    },
    {
      type: 'FAQs',
      payload: {
        heading: 'Cohort Mechanics',
        faqs: [
          { q: 'Does it account for refunds in the cohort revenue?', a: 'Yes, net-revenue cohorts automatically subtract refunds to show true realized lifetime value.' },
          { q: 'Can I view weekly cohorts?', a: 'Yes. While monthly is standard, you can dynamically adjust the grouping to weekly cohorts for high-velocity periods like Q4.' }
        ]
      }
    }
  ]
};

// ----------------------------------------------------------------------
// 5. PROFIT MARGIN TRACKER
// ----------------------------------------------------------------------
export const shopifyProfitMarginTracker: SEOPageData = {
  path: '/shopify-profit-margin-tracker',
  type: 'campaign',
  meta: {
    title: 'Real-Time Shopify Profit Margin Tracker | Arcli',
    description: 'Factor in COGS, shipping, discounts, and ad spend to get real-time Shopify profit margin tracking at the SKU level.',
    keywords: ['shopify profit margin tracker', 'true net profit ecommerce', 'shopify cogs calculator'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Know Your Exact Profit. Down to the Penny.',
        subtitle: 'Real-Time Net Profit Tracking',
        description: 'Top-line revenue is a vanity metric. Arcli ingests your COGS, discounts, returns, and blended ad spend to show you your true net profit across every product line.',
        primaryCta: { text: 'Track Profit', href: '/register' }
      }
    },
    {
      type: 'ExecutiveSummary',
      payload: {
        heading: 'The End of "Blind Scaling"',
        text: 'Scaling ad spend without real-time visibility into unit economics is how ecommerce brands go bankrupt while hitting record revenue. You must track Contribution Margin 2 (CM2) daily.',
        pillars: [
          { title: 'COGS Integration', description: 'Sync costs directly from Shopify or map them via external CSVs.' },
          { title: 'Blended Spend', description: 'Automatically subtract Meta and Google ad spend from gross margin.' }
        ]
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'Instant Profit Queries',
        examples: [
          { intent: 'Bleed detection', query: 'Which 5 products had the lowest net profit margin this month?' },
          { intent: 'Discount impact', query: 'How did the 20% Black Friday discount impact our overall contribution margin?' }
        ]
      }
    }
  ]
};

// ----------------------------------------------------------------------
// 6. CUSTOM REPORTS
// ----------------------------------------------------------------------
export const shopifyCustomReports: SEOPageData = {
  path: '/shopify-custom-reports',
  type: 'campaign',
  meta: {
    title: 'AI Custom Report Builder for Shopify | Arcli',
    description: 'Ditch the CSV exports. Use Arcli\'s natural language AI to build boardroom-ready custom Shopify reports in seconds.',
    keywords: ['shopify custom reports', 'ai report builder shopify', 'custom data tables ecommerce'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Build Custom Shopify Reports in Seconds.',
        subtitle: 'The Natural Language Report Builder',
        description: 'Need a highly specific breakdown of sales by region, discount code, and UTM parameter? Just ask Arcli. We generate custom, boardroom-ready reports instantly via Text-to-SQL.',
        primaryCta: { text: 'Start Building', href: '/register' }
      }
    },
    {
      type: 'KeywordAnchorBlock',
      payload: {
        heading: 'The Death of the CSV Export',
        text: 'Exporting "Orders.csv", opening it in Excel, cleaning the data, and running VLOOKUPs is a workflow from 2015. Arcli translates your English questions into perfectly executed database queries on the fly.'
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'From Question to Data Table Instantly',
        examples: [
          { intent: 'Geographic Analysis', query: 'Create a report of all orders over $100 in California that used the code SUMMER20.' },
          { intent: 'Fulfillment Auditing', query: 'Show me all unfulfilled orders older than 5 days, grouped by shipping country.' },
          { intent: 'Discount Auditing', query: 'Break down last month’s revenue by specific discount codes used.' }
        ]
      }
    },
    {
      type: 'InternalLinkingBlock',
      payload: {
        heading: 'Explore More Shopify Analytics',
        slugs: [
          '/shopify-cohort-analysis',
          '/shopify-profit-margin-tracker',
          '/shopify-inventory-forecasting'
        ]
      }
    }
  ]
};