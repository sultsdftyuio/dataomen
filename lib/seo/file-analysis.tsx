import React from 'react';
import { FileSpreadsheet } from 'lucide-react';

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

export const fileAnalysis: Record<string, SEOPageData> = {
  'analyze-csv-with-ai': {
    type: 'guide',
    title: 'Analyze CSV & Excel Files with AI | DataOmen',
    description: 'Upload your CSV or Excel spreadsheets and let AI clean, normalize, and analyze your data to build instant dashboards.',
    h1: 'Analyze Any CSV with AI Instantly',
    subtitle: 'Drop your messy spreadsheets here. Our AI cleans the data, detects the schema, and builds interactive charts automatically.',
    icon: <FileSpreadsheet className="w-12 h-12 text-amber-500 mb-6" />,
    features: ['Auto Schema Detection', 'Missing Value Imputation', 'One-Click Dashboarding'],
    steps: [
      { name: 'Drag and Drop', text: 'Upload files up to 1GB directly in your browser.' },
      { name: 'AI Cleaning', text: 'Our engine automatically normalizes dates, currencies, and text fields.' },
      { name: 'Start Chatting', text: 'Ask questions about your spreadsheet and get visualized answers.' }
    ],
    useCases: [
      { title: 'Sales Export Processing', description: 'Take raw Salesforce CSV exports and instantly generate pipeline velocity dashboards.' }
    ],
    faqs: [
      { q: 'Can I export the cleaned data?', a: 'Absolutely. Export back to CSV or push it to your connected data warehouse.' }
    ],
    relatedSlugs: ['ai-excel-analysis', 'ai-dashboard-builder']
  }
};