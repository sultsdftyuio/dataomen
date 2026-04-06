// lib/seo/shopify-campaign.tsx

import { SEOPageData } from './index';

/**
 * 🚀 V13 SEO UPGRADE: Shopify Campaigns
 * Architecture: Deep Semantic Density + Information Gain
 * Optimized for: 8-Figure Operator Intent, Conversion, SERP Realism, E-E-A-T.
 */

// ----------------------------------------------------------------------
// 1. INVENTORY FORECASTING
// ----------------------------------------------------------------------
export const shopifyInventoryForecasting: SEOPageData = {
  path: '/shopify-inventory-forecasting',
  type: 'campaign',
  meta: {
    title: 'Shopify Inventory Forecasting & Restock Alerts AI | Arcli',
    description: 'Stop losing revenue to stockouts. Arcli analyzes your Shopify sales velocity, excludes out-of-stock days, and calculates predictive inventory forecasts.',
    keywords: ['shopify inventory forecasting', 'shopify restock alerts', 'predictive inventory ai', 'ecommerce run-rate calculator'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Never Run Out of Your Best Sellers Again.',
        subtitle: 'Algorithmic Shopify Inventory Forecasting',
        description: 'Arcli monitors your Shopify sales velocity in real-time. Get predictive inventory forecasting that mathematically accounts for seasonality and supplier lead times before you lose a single dollar to a stockout.',
        primaryCta: { text: 'Connect Shopify', href: '/register' }
      }
    },
    {
      type: 'ContrarianBanner',
      payload: {
        heading: 'Stockouts aren’t a supply chain problem. They are a data latency problem.',
        description: 'Relying on trailing 30-day averages in a spreadsheet guarantees you will over-order during a slump or stock out during a spike. Furthermore, naive calculators don\'t exclude the days you were out of stock, artificially deflating your actual velocity. You need dynamic, anomaly-aware run-rate calculations.'
      }
    },
    {
      type: 'Features',
      payload: {
        heading: 'Predictive Inventory Intelligence',
        features: [
          {
            title: 'Dynamic Run-Rate Calculation',
            description: 'Arcli ingests your daily order volume and automatically adjusts sales velocity based on recent micro-trends, explicitly ignoring days where inventory was zero to prevent distorted velocity metrics.'
          },
          {
            title: 'Lead-Time Aware PO Alerts',
            description: 'Input your supplier lead times and safety buffer days. Arcli calculates the exact date you need to place a Purchase Order (PO) so inventory arrives precisely as your current stock depletes.'
          },
          {
            title: 'Opportunity Cost & Loss Analysis',
            description: 'Instantly visualize exactly how much Gross Profit (GP) you are bleeding per day on out-of-stock SKUs, allowing you to mathematically justify expensive expedited air freight over sea freight.'
          }
        ]
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'Ask Arcli Anything About Your Supply Chain',
        examples: [
          { intent: 'Velocity Check', query: 'Based on last week’s velocity, on what exact date will we run out of SKU-123?' },
          { intent: 'PO Planning', query: 'Assuming a 45-day lead time, how many units of the Black T-Shirt do I need to order today to survive Q4?' },
          { intent: 'Bleed Analysis', query: 'How much gross profit did we lose last month strictly due to out-of-stock items?' }
        ]
      }
    },
    {
      type: 'FAQs',
      payload: {
        heading: 'Technical FAQs',
        faqs: [
          { q: 'Does Arcli account for days when an item was out of stock?', a: 'Yes. Standard calculators artificially lower your run-rate if you had zero sales due to a stockout. Arcli automatically excludes zero-inventory days from the velocity calculation.' },
          { q: 'Can I set different lead times per supplier?', a: 'Yes, lead times and buffer days can be modeled at the individual vendor, category, or individual SKU level in the data transformation layer.' },
          { q: 'Does it factor in bundles?', a: 'Yes, Arcli unpacks Shopify bundles to forecast component-level inventory velocity.' }
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
    title: 'Increase Shopify AOV with Market Basket Analysis | Arcli',
    description: 'Use the Apriori algorithm and Market Basket Analysis to discover exactly which products your customers buy together. Increase your Shopify AOV profitably.',
    keywords: ['increase shopify aov', 'shopify product bundling ai', 'market basket analysis ecommerce', 'apriori algorithm shopify'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Increase Shopify AOV Without Spending More on Ads.',
        subtitle: 'Algorithmic Market Basket Analysis',
        description: 'Customer acquisition is too expensive to rely on guessing. Arcli analyzes millions of order combinations using Market Basket Analysis to reveal the exact product bundles that will mathematically increase your Average Order Value (AOV).',
        primaryCta: { text: 'Analyze AOV Math', href: '/register' }
      }
    },
    {
      type: 'ExecutiveSummary',
      payload: {
        heading: 'The Math Behind Scaling Profitably',
        text: 'When CAC (Customer Acquisition Cost) rises across Meta and Google, the only mathematical escape velocity is raising your AOV. But arbitrary bundles destroy margins. You need deterministic affinity analysis to pair high-margin accessories with high-volume hero SKUs.',
        pillars: [
          { title: 'Affinity Scoring (Apriori)', description: 'Measure the exact statistical correlation (Confidence and Lift) between any two SKUs in your catalog.' },
          { title: 'Margin Protection', description: 'Automatically flag bundles that increase top-line AOV but degrade Contribution Margin.' }
        ]
      }
    },
    {
      type: 'ComparisonBlock',
      payload: {
        heading: 'Manual Bundling vs. Arcli AI',
        rows: [
          { feature: 'Methodology', competitor: 'Guessing / Intuition', arcli: 'Apriori Algorithm (Market Basket)' },
          { feature: 'Data Processing', competitor: 'Manual CSV Exports & VLOOKUPs', arcli: 'Real-time via Shopify Admin API' },
          { feature: 'Scale', competitor: 'Top 5 products only', arcli: 'Analyzes 10,000+ SKU combinations instantly' },
          { feature: 'Margin Awareness', competitor: 'Blind to COGS', arcli: 'Calculates net-profit of the combined bundle' }
        ]
      }
    },
    {
      type: 'FAQs',
      payload: {
        heading: 'Implementation & Logic',
        faqs: [
          { q: 'How much order history is required for accurate bundles?', a: 'We recommend at least 1,000 historical orders to achieve statistical significance and eliminate anomaly noise in the affinity analysis.' },
          { q: 'Does this physically create the bundles in Shopify?', a: 'Arcli acts as the Intelligence Layer. We provide the exact SKUs to group and the projected revenue impact; you then implement them using Shopify Native Bundles or your preferred 3rd-party bundling app.' }
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
    keywords: ['shopify customer segmentation', 'rfm analysis shopify', 'ecommerce audience targeting', 'shopify customer lifetime value'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Know Exactly Who Your Most Profitable Buyers Are.',
        subtitle: 'Automated RFM Customer Segmentation',
        description: 'Stop treating all your customers the same. Arcli automatically segments your Shopify buyers by Recency, Frequency, and Monetary (RFM) value so you can target them based on real behavior, not guesswork.',
        primaryCta: { text: 'Segment Customers', href: '/register' }
      }
    },
    {
      type: 'UseCaseBlock',
      payload: {
        heading: 'Stop Mass-Discounting. Start Segmenting.',
        useCases: [
          { title: 'The VIP "Whales"', description: 'Identify the top 5% of customers driving 40% of your revenue. Exclude them from your generic discount ladders to protect margins—they are price insensitive.' },
          { title: 'The "At-Risk" Churners', description: 'Spot users who used to buy monthly but haven\'t purchased in 60 days. Hit them with aggressive, high-discount win-back flows before they are gone forever.' },
          { title: 'The One-Hit Wonders', description: 'Isolate buyers who purchased heavily discounted items during Black Friday and never returned. Analyze which gateway products lead to these dead-ends.' }
        ]
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'Conversational Data Segmentation',
        examples: [
          { intent: 'Win-back targeting', query: 'Show me all customers who spent over $500 total but haven\'t ordered a single item in the last 4 months.' },
          { intent: 'Cross-selling', query: 'List customers who bought the Cleanser but never bought the Moisturizer, and give me their emails.' },
          { intent: 'Whale Hunting', query: 'Who are the top 100 customers by total gross profit, and what was their first product purchased?' }
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
    keywords: ['shopify cohort analysis', 'shopify retention tracking', 'ecommerce layer cake chart', 'LTV to CAC ratio shopify'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Track Customer Retention Like a Data Scientist.',
        subtitle: 'Automated Cohort Matrix Generation',
        description: 'Knowing exactly when your customers come back is the key to scaling ad spend safely. Arcli automatically generates pristine triangular cohort analyses and layer-cake charts from your raw Shopify data.',
        primaryCta: { text: 'View Your Cohorts', href: '/register' }
      }
    },
    {
      type: 'ContrarianBanner',
      payload: {
        heading: 'Excel pivot tables are killing your growth velocity.',
        description: 'Manually joining acquisition dates to subsequent order dates in spreadsheets is prone to error, breaks at scale, and takes hours. Arcli compiles your retention matrix in milliseconds using advanced SQL window functions under the hood.'
      }
    },
    {
      type: 'Features',
      payload: {
        heading: 'Deep Retention Analytics',
        features: [
          { title: 'Month-Over-Month Tracking', description: 'See exactly what percentage of users acquired in January came back to purchase in February, March, and beyond. Spot churn immediately.' },
          { title: 'Subscription vs. One-Off', description: 'Filter your cohorts to instantly compare the lifetime retention of active subscribers against one-time purchasers.' },
          { title: 'Revenue & Margin Cohorts', description: 'Toggle from percentage-based retention to absolute cumulative gross margin to see exactly when a specific monthly cohort breaks even on CAC.' }
        ]
      }
    },
    {
      type: 'FAQs',
      payload: {
        heading: 'Cohort Mechanics',
        faqs: [
          { q: 'Does it account for refunds in the cohort revenue?', a: 'Yes, net-revenue cohorts automatically subtract refunds, returns, and chargebacks to show true realized lifetime value.' },
          { q: 'Can I view weekly or daily cohorts?', a: 'Yes. While monthly is standard for long-term LTV, you can dynamically adjust the grouping to weekly cohorts for high-velocity periods like BFCM.' }
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
    title: 'Real-Time Shopify Profit Margin Tracker (CM2) | Arcli',
    description: 'Factor in COGS, shipping, discounts, and ad spend to get real-time Shopify profit margin (CM2) tracking at the SKU level.',
    keywords: ['shopify profit margin tracker', 'true net profit ecommerce', 'shopify cogs calculator', 'CM2 tracking shopify'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Know Your Exact Profit. Down to the Penny.',
        subtitle: 'Real-Time Net Profit & CM2 Tracking',
        description: 'Top-line revenue is a vanity metric. Arcli ingests your COGS, shipping, discounts, returns, and blended ad spend to show you your true Contribution Margin (CM2) across every order.',
        primaryCta: { text: 'Track True Profit', href: '/register' }
      }
    },
    {
      type: 'ExecutiveSummary',
      payload: {
        heading: 'The End of "Blind Scaling"',
        text: 'Scaling ad spend without real-time visibility into unit economics is how 8-figure ecommerce brands go bankrupt while hitting record revenue. You must track Contribution Margin 2 (CM2) daily to ensure you aren\'t paying to acquire unprofitable customers.',
        pillars: [
          { title: 'COGS Integration', description: 'Sync cost of goods directly from Shopify inventory or map them via external historical CSVs.' },
          { title: 'Blended Spend', description: 'Automatically subtract Meta, Google, and TikTok ad spend from your gross margin to reveal true net.' },
          { title: 'Discount Auditing', description: 'See exactly how much margin is being destroyed by stackable discount codes and influencer promos.' }
        ]
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'Instant Profit Queries',
        examples: [
          { intent: 'Bleed detection', query: 'Which 5 products had the lowest net profit margin this month after accounting for COGS and discounts?' },
          { intent: 'Promo Impact', query: 'How did the 20% Black Friday discount impact our overall contribution margin compared to October?' },
          { intent: 'Shipping Loss', query: 'Show me all orders where the cost of shipping exceeded our gross margin on the items.' }
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
    description: 'Ditch the CSV exports. Use Arcli\'s natural language AI to build boardroom-ready custom Shopify reports in seconds via Text-to-SQL.',
    keywords: ['shopify custom reports', 'ai report builder shopify', 'custom data tables ecommerce', 'text to sql shopify'],
  },
  blocks: [
    {
      type: 'Hero',
      payload: {
        title: 'Build Complex Shopify Reports in Seconds.',
        subtitle: 'The Natural Language Report Builder',
        description: 'Need a highly specific breakdown of sales by region, discount code, and UTM parameter? Just ask Arcli. We generate custom, boardroom-ready reports instantly using deterministic Text-to-SQL.',
        primaryCta: { text: 'Start Building Reports', href: '/register' }
      }
    },
    {
      type: 'KeywordAnchorBlock',
      payload: {
        heading: 'The Death of the CSV Export',
        text: 'Exporting "Orders.csv", opening it in Excel, cleaning the data, and running VLOOKUPs is a workflow from 2015. It is static the moment you download it. Arcli translates your English questions into perfectly executed database queries on your live Shopify schema.'
      }
    },
    {
      type: 'QueryExamplesBlock',
      payload: {
        heading: 'From Question to Data Table Instantly',
        examples: [
          { intent: 'Geographic Analysis', query: 'Create a report of all orders over $100 in California that used the code SUMMER20, grouped by city.' },
          { intent: 'Fulfillment Auditing', query: 'Show me all unfulfilled orders older than 5 days, grouped by shipping country and sorted by order value.' },
          { intent: 'Discount Auditing', query: 'Break down last month’s revenue by specific discount codes used, including the total COGS for those orders.' }
        ]
      }
    },
    {
      type: 'InternalLinkingBlock',
      payload: {
        heading: 'Explore More Shopify Analytics Workflows',
        slugs: [
          '/shopify-cohort-analysis',
          '/shopify-profit-margin-tracker',
          '/shopify-inventory-forecasting',
          '/increase-shopify-aov'
        ]
      }
    }
  ]
};