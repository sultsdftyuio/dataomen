import React from 'react';
import { PieChart, Activity, Database, Target, Hexagon } from 'lucide-react';

/**
 * SEOPageData Interface
 * Defined locally to ensure zero-dependency module resolution.
 * Supports the 5 pillars of our SaaS SEO strategy.
 */
export type SEOPageData = {
  type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  steps: { name: string; text: string }[];
  useCases: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  comparison?: { 
    competitor: string; 
    dataOmenWins: string[]; 
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

export const competitorComparisons: Record<string, SEOPageData> = {
  'tableau-vs-ai-analytics': {
    type: 'comparison',
    title: 'Tableau vs AI Analytics: The Modern Stack | DataOmen',
    description: 'See why modern data teams are switching from traditional BI tools like Tableau to AI-native analytics platforms.',
    h1: 'Move Beyond Legacy BI. Switch to AI Analytics.',
    subtitle: 'Stop wrestling with complex workflows. Discover how AI-native analytics reduces time-to-insight from weeks to seconds.',
    icon: <PieChart className="w-12 h-12 text-rose-500 mb-6" />,
    features: ['No Proprietary Languages', 'Instant Setup', 'Fraction of the Cost'],
    steps: [
      { name: 'Connect Data', text: 'Skip the data engineering pipeline. Connect databases directly.' },
      { name: 'Ask Questions', text: 'Instead of building manual dashboard views, type what you want to know.' },
      { name: 'Share Insights', text: 'Send interactive, self-updating charts via secure URLs.' }
    ],
    comparison: {
      competitor: 'Tableau',
      dataOmenWins: ['Conversational AI Interface (NL2SQL)', 'Zero learning curve for business users', 'No expensive desktop licenses required'],
      competitorFlaws: ['Requires knowing VizQL and calculated fields', 'Extremely expensive for full-org deployment', 'Slow desktop-to-cloud workflows']
    },
    useCases: [
      { title: 'Democratizing Data', description: 'Allow teams to pull their own reports without waiting on data analysts.' }
    ],
    faqs: [
      { q: 'Can I migrate my Tableau dashboards?', a: 'Our AI can recreate your core metrics in minutes by connecting to the same underlying data source.' }
    ],
    relatedSlugs: ['powerbi-vs-ai-analytics', 'metabase-vs-ai-analytics']
  },

  'powerbi-vs-ai-analytics': {
    type: 'comparison',
    title: 'Power BI vs AI Analytics | DataOmen',
    description: 'Compare Microsoft Power BI with modern AI analytics. Learn why startups and modern enterprises are ditching DAX for AI.',
    h1: 'Ditch DAX. Embrace AI.',
    subtitle: 'PowerBI is powerful, but requires learning complex DAX formulas. DataOmen replaces formulas with plain English.',
    icon: <Activity className="w-12 h-12 text-yellow-600 mb-6" />,
    features: ['Cloud Native', 'Mac & PC Compatible', 'Natural Language Interface'],
    steps: [
      { name: 'Connect', text: 'Link your data sources seamlessly.' },
      { name: 'Query', text: 'Ask questions without writing a single DAX formula.' },
      { name: 'Publish', text: 'Share live dashboards instantly across your organization.' }
    ],
    comparison: {
      competitor: 'Power BI',
      dataOmenWins: ['No DAX formulas to learn', 'Browser-first, Mac-friendly', 'Automated AI chart selection'],
      competitorFlaws: ['DAX has a massive learning curve', 'Desktop app is Windows only', 'Clunky cloud publishing experience']
    },
    useCases: [
      { title: 'Agile Reporting', description: 'Pivot reporting metrics instantly during executive meetings using chat.' }
    ],
    faqs: [
      { q: 'Is DataOmen Mac compatible?', a: 'Yes. DataOmen is 100% cloud-native and works perfectly on Mac, Windows, and Linux browsers.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'metabase-vs-ai-analytics']
  },

  'metabase-vs-ai-analytics': {
    type: 'comparison',
    title: 'Metabase vs AI Analytics | DataOmen',
    description: 'Compare Metabase with modern AI analytics platforms. See why fast-growing startups are switching to conversational BI.',
    h1: 'Metabase vs. Modern AI Analytics',
    subtitle: 'Metabase is a great V1 BI tool, but it scales poorly. See how DataOmen replaces manual query building with AI.',
    icon: <Database className="w-12 h-12 text-blue-500 mb-6" />,
    features: ['Instant Schema Understanding', 'No Complex UI Builders', 'Automated Visualizations'],
    steps: [
      { name: 'Connect DB', text: 'Link your Postgres or MySQL database just like Metabase.' },
      { name: 'Skip the Builder', text: 'Instead of clicking through a visual query builder, just type your question.' },
      { name: 'Auto-Dashboard', text: 'Pin your AI-generated answers directly to a live dashboard.' }
    ],
    comparison: {
      competitor: 'Metabase',
      dataOmenWins: ['Conversational AI Interface', 'No visual query builder needed', 'Generates complex SQL JOINs automatically'],
      competitorFlaws: ['Visual builder breaks on complex queries', 'Requires SQL knowledge for advanced reporting', 'Slow performance on large datasets']
    },
    useCases: [
      { title: 'Scaling Data Access', description: 'Move from a centralized data request queue to true self-serve analytics.' }
    ],
    faqs: [
      { q: 'Is DataOmen harder to set up than Metabase?', a: 'No. Both require a simple database connection string. DataOmen is ready in 60 seconds.' }
    ],
    relatedSlugs: ['looker-vs-ai-analytics', 'powerbi-vs-ai-analytics']
  },

  'looker-vs-ai-analytics': {
    type: 'comparison',
    title: 'Looker vs AI Analytics | DataOmen',
    description: 'Compare Google Looker with DataOmen. See why agile data teams are moving away from LookML to semantic AI platforms.',
    h1: 'The Modern Alternative to Looker',
    subtitle: 'Looker is incredibly powerful, but maintaining LookML requires a dedicated team of engineers. Discover the zero-code AI alternative.',
    icon: <Target className="w-12 h-12 text-purple-600 mb-6" />,
    features: ['Zero LookML Required', 'Instant Deployment', 'Conversational Interface'],
    steps: [
      { name: 'Skip the Modeling', text: 'DataOmen infers semantic relationships automatically via AI.' },
      { name: 'Ask Questions', text: 'Use natural language instead of Looker Explores.' },
      { name: 'Deploy Faster', text: 'Get your team operational in minutes, not months.' }
    ],
    comparison: {
      competitor: 'Looker',
      dataOmenWins: ['No proprietary language (LookML) to learn', 'Radically faster implementation time', 'Conversational interface for operators'],
      competitorFlaws: ['Requires a dedicated data engineering team', 'LookML has a steep learning curve', 'Extremely high enterprise pricing']
    },
    useCases: [
      { title: 'Agile Startups', description: 'Get enterprise-grade BI without hiring a 3-person data team.' }
    ],
    faqs: [
      { q: 'Can DataOmen handle complex metric definitions?', a: 'Yes. Our Semantic Governance layer allows you to define core metrics once so the AI never miscalculates them.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'hex-vs-ai-analytics']
  },

  'hex-vs-ai-analytics': {
    type: 'comparison',
    title: 'Hex vs AI Analytics | DataOmen',
    description: 'Compare Hex Technologies with DataOmen. Find the right platform for your data science and business intelligence needs.',
    h1: 'The Alternative to Hex for Business Teams',
    subtitle: 'Hex is built for Python-heavy data scientists. DataOmen is built for operators who want instant answers.',
    icon: <Hexagon className="w-12 h-12 text-purple-500 mb-6" />,
    features: ['Zero-Code Required', 'Instant NLP Queries', 'Business-Friendly Dashboards'],
    steps: [
      { name: 'Bypass Python', text: 'No need to write Pandas code or SQL. Use natural language.' },
      { name: 'Generate Logic', text: 'Our engine handles the complex vectorization in the background.' },
      { name: 'Deploy Fast', text: 'Publish insights to your team without managing notebooks.' }
    ],
    comparison: {
      competitor: 'Hex Technologies',
      dataOmenWins: ['Built for non-technical users', 'No Python/SQL required', 'Instant conversational interface'],
      competitorFlaws: ['Steep learning curve for business users', 'Notebook interface is intimidating for operators', 'Expensive for view-only users']
    },
    useCases: [
      { title: 'Operator Empowerment', description: 'Give your non-technical teams the analytical power of a data scientist.' }
    ],
    faqs: [
      { q: 'Do you support Python?', a: 'While our backend runs high-performance Python/Polars, the user experience is 100% zero-code.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'looker-vs-ai-analytics']
  }
};