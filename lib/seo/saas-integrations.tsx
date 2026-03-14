import React from 'react';
import { Cloud, ShoppingCart, Search } from 'lucide-react';

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

export const saasIntegrations: Record<string, SEOPageData> = {
  'analyze-salesforce-data': {
    type: 'integration',
    title: 'Analyze Salesforce Data with AI | DataOmen',
    description: 'Connect Salesforce to DataOmen. Use conversational AI to track pipeline velocity, rep performance, and win/loss ratios instantly.',
    h1: 'Chat With Your Salesforce Data',
    subtitle: 'Stop fighting with rigid Salesforce Reports. Ask questions about your pipeline in English and get instant visibility.',
    icon: <Cloud className="w-12 h-12 text-sky-500 mb-6" />,
    features: ['Pipeline Velocity Tracking', 'Rep Performance Dashboards', 'AI Lead Scoring Insights'],
    steps: [
      { name: 'Connect Salesforce', text: 'Authorize DataOmen using secure Salesforce OAuth.' },
      { name: 'Schema Detection', text: 'Our AI automatically maps your custom objects and fields.' },
      { name: 'Query Pipeline', text: 'Ask "What is our win rate for Enterprise deals in EMEA this quarter?"' }
    ],
    useCases: [
      { title: 'Sales Leadership', description: 'Generate automated weekly pipeline health briefings for the executive team.' }
    ],
    faqs: [
      { q: 'Can it read custom Salesforce objects?', a: 'Yes. Our engine maps both standard and custom objects for seamless querying.' }
    ],
    relatedSlugs: ['sales-dashboard-template', 'analyze-stripe-data']
  },

  'analyze-shopify-data': {
    type: 'integration',
    title: 'Analyze Shopify E-Commerce Data with AI | DataOmen',
    description: 'Turn your Shopify store data into actionable insights. Use AI to analyze inventory, customer LTV, and sales trends.',
    h1: 'AI Intelligence for Shopify Stores',
    subtitle: 'Connect your Shopify store and unlock enterprise-grade retail analytics without hiring a data scientist.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-500 mb-6" />,
    features: ['Inventory Forecasting', 'Customer Segmentation', 'Discount Code ROI Tracking'],
    steps: [
      { name: 'Install the App', text: 'Connect your Shopify store via our secure integration portal.' },
      { name: 'Data Normalization', text: 'We automatically clean and map your orders, customers, and product catalogs.' },
      { name: 'Generate Insights', text: 'Ask "Which product bundle had the highest margin during Black Friday?"' }
    ],
    useCases: [
      { title: 'Inventory Management', description: 'Use predictive AI to know exactly when to reorder stock based on historical velocity.' }
    ],
    faqs: [
      { q: 'Does this slow down my store?', a: 'Not at all. We sync data asynchronously via the Shopify Admin API.' }
    ],
    relatedSlugs: ['ecommerce-dashboard-template', 'analyze-stripe-data']
  },

  'google-analytics-ai-dashboard': {
    type: 'integration',
    title: 'Google Analytics 4 AI Dashboard | DataOmen',
    description: 'Connect GA4 to DataOmen and use AI to analyze web traffic, conversion funnels, and marketing attribution.',
    h1: 'AI-Powered Google Analytics',
    subtitle: 'GA4 is notoriously difficult to navigate. Connect it to DataOmen and just ask for the metrics you need.',
    icon: <Search className="w-12 h-12 text-orange-500 mb-6" />,
    features: ['Attribution Modeling', 'Automated Funnel Analysis', 'Bounce Rate Anomaly Detection'],
    steps: [
      { name: 'Connect GA4', text: 'Authenticate with Google and select your GA4 property.' },
      { name: 'Sync Events', text: 'We pull your standard and custom event data securely.' },
      { name: 'Analyze Traffic', text: 'Ask "What is the conversion rate of blog readers to paid signups?"' }
    ],
    useCases: [
      { title: 'Marketing Attribution', description: 'Determine exactly which channels are driving high-LTV users.' }
    ],
    faqs: [
      { q: 'Can I combine GA4 data with my database?', a: 'Yes! You can join GA4 acquisition data with Postgres payment data to see true ROI.' }
    ],
    relatedSlugs: ['marketing-dashboard-template', 'analyze-shopify-data']
  }
};