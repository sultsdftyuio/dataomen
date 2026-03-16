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
    arcliWins: string[]; 
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

export const fileAnalysis: Record<string, SEOPageData> = {
  'analyze-csv-with-ai': {
    type: 'guide',
    title: 'Analyze CSV & Excel Files with AI | Arcli',
    description: 'Upload your CSV or Excel spreadsheets and let AI clean, normalize, and analyze your data to build instant, high-performance dashboards.',
    h1: 'Analyze Any CSV with AI Instantly',
    subtitle: 'Drop your messy spreadsheets here. Our vectorized AI engine cleans the data, infers the schema, and builds interactive charts automatically.',
    icon: <FileSpreadsheet className="w-12 h-12 text-amber-500 mb-6" />,
    features: ['Auto Schema Detection', 'In-Browser Columnar Execution', 'Zero-Retention Ephemeral Processing'],
    steps: [
      { name: 'Drag and Drop', text: 'Upload files up to 1GB directly. Data is parsed using high-speed columnar processing for maximum efficiency.' },
      { name: 'AI Normalization', text: 'Our engine automatically normalizes dates, currencies, and broken text fields using semantic vectorized operations.' },
      { name: 'Start Chatting', text: 'Ask complex analytical questions about your spreadsheet and get sub-second visualized answers.' }
    ],
    useCases: [
      { title: 'Sales Export Processing', description: 'Take raw CRM CSV exports and instantly generate dynamic pipeline velocity dashboards.' },
      { title: 'Financial Modeling', description: 'Process heavy financial exports without the lag and freezing typical of traditional spreadsheet software.' }
    ],
    faqs: [
      { q: 'Can I export the cleaned data?', a: 'Absolutely. Export back to CSV, high-performance Parquet, or push the refined dataset directly to your connected data warehouse.' },
      { q: 'Is my uploaded file secure?', a: 'Yes. We utilize zero-retention ephemeral processing. Your raw files are never stored persistently on our servers without explicit permission.' }
    ],
    relatedSlugs: ['ai-excel-analysis', 'ai-dashboard-builder']
  }
};