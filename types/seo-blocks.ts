// ----------------------------------------------------------------------
// ARCLI V15 - STRICT SEO BLOCK REGISTRY
// 🚫 ZERO RUNTIME CRASHES. ZERO PARTIAL HYDRATION.
// ----------------------------------------------------------------------

// 1. Strict Block Definitions
export type HeroBlock = {
  type: 'HeroBlock';
  data: {
    headline: string;
    subheadline: string;
    primaryCTA: { label: string; href: string };
  };
};

export type ContrarianBannerBlock = {
  type: 'ContrarianBanner';
  data: {
    hook: string;
    truth: string;
  };
};

export type ArchitectureDiagramBlock = {
  type: 'ArchitectureDiagram';
  data: {
    title: string;
    steps: {
      title: string;
      description: string;
    }[];
  };
};

export type AnalyticsDashboardBlock = {
  type: 'AnalyticsDashboard';
  data: {
    title: string;
    description: string;
    dialect: string;
    code: string;
    businessOutcome: string;
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

export type InformationGainBlock = {
  type: 'InformationGain';
  uniqueInsight: string;        
  structuralAdvantage: string;  
};

export type SecurityGuardrailsBlock = {
  type: 'SecurityGuardrails';
  items: {
    title: string;
    description: string;
  }[];
};

export type MetricsChartBlock = {
  type: 'MetricsChart';
  data: {
    codeSnippet: {
      filename: string;
      language: string;
      code: string;
    };
    governedOutputs: {
      label: string;
      value: string;
      status: 'optimal' | 'warning' | 'critical';
    }[];
  };
};

export type DataRelationshipsGraphBlock = {
  type: 'DataRelationshipsGraph';
  data: {
    traces: {
      phase: string;
      durationMs: number;
      log: string;
    }[];
  };
};

export type CTAGroupBlock = {
  type: 'CTAGroup';
  data: {
    primary: { label: string; href: string };
    secondary?: { label: string; href: string };
  };
};

// 2. Closed Union Type
export type Block =
  | HeroBlock
  | ArchitectureDiagramBlock
  | AnalyticsDashboardBlock
  | ComparisonMatrixBlock
  | InformationGainBlock
  | ContrarianBannerBlock
  | SecurityGuardrailsBlock
  | MetricsChartBlock
  | DataRelationshipsGraphBlock
  | CTAGroupBlock;

// 3. V2 Page Schema
export type SEOPageData = {
  slug: string;
  title: string;
  description: string;
  blocks: Block[]; // MANDATORY BLOCK-ONLY ARCHITECTURE
};

// 4. Runtime Validation (Pre-Build Gate)
export function validatePageOrThrow(page: SEOPageData) {
  if (!page || typeof page !== 'object') {
    throw new Error('Invalid page payload');
  }

  if (!Array.isArray(page.blocks) || page.blocks.length === 0) {
    throw new Error(`Invalid blocks array for page: ${page.slug}`);
  }

  for (const block of page.blocks) {
    if (!block?.type) {
      throw new Error(`Missing block type on page: ${page.slug}`);
    }

    switch (block.type) {
      case 'ArchitectureDiagram':
        if (!block.data?.steps?.length)
          throw new Error('ArchitectureDiagram invalid: missing steps');
        break;

      case 'ComparisonMatrix':
        if (!block.rows?.length)
          throw new Error('ComparisonMatrix invalid: missing rows');
        break;

      case 'AnalyticsDashboard':
        if (!block.data?.code?.trim())
          throw new Error('AnalyticsDashboard invalid: missing code block');
        break;

      case 'SecurityGuardrails':
        if (!block.items?.length)
          throw new Error('SecurityGuardrails invalid: missing items');
        break;

      case 'MetricsChart':
        if (!block.data?.governedOutputs?.length)
          throw new Error('MetricsChart invalid: missing governed outputs');
        break;

      case 'DataRelationshipsGraph':
        if (!block.data?.traces?.length)
          throw new Error('DataRelationshipsGraph invalid: missing traces');
        break;

      case 'InformationGain':
        if (block.uniqueInsight?.length < 20 || block.structuralAdvantage?.length < 20)
           throw new Error('InformationGain invalid: insights too short');
        break;
        
      // Default case handles blocks without strict internal array dependencies 
      // (like ContrarianBanner, Hero, CTAGroup) implicitly passing if typed correctly.
    }
  }
  
  return true; // Validated
}