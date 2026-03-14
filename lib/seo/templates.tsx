import React from 'react';
import { LayoutTemplate, DollarSign, Users, ShoppingCart } from 'lucide-react';

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

export const dashboardTemplates: Record<string, SEOPageData> = {
  'sales-dashboard-template': {
    type: 'template',
    title: 'AI Sales Dashboard Template | DataOmen',
    description: 'Deploy our automated Sales Dashboard template to track MRR, win rates, and rep performance instantly via AI.',
    h1: 'The Ultimate AI Sales Dashboard Template',
    subtitle: 'Connect your CRM or database and let our AI instantiate a best-in-class sales leadership dashboard automatically.',
    icon: <LayoutTemplate className="w-12 h-12 text-indigo-500 mb-6" />,
    features: ['Pre-built KPI Logic', 'Live Data Sync', 'Mobile Optimized'],
    steps: [
      { name: 'Select Template', text: 'Choose the Sales Executive Dashboard template.' },
      { name: 'Map Data Sources', text: 'Point the template to your CRM or SQL database.' },
      { name: 'Deploy', text: 'The AI maps your schema to the template metrics and goes live.' }
    ],
    useCases: [
      { title: 'Executive Visibility', description: 'Give your CEO real-time access to the metrics that matter.' }
    ],
    faqs: [
      { q: 'Can I modify the template?', a: 'Yes. Once deployed, you can use natural language to add or remove charts.' }
    ],
    relatedSlugs: ['how-to-analyze-sales-data', 'analyze-salesforce-data']
  },

  'saas-metrics-dashboard-template': {
    type: 'template',
    title: 'SaaS Metrics Dashboard Template | DataOmen',
    description: 'Track MRR, ARR, Churn, LTV, and CAC automatically with our AI-powered SaaS metrics dashboard template.',
    h1: 'Automated SaaS Metrics Dashboard',
    subtitle: 'Stop calculating NRR in Excel. Deploy this template and track the exact health of your SaaS business in real-time.',
    icon: <DollarSign className="w-12 h-12 text-emerald-500 mb-6" />,
    features: ['MRR/ARR Tracking', 'Cohort Retention AI', 'CAC Payback Calculators'],
    steps: [
      { name: 'Connect Billing', text: 'Link your Stripe or payment processor data.' },
      { name: 'Connect Product', text: 'Link your Postgres database for usage metrics.' },
      { name: 'Generate', text: 'Watch the AI calculate complex SaaS metrics like Net Revenue Retention instantly.' }
    ],
    useCases: [
      { title: 'Board Reporting', description: 'Generate perfectly accurate SaaS metrics for your investor updates.' }
    ],
    faqs: [
      { q: 'Does it handle upgrades and downgrades?', a: 'Yes, our template automatically splits MRR movements into New, Expansion, Contraction, and Churn.' }
    ],
    relatedSlugs: ['analyze-stripe-data', 'ai-business-intelligence']
  },

  'marketing-dashboard-template': {
    type: 'template',
    title: 'Marketing ROI Dashboard Template | DataOmen',
    description: 'Deploy our automated Marketing Dashboard template to track CAC, ROAS, and conversion funnels across all your channels.',
    h1: 'The Ultimate AI Marketing Dashboard',
    subtitle: 'Stop merging Facebook and Google Ads data in Excel. Deploy this template to track your true blended ROI.',
    icon: <Users className="w-12 h-12 text-pink-500 mb-6" />,
    features: ['Blended CAC Calculation', 'Attribution AI', 'Cross-Platform Sync'],
    steps: [
      { name: 'Connect Ad Platforms', text: 'Link your marketing channels via our secure integrations.' },
      { name: 'Connect CRM', text: 'Link Salesforce or HubSpot to track closed-won revenue.' },
      { name: 'Launch Template', text: 'Watch the AI map spend against actual revenue to calculate true ROAS.' }
    ],
    useCases: [
      { title: 'Agency Reporting', description: 'Provide clients with perfectly transparent, real-time campaign performance.' }
    ],
    faqs: [
      { q: 'Does it handle multi-touch attribution?', a: 'Our AI can automatically generate first-touch, last-touch, and linear attribution models based on your raw data.' }
    ],
    relatedSlugs: ['google-analytics-ai-dashboard', 'sales-dashboard-template']
  },

  'ecommerce-dashboard-template': {
    type: 'template',
    title: 'E-Commerce Dashboard Template | DataOmen',
    description: 'Track Shopify sales, inventory, and customer lifetime value with our AI-powered e-commerce dashboard template.',
    h1: 'Automated E-Commerce Dashboard',
    subtitle: 'Know exactly what your margins are and when to reorder inventory with our plug-and-play e-commerce template.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-400 mb-6" />,
    features: ['Inventory Forecasting', 'Customer LTV Tracking', 'Gross Margin Analytics'],
    steps: [
      { name: 'Connect Store', text: 'Link your Shopify or custom database.' },
      { name: 'Map Costs', text: 'Input your COGS (Cost of Goods Sold) rules.' },
      { name: 'Deploy', text: 'Get instant visibility into profitability by SKU and product category.' }
    ],
    useCases: [
      { title: 'Black Friday Monitoring', description: 'Watch live conversion rates and inventory depletion during peak traffic events.' }
    ],
    faqs: [
      { q: 'Can it track subscription boxes?', a: 'Yes! The AI easily handles recurring billing metrics if you use tools like Recharge.' }
    ],
    relatedSlugs: ['analyze-shopify-data', 'analyze-stripe-data']
  }
};