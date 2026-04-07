import React from 'react';
import { LayoutTemplate, DollarSign, Database, Download, Zap, ShieldCheck } from 'lucide-react';

/**
 * [UPGRADED] TemplateBlueprint Schema
 * V13 Architecture: SEO Dominance, Information Gain, and Contextual Conversion.
 */
export interface TemplateBlueprint {
  id: string;
  type: 'template';
  metadata: {
    title: string;
    description: string;
    canonicalDomain: string; 
    keywords: string[];
    intent: 'informational' | 'commercial' | 'template' | 'comparison';
  };
  // NEW: Programmatic Schema.org Injection for Rich SERP Results
  schemaOrg: {
    type: 'TechArticle' | 'SoftwareApplication' | 'Dataset';
    applicationCategory?: string;
    primaryEntity: string;
  };
  hero: {
    h1: string;
    subtitle: string;
    icon: React.ReactElement;
  };
  immediateValue: string[];
  // NEW: Explicit Information Gain (Why Arcli vs Status Quo)
  competitiveMoat: {
    vsStatusQuo: string;
    arcliAdvantage: string;
  }[];
  quickStart: {
    timeToValue: string;
    steps: string[];
  };
  // NEW: Maps user intent to the correct micro/macro conversion event
  conversionTriggers: {
    primaryCTA: { label: string; action: 'connect_db' | 'signup' | 'demo'; intent: string };
    secondaryCTA: { label: string; action: 'copy_code' | 'download_csv'; intent: string };
  };
  assets?: {
    type: 'sql' | 'csv' | 'notion' | 'pdf';
    label: string;
    url: string;
    icon: React.ReactElement;
  }[];
  technicalStack: {
    engine: 'DuckDB' | 'Polars' | 'SQL-Pushdown' | 'WASM';
    format: 'Parquet' | 'Columnar' | 'JSONB-Unnested';
    compute: string;
  };
  // NEW: Flags for the frontend UI Engine to render live widgets
  interactiveCapabilities: {
    hasLivePreview: boolean;
    requiresDbConnection: boolean;
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
    exampleQuery: string; // The Natural Language prompt
    exampleSql: string;   // The output
    businessOutcome: string;
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
    persona: 'CEO' | 'CFO' | 'Data Engineer' | 'CISO' | 'RevOps' | 'Marketing Director';
    q: string;
    a: string;
  }[];
  relatedBlueprints: string[];
}

