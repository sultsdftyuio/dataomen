// lib/seo/saas-integrations-2.tsx
import React from 'react';
import { Search, Megaphone } from 'lucide-react';

/**
 * SEOPageData Interface - Application Intelligence Blueprint
 * Upgraded for dominant search visibility and high-converting UX.
 * Targets high-intent searches from RevOps, Marketing, and Data leaders
 * bottlenecked by native SaaS UIs.
 */
export interface SEOPageData {
  type: 'integration';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  schemaMarkup: 'FAQ' | 'HowTo' | 'Article';
  quickAnswer?: string;
  stepByStep?: string[];
  
  // NEW: Interactive Demo Payload
  demoPipeline?: {
    userPrompt: string;
    aiInsight: string;
    generatedSql: string;
    chartMetric: string;
  };

  // NEW: Audience Segmentation
  targetPersonas?: {
    role: string;
    iconType: 'exec' | 'ops' | 'data';
    description: string;
    capabilities: string[];
  }[];

  // NEW: CTA Hierarchy
  ctaHierarchy?: {
    primary: { text: string; href: string };
    secondary: { text: string; href: string };
  };

  comparisonTable?: {
    feature: string;
    native: string;
    arcli: string;
  }[];
  features: string[];
  extractionLifecycle: {
    phase1: { name: string; description: string };
    phase2: { name: string; description: string };
    phase3: { name: string; description: string };
  };
  domainSpecificCapabilities: {
    handlingQuirks: string[];
    aiAdvantage: string;
  };
  bypassingNativeLimits: {
    legacyLimitations: string[];
    arcliAcceleration: string[];
  };
  analyticalScenarios: {
    level: 'Basic' | 'Intermediate' | 'Advanced' | 'Strategic';
    title: string;
    description: string;
    exampleQuery: string;
    exampleSql: string;
    businessOutcome: string;
  }[];
  businessValueAndROI: {
    metric: string;
    impact: string;
    timeframe: string;
  }[];
  faqs: {
    persona: 'CEO' | 'Data Engineer' | 'CISO' | 'RevOps' | 'E-commerce Director' | 'Marketing Director';
    q: string;
    a: string;
  }[];
  relatedSlugs: string[];
}

