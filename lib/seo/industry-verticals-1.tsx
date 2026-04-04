// lib/seo/industry-verticals-1.tsx

import { SEOPageData } from './index';

/**
 * SEO Industry Campaign: Healthcare & Life Sciences
 * Target Audience: Chief Medical Information Officers (CMIO), Healthcare CISOs, Data Architects
 * Core Focus: HIPAA Compliance, PHI (Protected Health Information) Security, Zero-Data Movement.
 */
export const healthcareIndustry: SEOPageData = {
  type: 'campaign',
  seo: {
    title: 'HIPAA Compliant AI Analytics & BI | Zero Data Movement | Arcli',
    description: 'Deploy AI on top of your clinical and operational data without moving PHI. Arcli’s read-only architecture generates secure SQL directly in your warehouse.',
    h1: 'HIPAA-Compliant AI Analytics for Healthcare',
    keywords: [
      'HIPAA compliant AI analytics', 
      'Healthcare BI zero data movement', 
      'Patient data AI reporting', 
      'Secure clinical analytics',
      'AI for EHR analytics without ETL',
      'query FHIR data with SQL AI',
      'secure patient data analytics platform',
      'Epic Systems AI reporting',
      'Cerner zero copy analytics',
      'healthcare data lake text-to-sql',
      'CMIO healthcare dashboard AI',
      'hospital readmission predictive analytics',
      'PHI secure data visualization',
      'medical records AI querying',
      'genomic data SQL generator',
      'healthcare text-to-sql architecture',
      'zero data replication healthcare BI',
      'HIPAA BAA AI analytics',
      'clinical trial data matching AI',
      'hospital resource allocation analytics'
    ],
    intent: 'campaign',
    canonicalDomain: 'https://arcli.tech/industries/healthcare'
  },
  hero: {
    badge: 'HEALTHCARE & LIFE SCIENCES',
    title: 'Analyze Patient Data Without Moving PHI.',
    subtitle: 'Extract insights from your EHR and clinical databases securely. Arcli generates the dialect-perfect SQL, but your secure VPC executes it. Zero data replication means zero compliance risk.',
    primaryCTA: { text: 'Schedule a Security Review', href: '/book-demo' },
    secondaryCTA: { text: 'Read the BAA Overview', href: '/compliance' }
  },

  // Cross-page Differentiation Signal: Healthcare Specific Architecture
  complianceStack: {
    standards: ['HIPAA', 'HITECH', 'HITRUST CSF (Inherited)'],
    encryption: ['AES-256 at Rest', 'TLS 1.3 in Transit', 'Zero PHI Persistence'],
    audit: ['Cryptographic Query Hashing', 'End-to-End Execution Logging', 'Automated Anomaly Flagging']
  },

  // Maps to ExecutiveSummary in seo-blocks-3.tsx
  executiveSummary: [
    { value: '0MB', label: 'PHI Replicated' },
    { value: '100%', label: 'HIPAA Compliant' },
    { value: 'VPC', label: 'Native Execution' },
    { value: 'End-to-End', label: 'Audit Logging' }
  ],

  // Maps to ContrarianBanner in seo-blocks-3.tsx
  contrarianBanner: {
    statement: "Copying patient records into a third-party BI cloud is a massive liability.",
    subtext: "Legacy analytics tools force you to build complex ETL pipelines that duplicate sensitive PHI across multiple environments. Arcli fundamentally rejects this. Keep your data in your secure infrastructure; let our AI come to you."
  },

  // Maps to SecurityGuardrails in seo-blocks-3.tsx
  securityGuardrails: [
    {
      title: 'Architectural PHI Protection',
      description: 'Because Arcli only ingests schema metadata (table structures, column names), raw Protected Health Information never touches our servers. We generate the query, but your warehouse handles the actual patient records.'
    },
    {
      title: 'Strict Read-Only Guarantee',
      description: 'We connect to your Epic, Cerner, or custom databases using heavily restricted, Read-Only service accounts. It is programmatically impossible for Arcli to mutate or delete clinical data.'
    },
    {
      title: 'Cryptographic Query Auditing',
      description: 'Every interaction is logged. Healthcare compliance teams have full visibility into exactly what SQL was generated, who requested it, and when it was executed against the database.'
    }
  ],

  // Adapting the Usecase block for Healthcare scenarios
  useCases: {
    title: 'High-Impact Clinical Analytics',
    items: [
      {
        title: 'Hospital Readmission Tracking',
        description: 'Instantly generate reports on 30-day readmission rates filtered by diagnosis codes, attending physicians, or specific wards without waiting weeks for IT to build a dashboard.',
        icon: 'Activity'
      },
      {
        title: 'Resource Allocation & Triage',
        description: 'Analyze real-time ER wait times versus staffing levels to optimize nurse and doctor shifts during peak influenza or local emergency events.',
        icon: 'Users'
      },
      {
        title: 'Clinical Trial Cohort Discovery',
        description: 'Quickly query massive genomic or patient history datasets to identify eligible participants for new trials based on highly specific JSONB inclusion criteria.',
        icon: 'Microscope'
      }
    ]
  },

  // Maps to StrategicQuery in seo-blocks-3.tsx
  strategicScenario: {
    title: 'Postgres JSONB FHIR Analysis',
    description: 'Healthcare data is often stored in complex FHIR (Fast Healthcare Interoperability Resources) JSON blobs. Standard BI tools choke on this. Arcli understands nested JSONB and writes the precise Postgres operators needed.',
    dialect: 'PostgreSQL (JSONB)',
    sql: `-- Generated by Arcli AI Orchestrator
SELECT 
    resource->>'gender' AS patient_gender,
    COUNT(id) AS total_patients,
    ROUND(AVG((resource->'extension'->0->>'valueDecimal')::numeric), 2) AS avg_risk_score
FROM 
    fhir_patients
WHERE 
    resource->>'resourceType' = 'Patient'
    AND (resource->'active')::boolean = true
    AND resource->'address'->0->>'city' = 'Boston'
GROUP BY 
    resource->>'gender'
HAVING 
    COUNT(id) > 50
ORDER BY 
    avg_risk_score DESC;`,
    businessOutcome: 'Empowers CMIOs to instantly extract patient risk scores deeply nested within FHIR JSON blobs, providing immediate population health insights without requiring a data engineer.'
  },

  faqs: [
    {
      q: 'Will Arcli sign a Business Associate Agreement (BAA)?',
      a: 'Yes. For Enterprise tier customers operating in the United States, we provide standard BAAs to satisfy HIPAA regulatory requirements.',
      persona: 'Compliance Officer'
    },
    {
      q: 'Does Arcli store any data temporarily for caching?',
      a: 'Arcli only holds aggregate results in memory temporarily to render the visual charts (e.g., "50 patients in Boston"). Row-level patient data is never stored on our disks and is purged instantly after the session.',
      persona: 'Head of Security'
    },
    {
      q: 'Can we self-host Arcli inside our own VPC?',
      a: 'Yes. For the strictest security postures, Arcli offers an On-Premise/VPC deployment model where both the Orchestrator and the UI run entirely within your firewalled environment.',
      persona: 'Data Architect'
    }
  ]
};

