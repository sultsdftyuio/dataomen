/**
 * SEO v13 SYSTEM: Compliance Standards (Part 2)
 * * SERP Realism Layer: 
 * - Target: Position 1 for "SOC2 AI analytics", "HIPAA compliant AI BI", "Row-level security AI", "Identity passthrough AI query".
 * * Strict Typing applied per Rule 21: dataMapping is strictly an object, rows use category/arcliAdvantage/legacy, SecurityGuardrails uses items.
 */

export const complianceStandardsPart2 = {
  "soc2-hipaa-ai-analytics": {
    path: "/compliance/soc2-hipaa",
    meta: {
      title: "SOC2 & HIPAA Compliant AI Analytics | Arcli",
      description: "Deploy generative AI BI without risking PHI or PII exposure. Arcli's zero-data-movement architecture is natively built for SOC2, HIPAA, and GDPR compliance.",
      keywords: [
        "SOC2 compliant AI analytics", 
        "HIPAA compliant AI BI", 
        "Healthcare AI analytics", 
        "Secure generative BI", 
        "No PHI exfiltration AI"
      ],
      serpRealism: {
        primaryTarget: "HIPAA compliant AI BI",
        difficulty: "Medium-High",
        intent: "Commercial / Trust & Safety Verification"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "Enterprise Security",
          title: "Generative AI Built for Healthcare & Finance.",
          subtitle: "Stop sending your most sensitive data to vendor clouds. Arcli translates natural language into SQL using only your schema metadata. The actual rows of PII and PHI never leave your infrastructure.",
          primaryCta: { label: "Read the Whitepaper", href: "/resources/security-whitepaper" },
          secondaryCta: { label: "Contact Sales", href: "/contact" },
          trustSignals: [
            "SOC2 Type II Certified",
            "HIPAA Compliant Architecture",
            "GDPR / CCPA Ready"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "How Arcli Solves the LLM Privacy Paradox",
          text: "The greatest risk in deploying **Healthcare AI analytics** is the inadvertent exposure of Protected Health Information (PHI). Generic AI tools ingest raw data to answer questions, creating massive compliance liabilities. Arcli fundamentally bypasses this. To deliver **HIPAA compliant AI BI**, Arcli only sends structural database metadata (table schemas, data types) to the LLM. The AI generates dialect-perfect SQL, which is executed securely inside your VPC. Your raw data never touches the generative model, ensuring automated **SOC2 compliant AI analytics** out of the box.",
          semanticEntities: ["Healthcare AI analytics", "PHI", "HIPAA compliant AI BI", "database metadata", "VPC", "SOC2 compliant AI analytics"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "SecurityFlowchart",
          dataMapping: {
            title: "Metadata-Only AI Generation Flow",
            steps: [
              { title: "User Prompt", description: "A clinician asks: 'What is the average recovery time for knee replacements this quarter?'" },
              { title: "Metadata Context", description: "Arcli sends the prompt + database schema (NO patient data) to the LLM." },
              { title: "SQL Generation", description: "The LLM returns an optimized SQL query designed for the hospital's specific warehouse." },
              { title: "VPC Execution", description: "The SQL executes entirely within the hospital's secure network. PHI never leaves." }
            ]
          },
          interactionPurpose: "Step-by-step technical proof that raw data is decoupled from the language model, satisfying InfoSec auditor requirements.",
          intentServed: "Architectural Validation for InfoSec & Compliance Teams."
        }
      },
      {
        type: "InformationGain",
        payload: {
          uniqueInsight: "Most competitors attempt to mask or redact PII/PHI before sending it to an LLM. This is computationally expensive and error-prone. Arcli simply doesn't send the data at all. By generating the query rather than analyzing the data, compliance is architecturally guaranteed, not algorithmically approximated.",
          structuralAdvantage: "Pivots the conversation from 'How strong is your encryption?' to 'We don't hold your data to begin with.'"
        }
      },
      {
        type: "ComparisonBlock",
        payload: {
          title: "Compliance by Design vs. Compliance by Patchwork",
          description: "Why Arcli clears InfoSec reviews months faster than generic BI wrappers.",
          visualizationType: "ComparisonMatrix",
          columns: ["Compliance Vector", "Arcli (Zero-Copy)", "Legacy Cloud BI"],
          rows: [
            { category: "PHI/PII Movement", arcliAdvantage: "Remains inside Client VPC", legacy: "Duplicated to Vendor Servers" },
            { category: "LLM Data Exposure", arcliAdvantage: "Schema Metadata Only", legacy: "Raw Data Ingested for Context" },
            { category: "Data Residency", arcliAdvantage: "Native to Client Cloud Region", legacy: "Subject to Vendor Cloud Region" },
            { category: "Audit Trail", arcliAdvantage: "Cryptographic SQL Logging", legacy: "Application-level clicks only" }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["SoftwareApplication", "WebPage"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "SoftwareApplication",
                "name": "Arcli Healthcare AI Analytics",
                "applicationCategory": "BusinessApplication",
                "securityClearance": "SOC2, HIPAA",
                "description": "HIPAA and SOC2 compliant AI analytics platform utilizing metadata-only LLM context generation."
              }
            ]
          }
        }
      }
    ]
  },

  "rbac-row-level-security-ai": {
    path: "/compliance/row-level-security",
    meta: {
      title: "AI Analytics with Row-Level Security & RBAC | Arcli",
      description: "Bring your own database permissions. Arcli natively inherits your Row-Level Security (RLS) and Role-Based Access Control (RBAC) via identity passthrough.",
      keywords: [
        "AI analytics row level security", 
        "RBAC AI BI", 
        "Identity passthrough AI query", 
        "Secure AI tenant architecture", 
        "Database RLS AI"
      ],
      serpRealism: {
        primaryTarget: "AI analytics row level security",
        difficulty: "High",
        intent: "Technical Investigation / Architecture Feasibility"
      }
    },
    blocks: [
      {
        type: "Hero",
        payload: {
          badge: "Identity & Access",
          title: "The AI Only Sees What the User Sees.",
          subtitle: "Stop rebuilding permissions in your BI layer. Arcli utilizes Identity Passthrough to ensure the AI inherently respects your database's existing Row-Level Security (RLS) and RBAC policies.",
          primaryCta: { label: "Explore the Architecture", href: "/docs/security/rls" },
          secondaryCta: { label: "Start Free Trial", href: "/register" },
          trustSignals: [
            "Native PostgreSQL RLS",
            "Snowflake Secure Views",
            "Okta / Azure AD Integrated"
          ]
        }
      },
      {
        type: "KeywordAnchorBlock",
        payload: {
          heading: "Inherited Security, Zero Duplication",
          text: "Managing permissions across multiple tools creates security drift. If a user shouldn't see European sales data in the database, the AI shouldn't be able to query it either. Arcli solves this by supporting strict **AI analytics row level security**. By utilizing an **identity passthrough AI query** execution model, Arcli impersonates the requesting user at the database level. This means your native database **RBAC AI BI** configurations are enforced automatically. If the LLM hallucinates a query for restricted data, the database simply rejects it.",
          semanticEntities: ["Row level security", "Identity passthrough", "RBAC", "security drift", "AI query execution", "database permissions"]
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "ProcessStepper",
          dataMapping: {
            title: "Identity Passthrough Execution",
            steps: [
              { title: "SSO Authentication", "description": "User logs into Arcli via Okta/Azure AD. Arcli receives a JWT." },
              { title: "Query Generation", "description": "User asks a question. AI generates standard SQL." },
              { title: "Connection Impersonation", "description": "Arcli passes the JWT/Role to the database (e.g., Snowflake 'USE ROLE analyst_eu')." },
              { title: "Native RLS Enforcement", "description": "The database executes the query, automatically filtering rows the user isn't authorized to see." }
            ]
          },
          interactionPurpose: "Visualizes the delegation of authorization from the Arcli application layer down to the hardened database layer.",
          intentServed: "Technical architectural validation for Data Engineers."
        }
      },
      {
        type: "StrategicQuery",
        payload: {
          title: "How Arcli Triggers PostgreSQL RLS",
          description: "When Arcli executes a generated query against a Postgres database, it seamlessly injects the authenticated user's context into the session parameters before running the generated SQL. This guarantees absolute enforcement of your predefined Row-Level Security policies.",
          businessOutcome: "Eliminates the need to maintain redundant permission logic in the BI tool. Security policies are defined once in the database and inherited globally.",
          language: "sql",
          code: `
-- Arcli Execution Wrapper (Identity Passthrough)
BEGIN;

-- 1. Set the local role to the authenticated Arcli user
SET LOCAL ROLE arcli_standard_user;

-- 2. Inject the specific user's identity into the session context
SET LOCAL request.jwt.claim.email = 'john.doe@company.com';
SET LOCAL request.jwt.claim.region = 'EMEA';

-- 3. Execute the AI-Generated Query
-- (RLS automatically filters rows where region != 'EMEA')
SELECT 
    product_line,
    SUM(revenue) as total_revenue
FROM 
    production.sales_data
WHERE 
    quarter = 'Q3 2024'
GROUP BY 
    product_line;

COMMIT;`
        }
      },
      {
        type: "UIBlock",
        payload: {
          visualizationType: "SecurityGuardrails",
          dataMapping: {
            title: "Zero-Trust Access Controls",
            items: [
              { title: "OAuth / JWT Passthrough", description: "Pass end-user identities directly to Snowflake, BigQuery, and Databricks." },
              { title: "Native RLS Inheritance", description: "Zero permission replication required. RLS is enforced at the compute layer." },
              { title: "Dynamic Data Masking", description: "Compatible with database-native dynamic column masking for PII fields." },
              { title: "Query Execution Timeouts", description: "Hard limits on execution times and compute cluster sizes per RBAC role." }
            ]
          },
          interactionPurpose: "High-contrast scanning of key security features.",
          intentServed: "Rapid qualification by security engineering teams."
        }
      },
      {
        type: "InternalLinkingBlock",
        payload: {
          title: "Related Architecture Deep Dives",
          links: [
            { label: "Zero-Copy Analytics", href: "/compliance/zero-copy-analytics", description: "Why data movement is the enemy of security." },
            { label: "AI Query Auditing", href: "/compliance/query-auditing", description: "Cryptographic logging of all AI activity." },
            { label: "PostgreSQL Setup Guide", href: "/docs/integrations/postgresql/rls", description: "How to configure RLS for Arcli." }
          ]
        }
      },
      {
        type: "StructuredDataBlock",
        payload: {
          schemaType: ["Article", "TechArticle"],
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "TechArticle",
                "headline": "Implementing Row-Level Security in AI Analytics",
                "description": "Detailed guide on how Arcli utilizes Identity Passthrough to enforce native database Row-Level Security (RLS) in Generative AI BI workflows.",
                "proficiencyLevel": "Expert"
              }
            ]
          }
        }
      }
    ]
  }
};