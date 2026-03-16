import React from 'react';
import { Cloud, ShoppingCart, Search } from 'lucide-react';

/**
 * SEOPageData Interface
 * Updated to reflect Arcli brand architecture and arcliWins property.
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
    arcliWins: string[]; 
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

export const saasIntegrations: Record<string, SEOPageData> = {
  'analyze-salesforce-data': {
    type: 'integration',
    title: 'Analyze Salesforce Data with AI | Arcli',
    description: 'Connect Salesforce to Arcli. Use conversational AI to track pipeline velocity, rep performance, and win/loss ratios with sub-second latency.',
    h1: 'Chat With Your Salesforce Data',
    subtitle: 'Stop fighting with rigid Salesforce Reports. Ask questions about your pipeline in plain English and get instant architectural visibility.',
    icon: <Cloud className="w-12 h-12 text-sky-500 mb-6" />,
    features: ['Vectorized Pipeline Tracking', 'Dynamic Rep Performance', 'AI Lead Scoring Engine'],
    steps: [
      { name: 'Connect Salesforce', text: 'Authorize Arcli using secure, multi-tenant Salesforce OAuth protocols.' },
      { name: 'Schema Detection', text: 'Our Semantic Router automatically maps your custom objects and metadata fragments.' },
      { name: 'Query Pipeline', text: 'Ask "What is our win rate for Enterprise deals in EMEA this quarter?" and get a verified SQL execution.' }
    ],
    useCases: [
      { title: 'Sales Leadership', description: 'Generate automated weekly pipeline health briefings for the executive team via secure RAG routing.' }
    ],
    faqs: [
      { q: 'Can it read custom Salesforce objects?', a: 'Yes. Arcli maps both standard and custom objects for seamless, context-aware querying.' }
    ],
    relatedSlugs: ['sales-dashboard-template', 'analyze-stripe-data']
  },

  'analyze-shopify-data': {
    type: 'integration',
    title: 'Analyze Shopify E-Commerce Data with AI | Arcli',
    description: 'Turn your Shopify store data into actionable insights. Use Arcli to analyze inventory velocity, customer LTV, and sales trends.',
    h1: 'AI Intelligence for Shopify Stores',
    subtitle: 'Connect your Shopify store and unlock enterprise-grade retail analytics using our high-performance compute engine.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-500 mb-6" />,
    features: ['Predictive Inventory Forecasting', 'Vectorized Customer Segmentation', 'Discount ROI Attribution'],
    steps: [
      { name: 'Install the App', text: 'Connect your Shopify store via our secure integration portal using least-privilege access.' },
      { name: 'Data Normalization', text: 'We automatically clean and map orders and product catalogs into optimized columnar formats.' },
      { name: 'Generate Insights', text: 'Ask "Which product bundle had the highest margin during Black Friday?" for instant visualization.' }
    ],
    useCases: [
      { title: 'Inventory Management', description: 'Use predictive AI to determine reorder points based on historical linear-algebra variance tracking.' }
    ],
    faqs: [
      { q: 'Does this slow down my store?', a: 'Not at all. Arcli syncs data asynchronously via the Shopify Admin API, ensuring zero impact on front-end performance.' }
    ],
    relatedSlugs: ['ecommerce-dashboard-template', 'analyze-stripe-data']
  },

  'google-analytics-ai-dashboard': {
    type: 'integration',
    title: 'Google Analytics 4 AI Dashboard | Arcli',
    description: 'Connect GA4 to Arcli and use AI to analyze web traffic, conversion funnels, and marketing attribution with zero token bloat.',
    h1: 'AI-Powered Google Analytics',
    subtitle: 'GA4 is notoriously complex. Connect it to Arcli and simply ask for the metrics you need using natural language.',
    icon: <Search className="w-12 h-12 text-orange-500 mb-6" />,
    features: ['Attribution Modeling', 'Automated Funnel Analysis', 'Anomaly Detection Guardrails'],
    steps: [
      { name: 'Connect GA4', text: 'Authenticate with Google and select your GA4 property via secure Cloudflare routing.' },
      { name: 'Sync Events', text: 'We pull your standard and custom event data securely into an ephemeral analytical layer.' },
      { name: 'Analyze Traffic', text: 'Ask "What is the conversion rate of blog readers to paid signups?" to see instant trends.' }
    ],
    useCases: [
      { title: 'Marketing Attribution', description: 'Determine exactly which channels are driving high-LTV users using our attribution logic.' }
    ],
    faqs: [
      { q: 'Can I combine GA4 data with my database?', a: 'Yes! You can join GA4 acquisition data with internal Postgres or Snowflake data to calculate true customer ROI.' }
    ],
    relatedSlugs: ['marketing-dashboard-template', 'analyze-shopify-data']
  }
};