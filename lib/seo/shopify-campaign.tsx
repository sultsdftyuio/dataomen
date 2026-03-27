import React from 'react';
import { 
  TrendingUp, 
  PackageSearch,
  Users,
  PieChart,
  DollarSign,
  Activity,
  LineChart
} from 'lucide-react';

// Assuming your existing SEO files export objects that match a specific interface
// This matches the content structure of your other landing pages.
export const shopifySeoPages = {
  'shopify-inventory-forecasting': {
    title: 'Shopify Inventory Forecasting & Restock Alerts | Arcli',
    description: 'Stop losing money to stockouts. Arcli analyzes your Shopify sales velocity to provide accurate inventory forecasting and automated restock alerts.',
    heroTitle: 'Never run out of your best sellers.',
    heroSubtitle: 'AI Shopify Inventory Forecasting',
    heroDescription: 'Arcli monitors your Shopify sales velocity in real-time. Get AI-driven inventory forecasting and restock alerts before you lose a single dollar to a stockout.',
    icon: <PackageSearch className="w-6 h-6 text-amber-500" />,
    features: [
      {
        title: 'Predictive inventory AI.',
        description: 'Arcli calculates your dynamic run-rate and lead times. We tell you exactly how many units to reorder and exactly when to place the PO.'
      }
    ]
  },
  'increase-shopify-aov': {
    title: 'Increase Shopify AOV with AI Product Bundling | Arcli',
    description: 'Discover exactly which products your customers buy together. Use Arcli\'s AI to increase your Shopify Average Order Value (AOV) instantly.',
    heroTitle: 'Increase your Shopify AOV without spending more on ads.',
    heroSubtitle: 'Maximize Your Average Order Value',
    heroDescription: 'Customer acquisition is expensive. Arcli analyzes millions of data points to show you the perfect product bundles to increase your Average Order Value instantly.',
    icon: <TrendingUp className="w-6 h-6 text-emerald-500" />,
    features: [
      {
        title: 'Data-backed bundle recommendations.',
        description: 'Arcli reveals the hidden purchase patterns in your store. We show you exactly which 2 or 3 items are frequently bought together so you can bundle them.'
      }
    ]
  },
  'shopify-customer-segmentation': {
    title: 'Advanced Shopify Customer Segmentation | Arcli',
    description: 'Find your VIPs and win back churned buyers. Arcli provides advanced AI customer segmentation for Shopify stores.',
    heroTitle: 'Know exactly who your best buyers are.',
    heroSubtitle: 'AI-Powered Customer Segmentation',
    heroDescription: 'Stop treating all your customers the same. Arcli automatically segments your Shopify buyers by LTV, purchase frequency, and churn risk so you can target them effectively.',
    icon: <Users className="w-6 h-6 text-rose-500" />,
    features: [
      {
        title: 'Hyper-targeted LTV segments.',
        description: 'Arcli identifies your "Whales" (high LTV), "At-Risk" buyers, and "One-Hit Wonders." Export these segments to Klaviyo in one click.'
      }
    ]
  },
  'shopify-cohort-analysis': {
    title: 'Automated Shopify Cohort Analysis | Arcli',
    description: 'Understand your customer retention and LTV with automated Shopify cohort analysis. Stop wrestling with Excel and let AI build your cohort charts.',
    heroTitle: 'Track customer retention like a data scientist.',
    heroSubtitle: 'Automated Cohort Tracking',
    heroDescription: 'Knowing when your customers come back is the key to scaling profitability. Arcli automatically generates beautiful cohort analyses from your Shopify data.',
    icon: <PieChart className="w-6 h-6 text-purple-500" />,
    features: [
      {
        title: 'Real-time cohort generation.',
        description: 'Ask Arcli to "Show me 6-month retention for customers acquired during Black Friday." Get a precise cohort chart and retention curve instantly.'
      }
    ]
  },
  'shopify-profit-margin-tracker': {
    title: 'Shopify Profit Margin Tracker & Calculator | Arcli',
    description: 'Stop tracking profit in spreadsheets. Arcli factors in COGS, shipping, discounts, and ad spend to give you real-time Shopify profit margin tracking.',
    heroTitle: 'Know your exact profit, down to the penny.',
    heroSubtitle: 'Real-Time Profit Tracking',
    heroDescription: 'Revenue is a vanity metric. Arcli analyzes your COGS, discounts, returns, and sales data to show you your true net profit across every product line.',
    icon: <DollarSign className="w-6 h-6 text-emerald-500" />,
    features: [
      {
        title: 'True SKU-level profitability.',
        description: 'Arcli syncs your costs and instantly highlights your most and least profitable items. Ask "Which products have the lowest profit margin this month?" to stop the bleeding.'
      }
    ]
  },
  'shopify-custom-reports': {
    title: 'AI Custom Report Builder for Shopify | Arcli',
    description: 'Ditch the CSV exports. Use Arcli\'s AI to build custom Shopify reports in seconds just by typing what you want to see.',
    heroTitle: 'Build custom Shopify reports in seconds, not hours.',
    heroSubtitle: 'The Ultimate Custom Report Builder',
    heroDescription: 'Need a specific breakdown of sales by region, discount code, and UTM parameter? Just ask Arcli. We generate custom, boardroom-ready reports instantly.',
    icon: <LineChart className="w-6 h-6 text-blue-500" />,
    features: [
      {
        title: 'Conversational report generation.',
        description: 'Type: "Create a report of all orders over $100 in California that used the code SUMMER20." Arcli builds the exact data table you need on the fly.'
      }
    ]
  }
};