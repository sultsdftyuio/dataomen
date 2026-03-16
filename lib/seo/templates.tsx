import React from 'react';
import { LayoutTemplate, DollarSign, Users, ShoppingCart } from 'lucide-react';

/**
 * SEOPageData Interface
 * Updated for Arcli rebrand and standardized across all SEO modules.
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

export const dashboardTemplates: Record<string, SEOPageData> = {
  'sales-dashboard-template': {
    type: 'template',
    title: 'AI Sales Dashboard Template | Arcli',
    description: 'Deploy our automated Sales Dashboard template to track MRR, win rates, and rep performance instantly via high-performance AI.',
    h1: 'The Ultimate AI Sales Dashboard Template',
    subtitle: 'Connect your CRM or database and let our AI instantiate a best-in-class sales leadership dashboard using vectorized KPI logic.',
    icon: <LayoutTemplate className="w-12 h-12 text-indigo-500 mb-6" />,
    features: ['Vectorized KPI Logic', 'Sub-second Data Sync', 'Multi-tenant Isolation'],
    steps: [
      { name: 'Select Template', text: 'Choose the Sales Executive Dashboard template from our library.' },
      { name: 'Map Data Sources', text: 'Point the template to your CRM or SQL database via secure read-only connections.' },
      { name: 'Deploy', text: 'The RAG engine maps your schema to the template metrics and instantiates the dashboard.' }
    ],
    useCases: [
      { title: 'Executive Visibility', description: 'Give your leadership real-time access to the metrics that matter with mathematical precision.' }
    ],
    faqs: [
      { q: 'Can I modify the template?', a: 'Yes. Once deployed, you can use natural language to add or remove charts, modifying the underlying SQL instantly.' }
    ],
    relatedSlugs: ['how-to-analyze-sales-data', 'analyze-salesforce-data']
  },

  'saas-metrics-dashboard-template': {
    type: 'template',
    title: 'SaaS Metrics Dashboard Template | Arcli',
    description: 'Track MRR, ARR, Churn, LTV, and CAC automatically with our AI-powered, high-performance SaaS metrics dashboard template.',
    h1: 'Automated SaaS Metrics Dashboard',
    subtitle: 'Stop calculating NRR in Excel. Deploy this template and track the exact health of your SaaS business with linear algebra-based precision.',
    icon: <DollarSign className="w-12 h-12 text-emerald-500 mb-6" />,
    features: ['Precise MRR/ARR Tracking', 'Vectorized Cohort Retention', 'Automated CAC Payback Models'],
    steps: [
      { name: 'Connect Billing', text: 'Link your Stripe or payment processor data securely.' },
      { name: 'Connect Product', text: 'Link your Postgres or Snowflake database for usage metrics.' },
      { name: 'Generate', text: 'The Arcli compute engine calculates complex SaaS metrics like Net Revenue Retention instantly.' }
    ],
    useCases: [
      { title: 'Board Reporting', description: 'Generate perfectly accurate SaaS metrics for your investor updates and board decks.' }
    ],
    faqs: [
      { q: 'Does it handle upgrades and downgrades?', a: 'Yes. Our template automatically partitions MRR movements into New, Expansion, Contraction, and Churn using precise delta logic.' }
    ],
    relatedSlugs: ['analyze-stripe-data', 'ai-business-intelligence']
  },

  'marketing-dashboard-template': {
    type: 'template',
    title: 'Marketing ROI Dashboard Template | Arcli',
    description: 'Deploy our automated Marketing Dashboard template to track CAC, ROAS, and conversion funnels across all channels with zero data movement.',
    h1: 'The Ultimate AI Marketing Dashboard',
    subtitle: 'Stop merging siloed ad data in Excel. Deploy this template to track your true blended ROI using our attribution AI.',
    icon: <Users className="w-12 h-12 text-pink-500 mb-6" />,
    features: ['Blended CAC Attribution', 'Vectorized ROI Calculation', 'Cross-Platform Semantic Sync'],
    steps: [
      { name: 'Connect Ad Platforms', text: 'Link your marketing channels via our secure Cloudflare-protected integrations.' },
      { name: 'Connect CRM', text: 'Link Salesforce or HubSpot to track closed-won revenue against ad spend.' },
      { name: 'Launch Template', text: 'The AI maps spend against actual revenue to calculate true ROAS with sub-second latency.' }
    ],
    useCases: [
      { title: 'Agency Reporting', description: 'Provide clients with perfectly transparent, real-time campaign performance dashboards.' }
    ],
    faqs: [
      { q: 'Does it handle multi-touch attribution?', a: 'Yes. Our AI can automatically generate first-touch, last-touch, and linear attribution models based on your raw data streams.' }
    ],
    relatedSlugs: ['google-analytics-ai-dashboard', 'sales-dashboard-template']
  },

  'ecommerce-dashboard-template': {
    type: 'template',
    title: 'E-Commerce Dashboard Template | Arcli',
    description: 'Track Shopify sales, inventory, and customer lifetime value with our AI-powered, columnar e-commerce dashboard template.',
    h1: 'Automated E-Commerce Dashboard',
    subtitle: 'Know exactly what your margins are and when to reorder inventory with our plug-and-play e-commerce template.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-400 mb-6" />,
    features: ['Columnar Inventory Forecasting', 'Vectorized LTV Tracking', 'High-Precision Margin Analytics'],
    steps: [
      { name: 'Connect Store', text: 'Link your Shopify or custom database using secure OAuth.' },
      { name: 'Map Costs', text: 'Input your COGS (Cost of Goods Sold) rules via our semantic interface.' },
      { name: 'Deploy', text: 'Get instant architectural visibility into profitability by SKU and product category.' }
    ],
    useCases: [
      { title: 'Black Friday Monitoring', description: 'Monitor live conversion rates and inventory depletion using our high-velocity compute engine.' }
    ],
    faqs: [
      { q: 'Can it track subscription boxes?', a: 'Yes. The AI handles recurring billing metrics natively, integrating with tools like Recharge or Stripe Billing.' }
    ],
    relatedSlugs: ['analyze-shopify-data', 'analyze-stripe-data']
  }
};