export const dashboardTemplatesPart1: Record<string, TemplateBlueprint> = {
  'sales-dashboard-template': {
    id: 'sales-blueprint-001',
    type: 'template',
    metadata: {
      title: 'Sales Dashboard Template & SQL Metrics Guide | Arcli',
      description: 'Free SQL templates to calculate win rate, pipeline velocity, and forecasting. Connect Salesforce or HubSpot and run in seconds without complex BI tools.',
      canonicalDomain: 'arcli.tech',
      keywords: ['sales dashboard template', 'how to calculate win rate sql', 'pipeline dashboard example', 'salesforce sql metrics', 'revops dashboard'],
      intent: 'template'
    },
    schemaOrg: {
      type: 'TechArticle',
      primaryEntity: 'SQL Sales Reporting Architecture'
    },
    hero: {
      h1: 'Sales Dashboard Template (Free SQL + Metrics Guide)',
      subtitle: 'Track pipeline, win rate, and revenue instantly using pre-built SQL templates. Built for Salesforce, HubSpot, and modern data teams seeking answers without the BI bottleneck.',
      icon: <LayoutTemplate className="w-12 h-12 text-indigo-500 mb-6" />
    },
    immediateValue: [
      'Pre-built SQL for win rate, pipeline velocity, and executive forecasting.',
      'Works instantly with Salesforce, HubSpot, and Postgres.',
      'No rigid BI tools or multi-week IT tickets required.',
      'Runs in milliseconds directly on your live CRM data.'
    ],
    competitiveMoat: [
      {
        vsStatusQuo: 'Salesforce standard reports cannot join custom historical snapshot tables easily.',
        arcliAdvantage: 'Arcli utilizes vectorized window functions via DuckDB/SQL-Pushdown to calculate pipeline velocity instantly on un-aggregated data.'
      }
    ],
    quickStart: {
      timeToValue: '< 3 minutes',
      steps: [
        'Securely link your CRM via read-only OAuth.',
        'Arcli automatically maps your custom fields (e.g., industry__c).',
        'Copy and paste the pre-built SQL below to generate your charts.'
      ]
    },
    conversionTriggers: {
      primaryCTA: { label: 'Connect CRM & Generate Now', action: 'connect_db', intent: 'Automate reporting execution' },
      secondaryCTA: { label: 'Copy SQL to Clipboard', action: 'copy_code', intent: 'Solve immediate technical block' }
    },
    assets: [
      {
        type: 'sql',
        label: 'Download Full Sales SQL Library (.sql)',
        url: '/assets/sql/sales-library.sql',
        icon: <Database className="w-4 h-4 mr-2" />
      }
    ],
    technicalStack: {
      engine: 'SQL-Pushdown',
      format: 'Columnar',
      compute: 'Vectorized Window Functions'
    },
    interactiveCapabilities: {
      hasLivePreview: true,
      requiresDbConnection: true
    },
    performanceMetrics: [
      'Instantly calculate Win-Rate across reps',
      'Track historical pipeline changes at any point in time',
      'View rep-level performance with secure tenant isolation',
      'Works seamlessly with your custom CRM fields automatically'
    ],
    strategicContext: {
      title: 'Bypass CRM Ecosystem Rigidity',
      industrialConstraints: [
        'Standard CRM reports struggle with complex questions and cross-object data joins.',
        'Tracking historical pipeline state usually requires expensive third-party tools or heavy data engineering.',
        'It’s nearly impossible to unify sales performance with external billing or quota spreadsheets natively.'
      ],
      arcliEfficiency: 'Arcli acts as an instant compute layer. We connect to your CRM, translate your custom fields automatically, and let you ask net-new pipeline questions that execute in milliseconds—no ETL required.'
    },
    orchestrationWorkflow: {
      phase1: { name: 'Instant Connection', description: 'Securely link Salesforce or HubSpot. Arcli maps the schema instantly.' },
      phase2: { name: 'Contextual AI Hydration', description: 'Our AI reads your deal stages and business logic securely.' },
      phase3: { name: 'Run & Visualize', description: 'Execute SQL or ask plain-text questions to render charts.' }
    },
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'Win-Rate by Sales Rep',
        description: 'Instantly isolate top-performing reps based on high-intent pipeline conversion. Copy this query to your database.',
        exampleQuery: "Calculate win-rate by sales rep for the current quarter, ignoring disqualified leads.",
        exampleSql: `WITH qualified_ops AS (
  SELECT owner_id, is_won, is_closed
  FROM sales_opportunities
  WHERE created_at >= DATE_TRUNC('quarter', CURRENT_DATE)
    AND stage_name NOT IN ('Initial Inquiry', 'Disqualified')
)
SELECT 
  u.name AS sales_rep,
  COUNT(*) AS total_qualified_pipeline,
  ROUND(COUNT(*) FILTER (WHERE o.is_won = TRUE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE o.is_closed = TRUE), 0), 2) AS win_rate_pct
FROM qualified_ops o
JOIN users u ON o.owner_id = u.id
GROUP BY 1 
HAVING COUNT(*) > 5
ORDER BY win_rate_pct DESC;`,
        businessOutcome: 'Provides immediate visibility into which reps are effectively closing qualified pipeline versus just generating volume.'
      }
    ],
    businessValueAndROI: [
      { metric: 'Data Engineering Hours Saved', impact: 'Reduce CRM custom report-building ticket queues by 85%.', timeframe: 'Immediate' }
    ],
    enterpriseApplications: [
      { vertical: 'Sales Operations', application: 'Automate executive forecasting without maintaining complex CRM report types.' }
    ],
    trustAndSecurity: [
      { guarantee: 'Zero-Mutation Architecture', mechanism: 'Arcli utilizes strict read-only tokens. It is architecturally impossible for our engine to alter or delete your CRM data.' }
    ],
    faqs: [
      {
        persona: 'CEO',
        q: 'How does this accelerate our Board reporting?',
        a: 'Instead of waiting two weeks for RevOps to compile static slides from CRM exports, Arcli allows you to ask conversational questions live during a board meeting. You get precise answers and charts instantly.'
      }
    ],
    relatedBlueprints: ['saas-metrics-dashboard-template', 'marketing-attribution-blueprint']
  }
};