export const saasIntegrationsPart2: Record<string, SEOPageData> = {
  'google-analytics-ai-dashboard': {
    type: 'integration',
    schemaMarkup: 'HowTo',
    title: 'Google Analytics 4 AI Dashboard | Arcli Analytics',
    description: 'Learn how to analyze GA4 data without the UI. Connect BigQuery to Arcli and use generative AI to UNNEST events and track true attribution instantly.',
    
    // Dual-Layer SEO: Search Intent (H1) + Positioning (Subtitle)
    h1: 'How to Analyze Google Analytics 4 (GA4) Data Without the UI',
    subtitle: 'Query raw BigQuery events, custom funnels, and attribution using conversational AI instead of confusing GA4 reports. Get 100% accurate, unsampled traffic metrics in seconds.',
    icon: <Search className="w-12 h-12 text-orange-500 mb-6" />,
    
    // Powered Interactive Demo
    demoPipeline: {
      userPrompt: "Which marketing campaign drove the highest LTV customers last quarter?",
      aiInsight: "The 'Q3_Enterprise_Webinar' campaign drove customers with a 3x higher LTV ($1,200) compared to our standard Paid Search campaigns, despite having a higher initial CAC.",
      generatedSql: "SELECT traffic_source.campaign, COUNT(DISTINCT user_id) as users, SUM(user_ltv.revenue) as ltv FROM `events_*` WHERE _TABLE_SUFFIX BETWEEN '20230701' AND '20230930' GROUP BY 1 ORDER BY 3 DESC;",
      chartMetric: "3x Higher LTV"
    },

    // Powered Audience Segmentation
    targetPersonas: [
      {
        role: 'For Marketing VPs',
        iconType: 'exec',
        description: 'Get an un-manipulated, mathematically precise Return on Ad Spend (ROAS) metric that doesn\'t rely on Google\'s internal attribution algorithms.',
        capabilities: ['True Cross-Platform ROAS', 'Unsampled Analytics']
      },
      {
        role: 'For Growth Ops',
        iconType: 'ops',
        description: 'Build complex, multi-step conversion funnels instantly via natural language without navigating the rigid GA4 UI.',
        capabilities: ['Instant Funnel Generation', 'Cross-Device Tracking']
      },
      {
        role: 'For Data Engineering',
        iconType: 'data',
        description: 'Let Arcli handle the complex BigQuery `UNNEST` logic for deeply nested `event_params` STRUCT arrays automatically.',
        capabilities: ['Zero-Copy Architecture', 'Partition-Aware Querying']
      }
    ],

    // Strong CTA Hierarchy
    ctaHierarchy: {
      primary: { text: 'Connect BigQuery Free', href: '/register' },
      secondary: { text: 'See Live Demo', href: '#interactive-demo' }
    },

    quickAnswer: "To effectively analyze GA4 data and bypass UI sampling, connect your Google Analytics BigQuery export to an AI-powered semantic engine like Arcli. This allows you to UNNEST complex event parameters and calculate exact sessions, funnels, and true attribution using plain English or SQL.",
    
    stepByStep: [
      "Enable the GA4 daily export to Google BigQuery.",
      "Connect Arcli securely to your BigQuery project via Read-Only Service Account.",
      "Allow the Semantic Router to index your custom events and nested parameters.",
      "Ask a question in plain English (e.g., 'Show checkout drop-off by device').",
      "Arcli automatically generates the `UNNEST` SQL and visualizes the unsampled data."
    ],

    comparisonTable: [
      { feature: 'Data Accuracy & Access', native: 'Heavily Sampled & Thresholded', arcli: '100% Unsampled Raw BigQuery Data' },
      { feature: 'Custom Funnel Creation', native: 'Rigid, Slow, and Hard to Configure', arcli: 'Instant via Conversational AI' },
      { feature: 'Cross-Platform ROI Joins', native: 'Impossible (Walled Garden)', arcli: 'Native (Join GA4 with Stripe/CRM)' }
    ],

    features: [
      'Conversational Event Analysis', 
      'Automated Funnel Drop-off Tracking', 
      'Cross-Platform Attribution Modeling',
      'Bypass GA4 UI Quotas and Sampling',
      'Zero-Copy BigQuery Architecture'
    ],
    
    extractionLifecycle: {
      phase1: {
        name: 'The BigQuery Synchronization Timeline',
        description: 'Authorize Arcli using secure, strictly scoped Google Cloud Service Accounts. We connect directly to your GA4 BigQuery Export, ensuring a Read-Only analytical connection.'
      },
      phase2: {
        name: 'Intelligent Schema Parsing',
        description: 'Our Semantic Router automatically indexes GA4\'s daily partition tables. It natively maps deeply nested `event_params` into the AI’s contextual memory.'
      },
      phase3: {
        name: 'Conversational Push-Down Compute',
        description: 'Instead of pulling terabytes of data across the network, Arcli compiles plain-English questions into optimized Google Standard SQL, executing the math securely where the data lives.'
      }
    },

    domainSpecificCapabilities: {
      handlingQuirks: [
        'Natively authors the highly complex SQL required to `UNNEST` GA4\'s deeply nested `event_params`.',
        'Enforces strict `_TABLE_SUFFIX` partition filters automatically to prevent accidental, costly full-table scans in your GCP billing.'
      ],
      aiAdvantage: 'Arcli’s orchestration engine natively understands the specific schema design of GA4. It translates simple business questions directly into optimized BigQuery Standard SQL without hallucinating field names.'
    },

    bypassingNativeLimits: {
      legacyLimitations: [
        'The native GA4 UI hides your real data behind thresholding and aggressive sampling on high-traffic sites.',
        'Attempting to join native GA4 session data with actual backend database revenue is nearly impossible within the Google UI.'
      ],
      arcliAcceleration: [
        'Queries the raw BigQuery export directly, guaranteeing 100% unsampled, mathematically accurate data.',
        'Enables true cross-platform blending, allowing you to seamlessly join GA4 acquisition data with your production database for true ROAS.'
      ]
    },

    analyticalScenarios: [
      {
        level: 'Strategic',
        title: 'Cross-Platform ROAS Blending',
        description: 'Merge GA4 acquisition costs with internal Stripe/Postgres billing data to find true customer value.',
        exampleQuery: "Join our GA4 user acquisition sources with internal billing to calculate the true ROAS of our Google Ads campaigns.",
        exampleSql: `WITH GA4_Acquisition AS (SELECT user_id, traffic_source.source FROM \`events_*\` WHERE event_name = 'first_visit'), Billing_Revenue AS (SELECT customer_id, SUM(amount_captured) as lifetime_revenue FROM internal_stripe_charges GROUP BY 1) SELECT g.source, SUM(b.lifetime_revenue) AS total_cohort_revenue FROM GA4_Acquisition g JOIN Billing_Revenue b ON g.user_id = b.customer_id GROUP BY 1;`,
        businessOutcome: 'Provides the executive team with an un-manipulated, mathematically precise Return on Ad Spend (ROAS) metric.'
      }
    ],

    businessValueAndROI: [
      { metric: 'Elimination of Data Sampling', impact: 'Achieve 100% mathematical accuracy on traffic reporting, bypassing GA4\'s restrictive UI limits.', timeframe: 'Immediate (Day 1)' },
      { metric: 'Data Engineering Bandwidth', impact: 'Save 20+ hours a month by eliminating manual BigQuery SQL requests for custom marketing funnels.', timeframe: 'First 30 Days' }
    ],

    faqs: [
      {
        persona: 'Marketing Director',
        q: 'Why shouldn\'t my team just use the native GA4 interface?',
        a: 'The native GA4 UI is notorious for hiding data behind "thresholding" and heavy data sampling on high-traffic days. Arcli queries your raw BigQuery export, guaranteeing the numbers you see are 100% accurate, not statistical estimates.'
      },
      {
        persona: 'Data Engineer',
        q: 'How does Arcli handle BigQuery costs and prevent full-table scans?',
        a: 'Our Contextual RAG routing ensures that every AI-generated query strictly enforces `_TABLE_SUFFIX` partition filters based on the date range requested. We never allow unbound queries to hit your massive historical event tables.'
      },
      {
        persona: 'CISO',
        q: 'Do you extract and copy our entire Google Analytics history to your servers?',
        a: 'No. We utilize a Zero-Copy Architecture. Arcli connects to BigQuery, compiles the SQL, pushes the compute down to Google\'s servers, and only retrieves the final aggregated result sets to render the chart in your browser.'
      }
    ],
    relatedSlugs: ['data-blending-guide', 'natural-language-to-sql']
  },

  'analyze-hubspot-data': {
    type: 'integration',
    schemaMarkup: 'HowTo',
    title: 'How to Analyze HubSpot Data (Deals, Contacts, Revenue)',
    description: 'Learn how to analyze HubSpot data beyond the native UI. Connect to Arcli to calculate true pipeline velocity, multi-touch attribution, and custom properties via AI.',
    
    h1: 'How to Analyze HubSpot Data (Deals, Contacts, Revenue)',
    subtitle: 'Stop exporting HubSpot lists to Excel. Connect your raw CRM data to Arcli and ask complex revenue, velocity, and pipeline questions in plain English.',
    icon: <Megaphone className="w-12 h-12 text-orange-600 mb-6" />,
    
    // Powered Interactive Demo
    demoPipeline: {
      userPrompt: "How many days does it take to close Enterprise deals on average?",
      aiInsight: "Enterprise deals take an average of 42 days to close. However, deals stuck in the 'Legal Review' stage for more than 5 days have a 60% lower win rate.",
      generatedSql: "SELECT dealstage, AVG(DATE_PART('day', closedate::timestamp - createdate::timestamp)) as avg_velocity FROM hubspot_deals WHERE deal_type = 'Enterprise' GROUP BY 1;",
      chartMetric: "42 Days Avg"
    },

    // Powered Audience Segmentation
    targetPersonas: [
      {
        role: 'For CROs & Founders',
        iconType: 'exec',
        description: 'Get instant answers to strategic pipeline questions without submitting a Jira ticket to your data team.',
        capabilities: ['Predictive Forecasting', 'Net Revenue Retention (NRR)']
      },
      {
        role: 'For RevOps Teams',
        iconType: 'ops',
        description: 'Bypass HubSpot\'s strict 3-object reporting limit. Automatically join Deals, Contacts, Companies, and custom objects seamlessly.',
        capabilities: ['Multi-Touch Attribution', 'Stage Velocity Math']
      },
      {
        role: 'For Data Engineering',
        iconType: 'data',
        description: 'Arcli automatically normalizes and indexes hundreds of custom HubSpot properties so you don\'t have to build manual mapping tables.',
        capabilities: ['Automated Property Mapping', 'Zero-Mutation Engine']
      }
    ],

    // Strong CTA Hierarchy
    ctaHierarchy: {
      primary: { text: 'Connect HubSpot Free', href: '/register' },
      secondary: { text: 'Watch How It Works', href: '#interactive-demo' }
    },

    quickAnswer: "To analyze HubSpot data beyond its native reporting limits, extract your Deals, Contacts, and Companies via API into a columnar analytical database. You can then use AI-powered SQL to effortlessly join objects, calculate true pipeline velocity, and report on custom properties instantly.",

    stepByStep: [
      "Authenticate your HubSpot portal via secure, read-only OAuth.",
      "Extract Contacts, Companies, Deals, and Engagements into a columnar data engine.",
      "Allow the AI to automatically map all custom properties and association tables.",
      "Query multi-touch attribution and stage velocity using natural language.",
      "Pin dynamic charts to a live revenue dashboard to replace static spreadsheets."
    ],

    comparisonTable: [
      { feature: 'Cross-Object Reporting', native: 'Strictly Limited to 3 Objects', arcli: 'Unlimited Object Joins' },
      { feature: 'Pipeline Velocity Math', native: 'Requires complex custom workflows', arcli: 'Native SQL Window Functions' },
      { feature: 'Data Exporting', native: 'Manual CSV downloads (Stale Data)', arcli: 'Live, self-updating Columnar Engine' }
    ],

    features: [
      'Vectorized Lead Velocity Tracking', 
      'Dynamic Cross-Object Joins', 
      'Automated Custom Property Detection',
      'Zero-Mutation Security Guarantee'
    ],
    
    extractionLifecycle: {
      phase1: {
        name: 'The API Synchronization Timeline',
        description: 'Authorize Arcli using HubSpot OAuth 2.0 protocols. We utilize strictly scoped, read-only access to securely extract CRM objects.'
      },
      phase2: {
        name: 'Automated Property Normalization',
        description: 'HubSpot portals are notorious for having hundreds of custom properties. Our Semantic Router automatically indexes every custom field (e.g., `hs_lead_status`), making them instantly queryable.'
      },
      phase3: {
        name: 'Conversational Sub-Second Compute',
        description: 'By compiling analytical intents into highly optimized SQL over Parquet file structures, complex cross-object queries execute in milliseconds.'
      }
    },

    domainSpecificCapabilities: {
      handlingQuirks: [
        'Native extraction and mapping of HubSpot\'s complex association tables (linking Contacts to Deals to Companies).',
        'Normalizes historical property states to enable true point-in-time velocity and cohort analytics.'
      ],
      aiAdvantage: 'Arcli’s semantic router embeds your unique HubSpot terminology (like specific custom deal pipelines or specialized lead scoring criteria) into the AI context, preventing Hallucinations.'
    },

    bypassingNativeLimits: {
      legacyLimitations: [
        'Native HubSpot custom report builders are extremely rigid, strictly limiting how many objects you can join.',
        'Calculating the exact time in days a contact spent in a specific lifecycle stage requires fragile workflows.'
      ],
      arcliAcceleration: [
        'Generates complex, multi-object analytical logic instantly via conversational prompts—completely bypassing limits.',
        'Seamlessly blends HubSpot marketing data with external product usage databases to calculate true Product-Led Growth (PLG) metrics.'
      ]
    },

    analyticalScenarios: [
      {
        level: 'Strategic',
        title: 'Net Revenue Retention (NRR) via PLG Data Blending',
        description: 'Predict churn by joining HubSpot deal renewals with external product usage telemetry.',
        exampleQuery: "Forecast upcoming churn risk by joining HubSpot renewal deals with their active user count from our Postgres database.",
        exampleSql: `SELECT c.name AS company_name, d.amount AS renewal_value, p.active_users_30d FROM hubspot_deals d JOIN hubspot_associations a ON d.dealid = a.deal_id JOIN hubspot_companies c ON a.company_id = c.companyid LEFT JOIN internal_product_telemetry p ON c.domain = p.company_domain WHERE d.dealtype = 'Renewal' AND p.active_users_30d < 5;`,
        businessOutcome: 'Alerts Customer Success to high-value accounts that have upcoming renewals but dangerously low product adoption.'
      }
    ],

    businessValueAndROI: [
      { metric: 'RevOps Agility', impact: 'Eliminate the 2-week wait time for complex cross-object reporting requests from the marketing team.', timeframe: 'Immediate (Day 1)' },
      { metric: 'Pipeline Acceleration', impact: 'Identify and remove specific deal-stage bottlenecks, potentially decreasing the average sales cycle by 12-18%.', timeframe: 'First Quarter' }
    ],

    faqs: [
      {
        persona: 'RevOps',
        q: 'Can Arcli handle our hundreds of custom HubSpot properties?',
        a: 'Yes. Upon connection, Arcli maps your entire metadata structure. Custom properties (e.g., `hs_custom_lead_score`) are embedded into our semantic router so the AI natively understands your portal\'s exact configuration.'
      },
      {
        persona: 'CEO',
        q: 'How is this different from HubSpot\'s new native AI reporting?',
        a: 'Native CRM AI tools are permanently restricted to the data within their walled garden. Arcli\'s Modular Strategy allows you to seamlessly join your HubSpot data with external Stripe billing or Google Ads data in a single conversational interface.'
      },
      {
        persona: 'CISO',
        q: 'Will this AI system accidentally overwrite or delete our CRM data?',
        a: 'No. Arcli operates under a strict Zero-Mutation Guarantee. We authenticate using strictly scoped OAuth tokens that only possess `read` permissions. It is architecturally impossible for our system to alter your HubSpot records.'
      }
    ],
    relatedSlugs: ['sales-dashboard-template', 'natural-language-to-sql']
  }
};