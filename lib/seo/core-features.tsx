import React from 'react';
import { Sparkles, LineChart, BarChart3, PieChart, FileSpreadsheet } from 'lucide-react';

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

export const coreFeatures: Record<string, SEOPageData> = {
  'ai-data-analysis': {
    type: 'feature',
    title: 'AI Data Analysis Platform | DataOmen',
    description: 'Transform raw data into actionable business intelligence instantly. Upload CSVs or connect databases for zero-code AI data analysis.',
    h1: 'AI Data Analysis Built for Speed',
    subtitle: 'Upload your data and let our AI engine uncover patterns, anomalies, and insights in seconds.',
    icon: <Sparkles className="w-12 h-12 text-blue-500 mb-6" />,
    features: ['Instant Anomaly Detection', 'Predictive Forecasting', 'Automated Insights'],
    steps: [
      { name: 'Connect Data', text: 'Securely connect your database or upload a CSV.' },
      { name: 'Ask in Plain English', text: 'Type your question naturally. Our AI translates it into optimized SQL.' },
      { name: 'Get Instant Charts', text: 'Our vectorized engine generates a verified dashboard instantly.' }
    ],
    useCases: [
      { title: 'Financial Forecasting', description: 'Automatically detect seasonal trends and generate rolling forecasts.' },
      { title: 'Customer Churn Analysis', description: 'Identify at-risk accounts before they cancel by analyzing usage patterns.' }
    ],
    faqs: [
      { q: 'What is AI data analysis?', a: 'It uses machine learning to automatically clean, process, and extract actionable insights from raw data.' },
      { q: 'Do I need to know how to code?', a: 'No. Our platform is completely zero-code. You interact using plain English.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'ai-business-intelligence', 'analyze-csv-with-ai']
  },

  'ai-business-intelligence': {
    type: 'feature',
    title: 'AI Business Intelligence Tools | DataOmen',
    description: 'Empower your entire organization with AI-native Business Intelligence. From predictive metrics to conversational analytics.',
    h1: 'Next-Generation AI Business Intelligence',
    subtitle: 'Give your operators the power of a dedicated data science team. Ask questions, get answers, drive revenue.',
    icon: <LineChart className="w-12 h-12 text-cyan-500 mb-6" />,
    features: ['Semantic Metric Governance', 'Executive Briefings', 'Automated Root Cause Analysis'],
    steps: [
      { name: 'Define Metrics', text: 'Set up your core KPIs once using our Semantic Governance layer.' },
      { name: 'Distribute Access', text: 'Give operators secure, read-only chat access to the BI engine.' },
      { name: 'Automate Reporting', text: 'Schedule AI-generated insights to be delivered to Slack or Email weekly.' }
    ],
    useCases: [
      { title: 'Marketing ROI Tracking', description: 'Consolidate ad spend data across platforms to calculate true blended CAC.' }
    ],
    faqs: [
      { q: 'How does this replace legacy BI?', a: 'It removes the bottleneck of the data team. Anyone can ask questions and get verified charts.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'ai-dashboard-builder']
  },

  'ai-dashboard-builder': {
    type: 'feature',
    title: 'Automated AI Dashboard Builder | DataOmen',
    description: 'Build beautiful, interactive business dashboards automatically using AI. Connect your data and get a full reporting suite.',
    h1: 'The Zero-Click AI Dashboard Builder',
    subtitle: 'Why drag and drop when AI can build it for you? Generate tailored, highly-interactive dashboards based on your metrics.',
    icon: <BarChart3 className="w-12 h-12 text-purple-500 mb-6" />,
    features: ['Dynamic Chart Selection', 'Real-Time Sync Engine', 'Embeddable Analytics'],
    steps: [
      { name: 'Connect Source', text: 'Link your database or API.' },
      { name: 'Provide Prompt', text: 'Tell the AI what you want to track (e.g., "Build a Sales Executive Dashboard").' },
      { name: 'Auto-Generate', text: 'The AI writes the underlying queries and selects the optimal chart types automatically.' }
    ],
    useCases: [
      { title: 'Client Reporting', description: 'Automatically spin up white-labeled dashboards for your agency clients.' }
    ],
    faqs: [
      { q: 'Can I customize the generated dashboards?', a: 'Yes. The AI generates the baseline, but every chart and layout can be manually overridden.' }
    ],
    relatedSlugs: ['ai-data-visualization-tool', 'automatic-dashboard-generation']
  },

  'ai-data-visualization-tool': {
    type: 'feature',
    title: 'AI Data Visualization Tool | DataOmen',
    description: 'Turn complex datasets into beautiful, interactive charts instantly. Use our AI data visualization tool to generate graphs without dragging and dropping.',
    h1: 'AI-Powered Data Visualization',
    subtitle: 'Stop wasting time configuring chart axes. Tell our AI what you want to see, and it generates the perfect visualization instantly.',
    icon: <PieChart className="w-12 h-12 text-pink-500 mb-6" />,
    features: ['Auto-Chart Selection', 'Interactive Filtering', 'Custom Branding'],
    steps: [
      { name: 'Connect Data', text: 'Upload your dataset or connect to your database.' },
      { name: 'Request Visual', text: 'Type "Show me revenue by region as a stacked bar chart."' },
      { name: 'Customize', text: 'Tweak colors, labels, and tooltips using conversational commands.' }
    ],
    useCases: [
      { title: 'Presentation Ready', description: 'Generate pixel-perfect charts for board decks in seconds.' }
    ],
    faqs: [
      { q: 'Can I embed these charts?', a: 'Yes! Every generated chart comes with a secure iframe snippet to embed in Notion, internal wikis, or your own app.' }
    ],
    relatedSlugs: ['ai-dashboard-builder', 'tableau-vs-ai-analytics']
  },

  'ai-excel-analysis': {
    type: 'feature',
    title: 'AI Excel Analysis Tool | DataOmen',
    description: 'Upgrade your Excel workflows. Use AI to analyze large financial models, sales data, and raw exports effortlessly.',
    h1: 'AI-Powered Excel Analysis',
    subtitle: 'Excel is great for viewing data, but terrible for analyzing millions of rows. Let our AI do the heavy lifting.',
    icon: <FileSpreadsheet className="w-12 h-12 text-green-600 mb-6" />,
    features: ['Handles 10M+ Rows', 'Automated Pivot Tables', 'Cross-Sheet Joins via AI'],
    steps: [
      { name: 'Upload .XLSX', text: 'Drop your Excel files securely into our engine.' },
      { name: 'AI Normalization', text: 'We automatically fix broken dates and VLOOKUP errors.' },
      { name: 'Ask Questions', text: 'Chat with your workbook to instantly generate summaries.' }
    ],
    useCases: [
      { title: 'Consolidating Reports', description: 'Merge multiple regional Excel reports into a single, cohesive AI dashboard.' }
    ],
    faqs: [
      { q: 'Does this replace Excel?', a: 'No, it augments it. You can still use Excel for input, but DataOmen becomes your presentation layer.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'how-to-analyze-sales-data']
  }
};