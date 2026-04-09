// lib/seo/pillar-snowflake-integration.tsx

import { SEOPageData } from './index';

/**
 * V13 ENFORCED: Enterprise Pillar Page: Snowflake Integration
 * Target Personas: Data Engineers, CISO, Head of Data Architecture
 * Core Narrative: Zero-Data Movement, VPC-native execution, and native dialect optimization.
 * Strictly implements the V13 UI Block Protocol for Next.js static generation.
 */
export const snowflakeIntegrationPillar: SEOPageData = {
  type: 'integration',
  seo: {
    title: 'Snowflake AI Analytics: Zero-Data Movement & Native Compute | Arcli',
    description: 'Architecturally impossible to mutate your Snowflake data. Arcli generates optimized Snowflake SQL and executes entirely within your VPC. No reverse ETL. No semantic layer hallucinations.',
    h1: 'Snowflake AI Analytics Without Data Movement',
    keywords: [
      'Snowflake AI analytics',
      'Zero data movement Snowflake',
      'Snowflake native text-to-sql',
      'Secure LLM Snowflake connection',
      'Snowflake JSON flattening AI',
      'Schema-Only Inference'
    ],
    intent: 'integration',
    canonicalDomain: 'https://arcli.tech/integrations/snowflake'
  },
  hero: {
    badge: 'Enterprise Integration',
    title: 'Analyze Snowflake Without Moving A Single Byte.',
    subtitle: 'Arcli grounds AI directly in your schema to generate dialect-perfect Snowflake SQL. Your data stays in your VPC. We provide the logic; your warehouse provides the compute.',
    primaryCTA: { text: 'Connect Snowflake Securely', href: '/register' },
    secondaryCTA: { text: 'Read the Security Brief', href: '/security' }
  },

  // STRICT BLOCK ARCHITECTURE (V13 Rule 4)
  blocks: [
    {
      type: 'ContrarianBanner',
      statement: 'Moving data out of Snowflake just to analyze it is an architectural failure.',
      subtext: 'Traditional semantic layers and reverse ETL pipelines introduce latency, multiply storage costs, and exponentially increase attack surfaces. The future is compute-in-place. Send the query to the data, not the data to the tool.'
    },
    {
      type: 'InformationGain',
      uniqueInsight: "Generic AI wrappers fail at Snowflake's dynamic JSONB / VARIANT structures. Arcli natively generates LATERAL FLATTEN and specific dot-notation accessors (value:property::STRING), bypassing the need for heavy dbt transformation layers.",
      structuralAdvantage: "By adopting a Compute-In-Place architecture, Arcli mathematically proves zero-data movement to Infosec teams, ensuring your row-level data never egresses to a third-party vector database."
    },
    {
      type: 'UIBlock',
      payload: {
        type: 'ArchitectureDiagram',
        // Strict Data Mapping & Nested Array Requirement (V13 Rule 1 & 2)
        dataMapping: {
          title: 'Schema-Only Inference vs Traditional Reverse ETL',
          steps: [
            {
              title: '1. Metadata Connection',
              description: 'Arcli connects to Snowflake via a strictly scoped read-only role, pulling only table schemas, column types, and foreign keys.'
            },
            {
              title: '2. Zero-Data Intent Generation',
              description: 'The AI uses the schema topology to construct precise Snowflake SQL without ever seeing row-level customer data.'
            },
            {
              title: '3. VPC-Native Execution',
              description: 'The query executes entirely within your Snowflake virtual warehouse compute.'
            },
            {
              title: '4. Aggregate UI Rendering',
              description: 'Only the computed, aggregated results (e.g., total sums) are returned to Arcli to render the frontend visual chart.'
            }
          ]
        }
      }
    },
    {
      type: 'ComparisonMatrix',
      // Strict Table Requirement (V13 Rule 3)
      rows: [
        { category: 'Data Egress', arcliAdvantage: '0MB (Compute-in-Place)', legacy: 'High (Reverse ETL Egress)' },
        { category: 'JSON Handling', arcliAdvantage: 'Native LATERAL FLATTEN', legacy: 'Requires dbt Unnesting Models' },
        { category: 'Access Control', arcliAdvantage: 'Inherits Snowflake RBAC/RLS', legacy: 'Re-implemented in BI Layer' }
      ]
    },
    {
      type: 'SecurityGuardrails',
      // Strict Array Requirement (V13 Rule 3)
      items: [
        {
          title: '100% Zero-Data Movement Guarantee',
          description: 'Unlike traditional BI or reverse-ETL platforms, Arcli never ingests, stores, or caches your row-level data. We strictly process schema metadata to generate execution logic.'
        },
        {
          title: 'Strict Read-Only Architecture',
          description: 'Arcli connects via an explicitly scoped, read-only service account. The platform lacks the architectural capability to execute INSERT, UPDATE, DROP, or DELETE commands.'
        },
        {
          title: 'Native Snowflake RBAC Inheritance',
          description: 'Arcli integrates seamlessly with your existing Snowflake Role-Based Access Control (RBAC) and Row-Level Security (RLS) policies.'
        }
      ]
    },
    {
      type: 'UIBlock',
      payload: {
        type: 'AnalyticsDashboard',
        // Strict Data Mapping (V13 Rule 1 & 2)
        dataMapping: {
          title: 'Native JSON Unpacking & Lateral Flattening',
          description: 'Extract insights from deeply nested JSON payloads (like Shopify webhooks or Stripe metadata) natively in Snowflake without rigid ETL pipelines.',
          dialect: 'Snowflake SQL',
          code: `-- Generated natively by Arcli
SELECT 
  f.value:checkout_id::STRING as checkout_session,
  f.value:customer:email::STRING as customer_email,
  f.value:payment_intent:amount::FLOAT / 100 as transaction_value_usd,
  f.value:metadata:marketing_channel::STRING as acquisition_channel
FROM production.raw.webhook_payloads w,
LATERAL FLATTEN(input => PARSE_JSON(w.payload_body)) f
WHERE w.event_type = 'checkout.session.completed'
  AND f.value:payment_status::STRING = 'paid'
  AND w.ingest_timestamp >= DATEADD('month', -1, CURRENT_TIMESTAMP())
ORDER BY transaction_value_usd DESC;`,
          businessOutcome: 'Bypasses entirely the need for rigid data engineering pipelines. Extracts highly-specific nested metrics on the fly, saving hundreds of engineering hours.'
        }
      }
    }
  ],

  faqs: [
    {
      q: 'Does Arcli store my Snowflake data to train its models?',
      a: 'No. Arcli operates on a strict Zero-Data Movement guarantee. We only analyze your schema definitions (table names, column types, relations) via Schema-Only Inference. Your row-level data is never ingested, cached, or used to train our models.',
      persona: 'CISO'
    },
    {
      q: 'How does Arcli handle deeply nested JSON arrays in Snowflake?',
      a: 'Arcli is highly optimized for Snowflake\'s specific dialect. When it encounters JSON (`VARIANT`) columns, it natively generates `PARSE_JSON`, `LATERAL FLATTEN`, and dot-notation accessors to unpack complex objects directly at query time, bypassing external transformations.',
      persona: 'Data Engineer'
    },
    {
      q: 'Is it possible for Arcli to accidentally delete or alter tables?',
      a: 'It is architecturally impossible. We require you to connect Arcli using a specifically scoped role with strictly read-only permissions. Because the Arcli service account lacks mutation privileges, the database will physically reject any `DROP`, `INSERT`, or `UPDATE` commands.',
      persona: 'Database Administrator'
    },
    {
      q: 'Will Arcli increase my Snowflake compute costs?',
      a: 'Arcli writes highly optimized, dialect-specific SQL (utilizing proper clustering keys and partition pruning). It often replaces poorly optimized human-written queries, reducing warehouse compute load. You can also restrict Arcli\'s execution to a specific, cost-capped virtual warehouse.',
      persona: 'Head of Data'
    }
  ]
};