/**
 * SEO Industry Campaign: FinTech & Banking
 * Target Audience: CTOs, Chief Risk Officers (CRO), FinTech Data Leads
 * Core Focus: Ledger immutability, SOC2 compliance, complex financial calculations.
 */
export const fintechIndustry: SEOPageData = {
  type: 'campaign',
  seo: {
    title: 'Financial Services AI Analytics | Secure BI Tool | Arcli',
    description: 'Query your core banking ledgers and payment gateways with natural language. Arcli guarantees zero data movement and immutable read-only security.',
    h1: 'Bank-Grade AI Analytics',
    keywords: [
      'Financial services AI analytics', 
      'Secure ledger BI tool', 
      'SOC2 compliant AI reporting', 
      'FinTech data AI', 
      'Zero copy analytics banking',
      'AI ledger analytics without ETL',
      'secure payment gateway BI',
      'SOC2 compliant text-to-SQL',
      'real-time liquidity AI dashboard',
      'Stripe data analytics zero copy',
      'fraud detection SQL generator',
      'core banking reporting automation',
      'payment velocity anomaly detection',
      'RLS aware financial BI',
      'immutable query logging AI',
      'capital ratio calculation SQL',
      'unit economics BI platform',
      'fintech row level security AI',
      'banking data warehouse text-to-sql',
      'ledger reconciliation AI'
    ],
    intent: 'campaign',
    canonicalDomain: 'https://arcli.tech/industries/fintech'
  },
  hero: {
    badge: 'FINANCIAL SERVICES',
    title: 'Query Your Ledger. Keep It Secure.',
    subtitle: 'For modern FinTechs and institutions, moving transaction data is a non-starter. Arcli connects directly to your secure data warehouse, translating English into optimized SQL without ever extracting your customer’s financial data.',
    primaryCTA: { text: 'Start Free Trial', href: '/register' },
    secondaryCTA: { text: 'View SOC2 Report', href: '/security' }
  },

  // Cross-page Differentiation Signal: FinTech Specific Architecture
  financialDataModels: {
    supportedLedgers: ['Double-Entry Core Ledgers', 'Payment Gateways (Stripe, Adyen, Plaid)', 'Trading Execution Logs'],
    coreMetrics: ['Liquidity & Capital Ratios', 'Real-time CAC/LTV', 'Net Revenue Retention (NRR)', 'Fraud Velocity'],
    securityPrerequisites: ['Strict Row-Level Security (RLS) Passthrough', 'VPC Peering', 'No-ETL Architecture Required']
  },

  executiveSummary: [
    { value: 'SOC2', label: 'Type II Certified' },
    { value: '100%', label: 'Stateless Compute' },
    { value: '0', label: 'Ledger Replications' },
    { value: 'RBAC', label: 'Row-Level Security' }
  ],

  contrarianBanner: {
    statement: "Your customer transaction data belongs in your vault, not in a vendor's dashboard cache.",
    subtext: "If your BI tool requires a nightly sync of your core ledger, your attack surface just doubled. Arcli’s Zero-Data Movement architecture ensures that your financial data remains exactly where you put it."
  },

  securityGuardrails: [
    {
      title: 'Inherited Row-Level Security',
      description: 'Arcli natively respects the Row-Level Security (RLS) policies defined in your Snowflake or Postgres databases. The AI can never surface a transaction a user isn\'t explicitly authorized to see.'
    },
    {
      title: 'No-ETL Architecture',
      description: 'Skip the vulnerable middle-man. Because Arcli writes the SQL directly against your live schema, there are no brittle ETL pipelines or stale data lakes holding unencrypted PII.'
    },
    {
      title: 'Immutable Query Logging',
      description: 'Satisfy auditors instantly. Arcli maintains a tamper-proof cryptographic log of every single query the AI generates and executes, including timestamp and user identity.'
    }
  ],

  useCases: {
    title: 'Accelerate Financial Intelligence',
    items: [
      {
        title: 'Fraud & Anomaly Detection',
        description: 'Empower risk teams to query raw transaction velocity and geographic anomalies in real-time, generating visualizations of suspicious activity before clearing.',
        icon: 'ShieldAlert'
      },
      {
        title: 'Liquidity & Capital Ratios',
        description: 'Treasury teams can ask complex questions about daily capital requirements and instantly receive accurate, mathematically sound calculations directly from the core ledger.',
        icon: 'Landmark'
      },
      {
        title: 'Unit Economics Tracking',
        description: 'Blend payment gateway data (Stripe, Adyen) with your internal database to calculate exact Customer Acquisition Cost (CAC) vs. Lifetime Value (LTV) across cohorts.',
        icon: 'TrendingUp'
      }
    ]
  },

  strategicScenario: {
    title: 'Snowflake Time-Travel & Windowing',
    description: 'Financial analysis requires precise window functions to calculate moving averages and running totals. Arcli’s engine generates advanced Snowflake dialect SQL to process millions of transactions flawlessly.',
    dialect: 'Snowflake SQL',
    sql: `-- Generated by Arcli AI Orchestrator
SELECT
    DATE_TRUNC('day', transaction_date) AS txn_day,
    merchant_category,
    SUM(amount) AS daily_volume,
    SUM(SUM(amount)) OVER (
        PARTITION BY merchant_category 
        ORDER BY DATE_TRUNC('day', transaction_date)
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_7_day_volume
FROM 
    core_ledger.production.transactions
WHERE 
    status = 'SETTLED'
    AND transaction_date >= DATEADD(day, -30, CURRENT_DATE())
GROUP BY 
    txn_day, 
    merchant_category
ORDER BY 
    txn_day DESC, 
    daily_volume DESC;`,
    businessOutcome: 'Provides the Head of Risk with a real-time, 7-day rolling average of transaction volumes across all merchant categories to detect sudden micro-structuring attacks or liquidity spikes.'
  },

  faqs: [
    {
      q: 'Is Arcli SOC 2 Type II compliant?',
      a: 'Yes. We undergo rigorous independent auditing to maintain our SOC 2 Type II certification, ensuring our security, availability, and confidentiality controls meet strict financial standards.',
      persona: 'Chief Risk Officer'
    },
    {
      q: 'How do you handle highly complex financial calculations like IRR or Yield?',
      a: 'Arcli grounds its AI not just in table names, but in semantic definitions. You can define "Internal Rate of Return" via our metric governance layer, and the AI will reliably insert the correct mathematical SQL logic every time.',
      persona: 'Data Engineer'
    },
    {
      q: 'Can Arcli connect to legacy mainframe databases?',
      a: 'Arcli excels with modern cloud warehouses (Snowflake, BigQuery, Redshift) and robust RDBMS (Postgres, SQL Server). For legacy mainframes, we recommend querying the replicated operational data store (ODS) via an ODBC/JDBC compatible gateway.',
      persona: 'CTO'
    }
  ]
};