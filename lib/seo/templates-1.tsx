import { 
  // Note: Icons are NO LONGER imported into the data file.
  // They are mapped at the render layer.
} from 'lucide-react';

// -----------------------------------------------------------------------------
// V14 STRICT DISCRIMINATED BLOCK TYPES
// -----------------------------------------------------------------------------

export type HeroBlock = {
  type: 'Hero';
  data: {
    h1: string;
    subtitle: string;
    iconName: string; // string-only, mapped at render level
  };
};

export type InformationGainBlock = {
  type: 'InformationGain';
  data: {
    uniqueInsight: string;
    structuralAdvantage: string;
    immediateValue: string[];
  };
};

export type ComparisonMatrixBlock = {
  type: 'ComparisonMatrix';
  rows: {
    category: string;
    legacy: string;
    arcliAdvantage: string;
  }[];
};

export type ArchitectureDiagramBlock = {
  type: 'ArchitectureDiagram';
  data: {
    title: string;
    timeToValue: string;
    steps: {
      title: string;
      description: string;
    }[];
  };
};

export type CTAGroupBlock = {
  type: 'CTAGroup';
  data: {
    primary: { label: string; action: string; intent: string };
    secondary?: { label: string; action: string; intent: string };
    assets?: {
      type: 'sql' | 'csv' | 'notion' | 'pdf';
      label: string;
      url: string;
      iconName: string;
    }[];
  };
};

export type AnalyticsDashboardBlock = {
  type: 'AnalyticsDashboard';
  data: {
    level: 'Basic' | 'Intermediate' | 'Advanced' | 'Strategic';
    title: string;
    description: string;
    dialect: string;
    code: string;
    businessOutcome: string;
  }[];
};

export type SecurityGuardrailsBlock = {
  type: 'SecurityGuardrails';
  items: {
    title: string;
    description: string;
  }[];
};

export type FAQBlock = {
  type: 'FAQ';
  items: {
    persona: string;
    q: string;
    a: string;
  }[];
};

export type Block =
  | HeroBlock
  | InformationGainBlock
  | ComparisonMatrixBlock
  | ArchitectureDiagramBlock
  | CTAGroupBlock
  | AnalyticsDashboardBlock
  | SecurityGuardrailsBlock
  | FAQBlock;

// -----------------------------------------------------------------------------
// V14 BLUEPRINT SCHEMA
// -----------------------------------------------------------------------------

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
  schemaOrg: {
    type: 'TechArticle' | 'SoftwareApplication' | 'Dataset';
    applicationCategory?: string;
    primaryEntity: string;
  };
  // V14 MANDATORY: All UI resides here.
  blocks: Block[];
}

// -----------------------------------------------------------------------------
// REFACTORED TEMPLATE DATA (100% SERIALIZABLE)
// -----------------------------------------------------------------------------

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
    blocks: [
      {
        type: 'Hero',
        data: {
          h1: 'Sales Dashboard Template (Free SQL + Metrics Guide)',
          subtitle: 'Track pipeline, win rate, and revenue instantly using pre-built SQL templates. Built for Salesforce, HubSpot, and modern data teams seeking answers without the BI bottleneck.',
          iconName: 'LayoutTemplate'
        }
      },
      {
        type: 'InformationGain',
        data: {
          uniqueInsight: 'Standard CRM reports struggle with complex questions and cross-object data joins. Arcli acts as an instant compute layer, bypassing CRM rigidity.',
          structuralAdvantage: 'Vectorized Window Functions executing directly on un-aggregated data via SQL-Pushdown.',
          immediateValue: [
            'Pre-built SQL for win rate, pipeline velocity, and executive forecasting.',
            'Works instantly with Salesforce, HubSpot, and Postgres.',
            'No rigid BI tools or multi-week IT tickets required.',
            'Runs in milliseconds directly on your live CRM data.'
          ]
        }
      },
      {
        type: 'ComparisonMatrix',
        rows: [
          {
            category: 'Pipeline Velocity',
            legacy: 'Salesforce standard reports cannot join custom historical snapshot tables easily.',
            arcliAdvantage: 'Utilizes vectorized window functions via DuckDB to calculate pipeline velocity instantly.'
          }
        ]
      },
      {
        type: 'ArchitectureDiagram',
        data: {
          title: 'Quick Start: Instant CRM Execution',
          timeToValue: '< 3 minutes',
          steps: [
            { title: 'Secure Connection', description: 'Securely link your CRM via read-only OAuth.' },
            { title: 'Schema Hydration', description: 'Arcli automatically maps your custom fields (e.g., industry__c).' },
            { title: 'Run & Visualize', description: 'Copy and paste the pre-built SQL below to generate your charts.' }
          ]
        }
      },
      {
        type: 'AnalyticsDashboard',
        data: [
          {
            level: 'Basic',
            title: 'Win-Rate by Sales Rep',
            description: 'Instantly isolate top-performing reps based on high-intent pipeline conversion. Copy this query to your database.',
            dialect: 'postgresql',
            code: `WITH qualified_ops AS (
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
        ]
      },
      {
        type: 'SecurityGuardrails',
        items: [
          {
            title: 'Zero-Mutation Architecture',
            description: 'Arcli utilizes strict read-only tokens. It is architecturally impossible for our engine to alter or delete your CRM data.'
          }
        ]
      },
      {
        type: 'FAQ',
        items: [
          {
            persona: 'CEO',
            q: 'How does this accelerate our Board reporting?',
            a: 'Instead of waiting two weeks for RevOps to compile static slides from CRM exports, Arcli allows you to ask conversational questions live during a board meeting. You get precise answers and charts instantly.'
          }
        ]
      },
      {
        type: 'CTAGroup',
        data: {
          primary: { label: 'Connect CRM & Generate Now', action: 'connect_db', intent: 'Automate reporting execution' },
          secondary: { label: 'Copy SQL to Clipboard', action: 'copy_code', intent: 'Solve immediate technical block' },
          assets: [
            {
              type: 'sql',
              label: 'Download Full Sales SQL Library (.sql)',
              url: '/assets/sql/sales-library.sql',
              iconName: 'Database'
            }
          ]
        }
      }
    ]
  }
};