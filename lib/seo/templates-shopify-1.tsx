// lib/seo/templates-shopify-1.tsx

import { TemplateBlueprint } from './index';

/**
 * HEAVY TEMPLATE: Shopify LTV Dashboard
 * High-intent destination focused on business value, visualizations, and immediate ROI.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const shopifyLtvDashboard: TemplateBlueprint = {
  type: 'template',
  seo: {
    title: 'Shopify LTV Dashboard Template | Arcli',
    description: 'Instantly deploy a comprehensive Shopify LTV dashboard. Track historical lifetime value, predict future revenue, and optimize your CAC with pre-built analytics.',
    h1: 'Shopify Customer Lifetime Value (LTV) Dashboard Template',
    keywords: [
      'shopify ltv dashboard', 
      'customer lifetime value template shopify', 
      'ecommerce ltv tracking metrics',
      'shopify revenue forecasting'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Shopify Customer Lifetime Value (LTV) Dashboard',
    subtitle: 'Connect your Shopify store and instantly visualize your true customer lifetime value, segmented by cohort, product, and acquisition channel.',
  },
  immediateValue: {
    heading: 'Stop Guessing Your Allowable CAC',
    description: 'Bypass complex spreadsheet models. This pre-built template automatically normalizes your Shopify order history to visualize your average LTV, time-to-second-purchase, and LTV-to-CAC ratios out of the box.'
  },
  quickStart: {
    heading: 'Deploy in Minutes',
    steps: [
      'Connect your Shopify account via Arcli’s secure OAuth integration.',
      'Select the "Customer Lifetime Value (LTV)" template blueprint.',
      'Arcli automatically extracts, cleans, and models your historical orders into a production-grade dashboard.'
    ]
  },
  conversionRouting: {
    primaryCTA: { label: 'Connect Shopify & Generate', url: '/register?intent=shopify_ltv' },
    secondaryCTA: { label: 'View Interactive Demo', url: '/demo/ecommerce/ltv' },
    parentLink: '/templates',
    internalLinks: ['/templates/shopify-cohort-retention-dashboard', '/integrations/shopify']
  },
  uiVisualizations: [
    {
      type: 'CumulativeLineChart',
      dataMapping: { x: 'months_since_first_purchase', yLines: ['historical_ltv', 'blended_cac'] },
      interactionPurpose: 'Visualize the exact month where a customer cohort becomes profitable (Payback Period).',
      intentServed: 'Determine Allowable CAC for media buying.'
    },
    {
      type: 'BarChart',
      dataMapping: { x: 'first_product_purchased', yBar: 'average_12m_ltv' },
      interactionPurpose: 'Identify "gateway" products that lead to the highest long-term spend.',
      intentServed: 'Product-level acquisition strategy.'
    }
  ],
  analyticalScenarios: [
    {
      title: 'LTV to CAC Ratio Optimization (CFO Persona)',
      description: 'Blend your Shopify revenue data with spend data from Meta and Google Ads to track real-time LTV:CAC ratios, ensuring your marketing scales profitably.'
    },
    {
      title: '"First Product" LTV Mapping (RevOps Persona)',
      description: 'Analyze which specific SKUs, when purchased first, lead to the highest lifetime value. Use this data to heavily subsidize acquisition on high-LTV gateway products.'
    }
  ],
  businessValueAndROI: {
    heading: 'The ROI of LTV Visibility',
    description: 'Brands that optimize for Customer Lifetime Value rather than immediate Return on Ad Spend (ROAS) typically unlock 20-40% more marketing budget. This dashboard provides the mathematical confidence needed to scale your acquisition efforts aggressively while remaining profitable.'
  },
  assets: {
    dashboardPreviewImage: '/images/templates/shopify-ltv-dashboard-preview.png',
  },
  trustAndSecurity: {
    description: 'Read-only access to your Shopify Orders API. Zero PII is stored in the presentation layer. SOC2 Type II compliant.'
  },
  structuredData: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Arcli Shopify LTV Dashboard",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    }
  },
  faqs: [
    {
      q: 'Does this template factor in Shopify transaction fees?',
      a: 'By default, the LTV calculation uses gross merchandise value (GMV) minus refunds. To calculate net-margin LTV, you must map your COGS (Cost of Goods Sold) and payment gateway fees in the Arcli transformation layer.',
      persona: 'CFO'
    },
    {
      q: 'How far back does the historical data ingestion go?',
      a: 'Arcli extracts your entire Shopify order history via bulk operations. Whether you have 1 year or 10 years of data, the historical LTV baseline will represent your absolute all-time metrics.',
      persona: 'Engineer'
    },
    {
      q: 'Can I split LTV by B2B vs D2C customers?',
      a: 'Yes. If you utilize Shopify tags or distinct customer profiles for wholesale (B2B), the dashboard includes global filters to isolate D2C LTV from B2B bulk purchasing behavior.',
      persona: 'RevOps'
    },
    {
      q: 'How is blended CAC calculated if I use multiple ad platforms?',
      a: 'If you connect Meta, Google, and TikTok APIs alongside Shopify, the template automatically aggregates total ad spend and divides it by total new Shopify customers for a true blended CAC.',
      persona: 'CFO'
    }
  ],
  relatedSlugs: [
    'shopify-ltv-sql',
    'shopify-cohort-retention-sql',
    'shopify-rfm-segmentation-sql'
  ]
};

/**
 * HEAVY TEMPLATE: Shopify Cohort Retention Dashboard
 * High-intent destination focused on repeat purchase behavior and product-market fit.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const shopifyCohortRetentionDashboard: TemplateBlueprint = {
  type: 'template',
  seo: {
    title: 'Shopify Cohort Retention Dashboard Template | Arcli',
    description: 'Visualize your ecommerce product-market fit. This Shopify cohort analysis template tracks repeat purchase rates and customer drop-off month over month.',
    h1: 'Shopify Cohort Retention Dashboard Template',
    keywords: [
      'shopify cohort analysis dashboard', 
      'ecommerce retention rate template', 
      'shopify repeat customer analytics',
      'cohort tracking shopify'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Shopify Cohort Retention Dashboard',
    subtitle: 'Automatically group your customers by acquisition month and track exactly when they return to buy again.',
  },
  immediateValue: {
    heading: 'Diagnose Product-Market Fit Instantly',
    description: 'Standard retention rate is a vanity metric. True health is measured in cohorts. This dashboard gives you the classic "Layer Cake" retention chart directly from your Shopify data, zero SQL required.'
  },
  quickStart: {
    heading: 'Deploy in Minutes',
    steps: [
      'Connect your Shopify data source in the Arcli platform.',
      'Deploy the "Cohort Retention & Churn" template.',
      'Review your auto-generated triangular cohort matrix and flattening retention curves.'
    ]
  },
  conversionRouting: {
    primaryCTA: { label: 'Generate Cohort Matrix', url: '/register?intent=shopify_cohort' },
    secondaryCTA: { label: 'Explore the DuckDB SQL', url: '/templates/shopify-cohort-retention-sql' },
    parentLink: '/templates',
    internalLinks: ['/templates/shopify-rfm-segmentation-dashboard']
  },
  uiVisualizations: [
    {
      type: 'TriangularHeatMap',
      dataMapping: { y: 'acquisition_cohort_month', x: 'months_since_first_purchase', colorIntensity: 'retention_percentage' },
      interactionPurpose: 'Instantly spot historical trends in customer drop-off velocity.',
      intentServed: 'Macro product-market fit diagnosis.'
    },
    {
      type: 'StackedAreaChart',
      dataMapping: { x: 'calendar_month', yStack: 'revenue_by_cohort' },
      interactionPurpose: 'Visualize what percentage of current monthly revenue comes from legacy vs. new customers.',
      intentServed: 'Revenue durability assessment.'
    }
  ],
  analyticalScenarios: [
    {
      title: 'Subscription vs. One-off Retention (RevOps Persona)',
      description: 'Filter your cohorts to isolate customers who started with a subscription vs. a one-off purchase to see the true delta in Month 3 and Month 6 retention.'
    },
    {
      title: 'Identifying the "Drop-off Cliff"',
      description: 'Visually pinpoint the exact month where repeat purchase behavior falls off a cliff. Trigger targeted win-back email flows in Klaviyo precisely 15 days prior.'
    }
  ],
  businessValueAndROI: {
    heading: 'The ROI of Cohort Tracking',
    description: 'Increasing customer retention rates by just 5% can increase profits by 25% to 95%. This template transitions your team from "blindly acquiring" to "predictably retaining" by exposing exactly when and why customers churn.'
  },
  assets: {
    dashboardPreviewImage: '/images/templates/shopify-cohort-dashboard-preview.png',
  },
  structuredData: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Arcli Shopify Cohort Analysis",
    "applicationCategory": "BusinessApplication"
  },
  faqs: [
    {
      q: 'Should we look at weekly or monthly cohorts?',
      a: 'Monthly is standard for macro product-market fit. Weekly is only recommended during aggressive paid media testing phases or major holiday sales (e.g., BFCM) to isolate highly specific traffic quality.',
      persona: 'RevOps'
    },
    {
      q: 'How do timezone discrepancies affect cohort bucketing?',
      a: 'The template normalizes all timestamps to UTC by default. You can adjust the presentation layer timezone to match your localized Shopify admin settings to ensure reporting parity.',
      persona: 'Engineer'
    },
    {
      q: 'Are point-of-sale (POS) orders included in these cohorts?',
      a: 'Yes, if they are synced to your primary Shopify instance. You can use the built-in channel filter to separate retail POS retention from online store retention.',
      persona: 'RevOps'
    },
    {
      q: 'What constitutes an "active" customer in a cohort month?',
      a: 'A customer is flagged as active if they placed at least one uncancelled, paid order during that discrete calendar month. Multiple orders in the same month do not inflate the retention percentage.',
      persona: 'CFO'
    }
  ],
  relatedSlugs: [
    'shopify-cohort-retention-sql',
    'shopify-ltv-sql',
    'shopify-rfm-segmentation-sql'
  ]
};

/**
 * HEAVY TEMPLATE: Shopify RFM Dashboard
 * High-intent destination focused on audience segmentation and marketing efficiency.
 * SEO Node: Hub (Links to 3+ LIGHT SQL variations)
 */
