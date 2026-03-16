// components/landing/footer.tsx
import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

// --- Types & Interfaces ---

interface NavigationLink {
  name: string;
  href: string;
}

interface NavigationSection {
  title: string;
  links: NavigationLink[];
}

// --- Data Configuration ---

const BRAND_SECTIONS: NavigationSection[] = [
  {
    title: 'Product',
    links: [
      { name: 'Platform', href: '/platform' },
      { name: 'AI Agents', href: '/agents' },
      { name: 'Integrations', href: '/integrations' },
      { name: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { name: 'About', href: '/about' },
      { name: 'Blog', href: '/blog' },
      { name: 'Careers', href: '/careers' },
      { name: 'Press', href: '/press' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { name: 'Privacy Policy', href: '/privacy' },
      { name: 'Terms of Service', href: '/terms' },
      { name: 'Security', href: '/security' },
      { name: 'GDPR', href: '/gdpr' },
    ],
  },
  {
    title: 'Support',
    links: [
      { name: 'Documentation', href: '/docs' },
      { name: 'Status', href: '/status' },
      { name: 'Contact', href: '/contact' },
      { name: 'Community', href: '/community' },
    ],
  },
];

const SEO_SECTIONS: NavigationSection[] = [
  {
    title: 'Comparisons',
    links: [
      { name: 'Tableau vs AI Analytics: The Modern Stack', href: '/tableau-vs-ai-analytics' },
      { name: 'Power BI vs AI Analytics', href: '/power-bi-vs-ai-analytics' },
      { name: 'Metabase vs AI Analytics', href: '/metabase-vs-ai-analytics' },
      { name: 'Looker vs AI Analytics', href: '/looker-vs-ai-analytics' },
      { name: 'Hex vs AI Analytics', href: '/hex-vs-ai-analytics' },
    ],
  },
  {
    title: 'Features',
    links: [
      { name: 'AI Data Analysis Platform', href: '/ai-data-analysis-platform' },
      { name: 'AI Business Intelligence Tools', href: '/ai-business-intelligence-tools' },
      { name: 'Automated AI Dashboard Builder', href: '/automated-ai-dashboard-builder' },
      { name: 'AI Data Visualization Tool', href: '/ai-data-visualization-tool' },
      { name: 'AI Excel Analysis Tool', href: '/ai-excel-analysis' },
      { name: 'Natural Language to SQL Generator', href: '/nl2sql-generator' },
    ],
  },
  {
    title: 'Guides',
    links: [
      { name: 'Text to SQL AI Platform', href: '/text-to-sql' },
      { name: 'Analyze CSV & Excel Files with AI', href: '/analyze-csv-excel-ai' },
      { name: 'How to Analyze Sales Data with AI', href: '/analyze-sales-data-ai' },
      { name: 'How to Build a Dashboard from a CSV File', href: '/build-dashboard-from-csv' },
      { name: 'How to Build a SQL Dashboard Without Coding', href: '/sql-dashboard-no-code' },
    ],
  },
  {
    title: 'Integrations',
    links: [
      { name: 'PostgreSQL AI Analytics & Reporting', href: '/postgresql-ai-analytics' },
      { name: 'MySQL AI Analytics & Dashboard', href: '/mysql-ai-analytics' },
      { name: 'Snowflake AI Analytics Integration', href: '/snowflake-ai-analytics' },
      { name: 'Google BigQuery AI Analytics', href: '/bigquery-ai-analytics' },
      { name: 'Analyze Salesforce Data with AI', href: '/salesforce-ai-analytics' },
      { name: 'Analyze Shopify E-Commerce Data with AI', href: '/shopify-ai-analytics' },
      { name: 'Google Analytics 4 AI Dashboard', href: '/ga4-ai-dashboard' },
    ],
  },
  {
    title: 'Templates',
    links: [
      { name: 'AI Sales Dashboard Template', href: '/sales-dashboard-template' },
      { name: 'SaaS Metrics Dashboard Template', href: '/saas-metrics-template' },
      { name: 'Marketing ROI Dashboard Template', href: '/marketing-roi-template' },
      { name: 'E-Commerce Dashboard Template', href: '/ecommerce-dashboard-template' },
    ],
  },
];

// --- Sub-Components ---

const LinkList: React.FC<{ section: NavigationSection; isSeo?: boolean }> = ({ section, isSeo = false }) => (
  <div className="flex flex-col space-y-4">
    <h3 className={`font-semibold text-zinc-900 ${isSeo ? 'text-sm' : 'text-base'}`}>
      {section.title}
    </h3>
    <ul className="flex flex-col space-y-3">
      {section.links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className={`transition-colors hover:text-blue-600 ${
              isSeo ? 'text-xs text-zinc-500' : 'text-sm text-zinc-600'
            }`}
          >
            {link.name}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

// --- Main Component ---

export default function Footer() {
  return (
    <footer className="w-full bg-white border-t border-zinc-200" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Arclis Footer and Site Navigation
      </h2>
      
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 lg:px-8">
        
        {/* Top Section: Brand & Core Links */}
        <div className="xl:grid xl:grid-cols-3 xl:gap-8 pb-12 border-b border-zinc-100">
          <div className="space-y-6 xl:col-span-1">
            <Link href="/" className="inline-block">
              <span className="sr-only">Arclis</span>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
                  A
                </div>
                <span className="text-xl font-bold text-zinc-900">Arclis.</span>
              </div>
            </Link>
            <p className="text-sm text-zinc-600 leading-relaxed max-w-xs">
              The AI data analyst for modern teams. Ask questions. Get charts. Deploy agents. No SQL required.
            </p>
            <div className="flex gap-x-4">
              <Link 
                href="/register" 
                className="group flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                Start for free
                <ArrowRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
          
          <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <LinkList section={BRAND_SECTIONS[0]} />
              <div className="mt-10 md:mt-0">
                <LinkList section={BRAND_SECTIONS[1]} />
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <LinkList section={BRAND_SECTIONS[2]} />
              <div className="mt-10 md:mt-0">
                <LinkList section={BRAND_SECTIONS[3]} />
              </div>
            </div>
          </div>
        </div>

        {/* Middle Section: Explore Arcli (SEO Links Silo) */}
        <div className="py-12 border-b border-zinc-100">
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-zinc-900">Explore Arcli</h2>
            <p className="mt-2 text-sm text-zinc-500 max-w-2xl">
              Discover how our autonomous data department adapts to your specific analytical needs, features, and workflows.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
            {SEO_SECTIONS.map((section) => (
              <LinkList key={section.title} section={section} isSeo={true} />
            ))}
          </div>
        </div>

        {/* Bottom Section: Copyright & Compliance */}
        <div className="mt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-xs text-zinc-500">
            <p>&copy; {new Date().getFullYear()} Arclis Technologies Inc.</p>
            <span className="hidden md:inline text-zinc-300">•</span>
            <p>Made with care for data teams worldwide.</p>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 border border-zinc-200">
            <ShieldCheck className="w-4 h-4 text-green-600" aria-hidden="true" />
            <span className="text-xs font-medium text-zinc-700 tracking-wide uppercase">
              SOC2 Type II Certified
            </span>
          </div>
        </div>
        
      </div>
    </footer>
  );
}