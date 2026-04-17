// -----------------------------------------------------------------------------
// V14 REFACTORED: dashboardTemplatesPart2
// -----------------------------------------------------------------------------
import type { TemplateBlueprint } from './templates-1';

export const dashboardTemplatesPart2: Record<string, TemplateBlueprint> = {
  'marketing-dashboard-template': {
    id: 'mkt-blueprint-003',
    type: 'template',
    metadata: {
      title: 'Marketing Dashboard Template (CAC, ROAS, LTV SQL) | Arcli',
      description: 'Track true marketing ROI by connecting ad spend to real revenue. Free SQL templates for CAC, ROAS, and attribution across Google Ads, Meta, and CRM data.',
      canonicalDomain: 'arcli.tech',
      keywords: ['marketing dashboard template', 'true roas calculation', 'blended cac sql', 'marketing attribution dashboard', 'ga4 alternative sql', 'ltv to cac ratio'],
      intent: 'template'
    },
    schemaOrg: {
      type: 'SoftwareApplication',
      primaryEntity: 'SQL Marketing Analytics'
    },
    blocks: [
      {
        type: 'Hero',
        data: {
          h1: 'Marketing Dashboard Template (CAC, ROAS, LTV SQL)',
          subtitle: 'Track true marketing ROI by connecting ad spend directly to real CRM revenue. Includes ready-to-use SQL templates for Blended CAC, True ROAS, and multi-touch attribution.',
          iconName: 'Users' // Mapped at render layer
        }
      },
      {
        type: 'InformationGain',
        data: {
          uniqueInsight: 'Ad platforms (Google Ads, Meta) inflate their own conversion numbers, leading to over-reported ROI. Arcli acts as an instant semantic bridge, joining ad spend directly with your CRM bypassing GA4.',
          structuralAdvantage: 'WASM-Powered Cross-Platform Joins for instant Blended CAC Tracking.',
          immediateValue: [
            'Copy and paste SQL queries for CAC, ROAS, and attribution.',
            'Blend Google Ads and Meta spend with Stripe/CRM revenue instantly.',
            'Eliminate manual spreadsheet reconciliation and VLOOKUPs.'
          ]
        }
      },
      {
        type: 'ComparisonMatrix',
        rows: [
          { category: 'Revenue Attribution', legacy: 'Probabilistic / Session-based (GA4)', arcliAdvantage: 'Exact (SQL-based from CRM)' },
          { category: 'B2B CRM Integration', legacy: 'Limited / High-friction', arcliAdvantage: 'Native & Seamless' },
          { category: 'Custom Logic / SQL Access', legacy: 'No direct querying', arcliAdvantage: 'Full SQL & AI Querying' }
        ]
      },
      {
        type: 'ArchitectureDiagram',
        data: {
          title: 'Break the Marketing Analytics Silo',
          timeToValue: '< 5 minutes',
          steps: [
            { title: 'Connect Spend & Revenue', description: 'Securely link your ad-spend warehouses alongside your transactional CRM or billing datasets.' },
            { title: 'The Semantic Bridge', description: 'Arcli automatically maps front-end UTM parameters with back-end customer IDs.' },
            { title: 'Run & Reallocate', description: 'Execute plain-English queries to evaluate true ROAS instantly.' }
          ]
        }
      },
      {
        type: 'AnalyticsDashboard',
        data: [
          {
            level: 'Basic',
            title: 'Blended CAC by Acquisition Channel',
            description: 'Calculate exactly how much it costs to acquire a paying customer, combining spend across all platforms.',
            dialect: 'postgresql',
            code: `WITH spend_attr AS (
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
  s.utm_source, s.total_spend, c.new_customers,
  ROUND(s.total_spend / NULLIF(c.new_customers, 0), 2) AS blended_cac
FROM spend_attr s JOIN conversions c USING (utm_source) ORDER BY blended_cac ASC;`,
            businessOutcome: 'Immediately reveals which channels burn cash and which generate profitable customers.'
          },
          {
            level: 'Strategic',
            title: 'LTV:CAC Ratio by Cohort',
            description: 'The ultimate growth metric: dividing the lifetime value of a customer cohort by their exact acquisition cost.',
            dialect: 'postgresql',
            code: `WITH cohort_spend AS (
  SELECT SUM(spend) as total_cac_spend FROM consolidated_ad_spend
  WHERE date >= '2024-01-01' AND date < '2024-04-01' AND channel = 'Paid Social'
),
cohort_customers AS (
  SELECT COUNT(DISTINCT u.id) as acquired_customers, SUM(c.amount_captured) as lifetime_revenue
  FROM users u JOIN stripe_charges c ON u.stripe_customer_id = c.customer
  WHERE u.created_at >= '2024-01-01' AND u.created_at < '2024-04-01' 
    AND u.utm_source IN ('facebook', 'linkedin', 'tiktok') AND c.status = 'succeeded'
)
SELECT 
  s.total_cac_spend / NULLIF(c.acquired_customers, 0) AS cohort_cac,
  c.lifetime_revenue / NULLIF(c.acquired_customers, 0) AS cohort_ltv,
  ROUND((c.lifetime_revenue / NULLIF(c.acquired_customers, 0)) / NULLIF((s.total_cac_spend / NULLIF(c.acquired_customers, 0)), 0), 2) AS ltv_to_cac_ratio
FROM cohort_spend s CROSS JOIN cohort_customers c;`,
            businessOutcome: 'Delivers the golden 3:1 ratio proof to investors to scale paid acquisition.'
          }
        ]
      },
      {
        type: 'SecurityGuardrails',
        items: [
          { title: 'Zero-Copy Architecture', description: 'Arcli pushes compute down to your warehouse. Sensitive CRM data is never duplicated.' },
          { title: 'PII Sanitization', description: 'Emails and IP addresses are hashed or excluded from the LLM context window.' }
        ]
      },
      {
        type: 'FAQ',
        items: [
          { persona: 'Marketing Director', q: 'Why shouldn\'t I just use GA4?', a: 'GA4 is cookie-reliant. It cannot reliably link a web visit to a B2B CRM deal closing 6 months later. Arcli bridges that gap natively via SQL.' },
          { persona: 'CEO', q: 'Can this verify our marketing agency ROI?', a: 'Yes. By joining agency spend with actual Stripe revenue, you get unmanipulated proof of profitable customers.' }
        ]
      },
      {
        type: 'CTAGroup',
        data: {
          primary: { label: 'Run this SQL in Arcli Instantly', action: 'connect_db', intent: 'Execution' },
          secondary: { label: 'Download Marketing SQL Pack', action: 'download_assets', intent: 'Resource' },
          assets: [
            { type: 'sql', label: 'Marketing SQL Query Pack (.sql)', url: '#', iconName: 'Database' },
            { type: 'pdf', label: 'The True ROAS Calculation Guide', url: '#', iconName: 'Zap' }
          ]
        }
      }
    ]
  },

  'ecommerce-dashboard-template': {
    id: 'ecom-blueprint-004',
    type: 'template',
    metadata: {
      title: 'Shopify Dashboard Template: SQL + Profit Tracking | Arcli',
      description: 'Track true profit, LTV, and inventory in Shopify. Free SQL templates for net margin, repeat purchase rates, and stock forecasting.',
      canonicalDomain: 'arcli.tech',
      keywords: ['shopify analytics dashboard template', 'ecommerce sql queries', 'how to calculate true net margin shopify', 'inventory forecasting sql'],
      intent: 'template'
    },
    schemaOrg: {
      type: 'SoftwareApplication',
      primaryEntity: 'Shopify Analytics SQL Templates'
    },
    blocks: [
      {
        type: 'Hero',
        data: {
          h1: 'Shopify Analytics Dashboard Template (SQL + Profit Tracking)',
          subtitle: 'Track true profit, LTV, and inventory velocity. Includes ready-to-use SQL for net margin calculation and automated stock forecasting.',
          iconName: 'ShoppingCart'
        }
      },
      {
        type: 'InformationGain',
        data: {
          uniqueInsight: 'Native dashboards over-index on Gross Revenue, ignoring shipping costs, returns, and COGS—inflating perceived profitability.',
          structuralAdvantage: 'JSONB-Unnested columnar engines instantly forecast predictive inventory depletion.',
          immediateValue: [
            'Calculate True Net Margin by factoring in COGS and discounts.',
            'Forecast inventory depletion mathematically based on trailing velocity.',
            'Replace manual Excel exports and fragile VLOOKUPs.'
          ]
        }
      },
      {
        type: 'ComparisonMatrix',
        rows: [
          { category: 'Profit Tracking', legacy: 'Gross Revenue focus (Native)', arcliAdvantage: 'True Net Margin (w/ COGS)' },
          { category: 'Data Blending', legacy: 'Siloed to Shopify ecosystem', arcliAdvantage: 'Joins w/ ERP, Ads, and Support' }
        ]
      },
      {
        type: 'ArchitectureDiagram',
        data: {
          title: 'Automate Retail Intelligence',
          timeToValue: '< 5 minutes',
          steps: [
            { title: 'Automated JSON Normalization', description: 'Arcli automatically cleans and un-nests complex Shopify JSON arrays (like line_items).' },
            { title: 'Link Operational Data', description: 'Seamlessly join your transactional line items with external tables like Supplier COGS.' },
            { title: 'Query & Forecast', description: 'Filter and chart massive historical order datasets in sub-seconds.' }
          ]
        }
      },
      {
        type: 'AnalyticsDashboard',
        data: [
          {
            level: 'Basic',
            title: 'True Net Profit Margin by SKU',
            description: 'Calculate actual profit generated after stripping away discounts and base costs.',
            dialect: 'postgresql',
            code: `SELECT 
  li.sku, li.title AS product_name, SUM(li.quantity) AS total_sold,
  SUM((li.price * li.quantity) - li.total_discount - (li.quantity * COALESCE(cogs.unit_cost, 0))) AS net_profit
FROM shopify_order_line_items li
LEFT JOIN inventory_cogs_mapping cogs ON li.sku = cogs.sku
GROUP BY 1, 2 ORDER BY net_profit DESC LIMIT 10;`,
            businessOutcome: 'Shifts merchandising focus away from break-even "loss leaders" toward high-margin items.'
          },
          {
            level: 'Strategic',
            title: 'Predictive Inventory Depletion',
            description: 'Mathematically forecast exact run-out dates based on 14-day trailing velocity.',
            dialect: 'postgresql',
            code: `WITH trailing_velocity AS (
  SELECT sku, SUM(quantity) / 14.0 AS daily_sales_velocity
  FROM shopify_order_line_items WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' GROUP BY sku
)
SELECT 
  i.sku, i.inventory_quantity AS current_stock, tv.daily_sales_velocity,
  ROUND((i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)), 1) AS days_of_inventory_left
FROM shopify_inventory_levels i
JOIN trailing_velocity tv ON i.sku = tv.sku
WHERE (i.inventory_quantity / NULLIF(tv.daily_sales_velocity, 0)) < 30 AND tv.daily_sales_velocity > 0
ORDER BY days_of_inventory_left ASC;`,
            businessOutcome: 'Prevents catastrophic stockouts by enabling proactive reordering perfectly aligned with lead times.'
          }
        ]
      },
      {
        type: 'FAQ',
        items: [
          { persona: 'E-commerce Director', q: 'Can this show true net profit after returns?', a: 'Yes. By mapping COGS and unpacking complex JSON payloads for refunds, Arcli provides exact net profitability.' }
        ]
      },
      {
        type: 'CTAGroup',
        data: {
          primary: { label: 'Sync Shopify to Arcli (Free)', action: 'connect_db', intent: 'Execution' },
          secondary: { label: 'Copy E-commerce SQL Snippets', action: 'copy_code', intent: 'Resource' },
          assets: [
            { type: 'sql', label: 'Shopify SQL Analytics Pack', url: '#', iconName: 'Database' }
          ]
        }
      }
    ]
  }
};