export const shopifyRfmDashboard: TemplateBlueprint = {
  type: 'template',
  seo: {
    title: 'Shopify RFM Customer Segmentation Dashboard | Arcli',
    description: 'Deploy an automated RFM (Recency, Frequency, Monetary) dashboard for Shopify. Segment your audience into Champions, At-Risk, and Core groups instantly.',
    h1: 'Shopify RFM Segmentation Dashboard',
    keywords: [
      'shopify rfm dashboard', 
      'ecommerce customer segmentation template', 
      'rfm analysis shopify',
      'automated rfm scoring'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Shopify RFM Segmentation Dashboard',
    subtitle: 'Automatically classify your entire customer base into actionable tiers based on their purchasing behavior, powering highly targeted retention campaigns.',
  },
  immediateValue: {
    heading: 'Turn Raw Data into Actionable Audiences',
    description: 'Stop treating all customers equally. This dashboard automatically scores every customer from 1 to 5 across Recency, Frequency, and Monetary value, placing them into pre-defined strategic segments.'
  },
  quickStart: {
    heading: 'Deploy in Minutes',
    steps: [
      'Connect Shopify to Arcli.',
      'Deploy the "RFM Segmentation" analytical blueprint.',
      'Export the generated segments directly to your ESP or advertising platforms.'
    ]
  },
  conversionRouting: {
    primaryCTA: { label: 'Segment Customers Now', url: '/register?intent=shopify_rfm' },
    secondaryCTA: { label: 'Read the Methodology', url: '/blog/rfm-analysis-ecommerce' },
    parentLink: '/templates',
    internalLinks: ['/templates/shopify-ltv-dashboard']
  },
  uiVisualizations: [
    {
      type: 'TreeMap',
      dataMapping: { hierarchy: 'rfm_segment_name', size: 'customer_count', color: 'average_monetary_value' },
      interactionPurpose: 'Understand the distribution and relative monetary worth of each customer segment.',
      intentServed: 'Audience sizing and prioritization.'
    },
    {
      type: 'ScatterPlot',
      dataMapping: { x: 'recency_days', y: 'frequency_count', bubbleSize: 'monetary_value', color: 'segment' },
      interactionPurpose: 'Visually isolate high-value customers who are nearing churn velocity.',
      intentServed: 'Triggering win-back automations.'
    }
  ],
  analyticalScenarios: [
    {
      title: 'VIP "Champion" Nurture',
      description: 'Identify customers scoring 5-5-5. Exclude them from discount ladders (protecting margins) and invite them to exclusive product drops or loyalty tiers.'
    },
    {
      title: 'Re-activating "At-Risk High-Value" Customers',
      description: 'Spot customers who previously spent heavily but have a low recency score. Deploy aggressive, targeted win-back discounts before they churn completely.'
    }
  ],
  businessValueAndROI: {
    heading: 'Protect Margins & Boost Conversions',
    description: 'Mass discounting destroys profitability. RFM segmentation allows you to reserve aggressive discounts only for price-sensitive or churning cohorts, while serving full-price messaging to your loyal Champions.'
  },
  structuredData: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Arcli Shopify RFM Engine",
    "applicationCategory": "BusinessApplication"
  },
  faqs: [
    {
      q: 'Are the RFM segments updated in real-time?',
      a: 'Scores are recalculated dynamically on a 24-hour cadence to ensure optimal compute efficiency while providing daily accuracy for marketing syncs.',
      persona: 'Engineer'
    },
    {
      q: 'Can we customize the quintile (1-5) logic?',
      a: 'Yes. While the template defaults to standard 20% percentiles (NTILE 5), you can override the thresholds in the logic layer to use absolute dollar amounts or specific day-counts for recency.',
      persona: 'RevOps'
    },
    {
      q: 'How do you handle customers with only one purchase?',
      a: 'Single-purchase customers naturally receive the lowest Frequency score (1). Depending on their Recency and Monetary value, they are typically routed to "Recent Low-Value" or "New Core" segments.',
      persona: 'RevOps'
    },
    {
      q: 'How easy is it to push these segments into Klaviyo?',
      a: 'The dashboard generates standard tabular outputs. You can easily map the `customer_segment` string to a custom property in Klaviyo via Reverse ETL or flat-file export.',
      persona: 'Engineer'
    }
  ],
  relatedSlugs: [
    'shopify-rfm-segmentation-sql',
    'shopify-cohort-retention-sql',
    'shopify-ltv-sql'
  ]
};