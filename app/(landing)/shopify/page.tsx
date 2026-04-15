import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { 
  ArrowRight, 
  MessageSquare, 
  TrendingUp, 
  SearchX, 
  PackageSearch,
  CheckCircle2,
  ShieldCheck,
  BrainCircuit,
  BarChart3,
  LineChart,
  Users,
  PieChart,
  DollarSign,
  Activity,
  Link as LinkIcon
} from 'lucide-react';

// ============================================================================
// 1. EXPANDED DATA DICTIONARY (Programmatic SEO Content)
// ============================================================================

interface SeoPageData {
  title: string;
  metaDescription: string;
  linkTitle: string; // Used for the internal linking silo at the bottom
  heroHeadingTag: string;
  heroHeadingMain: string;
  heroHeadingGradient: string;
  heroSubtext: string;
  primaryIcon: React.ReactNode;
  problemTitle: string;
  problemText: string;
  solutionTitle: string;
  solutionText: string;
}

const seoPages: Record<string, SeoPageData> = {
  'analytics-app': {
    title: 'Best Shopify Analytics App Powered by AI | Arcli',
    metaDescription: 'Upgrade from basic Shopify reports. Arcli is an AI-powered Shopify analytics app that lets you chat with your store data to uncover hidden revenue.',
    linkTitle: 'AI Analytics App',
    heroHeadingTag: 'The #1 AI Analytics App for Shopify',
    heroHeadingMain: 'Talk to your Shopify data.',
    heroHeadingGradient: 'Find hidden revenue.',
    heroSubtext: 'Drowning in spreadsheets and basic Shopify reports? Connect your store in 60 seconds and ask Arcli anything in plain English. Get instant e-commerce insights without the coding.',
    primaryIcon: <BarChart3 className="w-6 h-6 text-indigo-500" />,
    problemTitle: 'Standard dashboards are rigid.',
    problemText: 'Native Shopify analytics give you the "what" but rarely the "why." Figuring out exactly what caused a dip in sales takes hours of exporting CSVs.',
    solutionTitle: 'Instant, conversational analytics.',
    solutionText: 'Ask Arcli "Why did revenue drop last Tuesday?" and get a clear, data-backed answer instantly. No SQL, no pivot tables, just answers.'
  },
  'inventory-forecasting': {
    title: 'Shopify Inventory Forecasting & Restock Alerts | Arcli',
    metaDescription: 'Stop losing money to stockouts. Arcli analyzes your Shopify sales velocity to provide accurate inventory forecasting and automated restock alerts.',
    linkTitle: 'Inventory Forecasting',
    heroHeadingTag: 'AI Shopify Inventory Forecasting',
    heroHeadingMain: 'Never run out of',
    heroHeadingGradient: 'your best sellers.',
    heroSubtext: 'Arcli monitors your Shopify sales velocity in real-time. Get AI-driven inventory forecasting and restock alerts before you lose a single dollar to a stockout.',
    primaryIcon: <PackageSearch className="w-6 h-6 text-amber-500" />,
    problemTitle: 'Stockouts kill momentum.',
    problemText: 'Running out of a winning product means pausing ads, losing search ranking, and sending angry customers to your competitors.',
    solutionTitle: 'Predictive inventory AI.',
    solutionText: 'Arcli calculates your dynamic run-rate and lead times. We tell you exactly how many units to reorder and exactly when to place the PO.'
  },
  'increase-aov': {
    title: 'Increase Shopify AOV with AI Product Bundling | Arcli',
    metaDescription: 'Discover exactly which products your customers buy together. Use Arcli\'s AI to increase your Shopify Average Order Value (AOV) instantly.',
    linkTitle: 'Increase AOV',
    heroHeadingTag: 'Maximize Your Average Order Value',
    heroHeadingMain: 'Increase your Shopify AOV',
    heroHeadingGradient: 'without spending more on ads.',
    heroSubtext: 'Customer acquisition is expensive. Arcli analyzes millions of data points to show you the perfect product bundles to increase your Average Order Value instantly.',
    primaryIcon: <TrendingUp className="w-6 h-6 text-emerald-500" />,
    problemTitle: 'Traffic is getting more expensive.',
    problemText: 'With rising CAC (Customer Acquisition Cost) on Meta and Google, you can no longer rely on single-item purchases to stay profitable.',
    solutionTitle: 'Data-backed bundle recommendations.',
    solutionText: 'Arcli reveals the hidden purchase patterns in your store. We show you exactly which 2 or 3 items are frequently bought together so you can bundle them.'
  },
  'customer-segmentation': {
    title: 'Advanced Shopify Customer Segmentation | Arcli',
    metaDescription: 'Find your VIPs and win back churned buyers. Arcli provides advanced AI customer segmentation for Shopify stores.',
    linkTitle: 'Customer Segmentation',
    heroHeadingTag: 'AI-Powered Customer Segmentation',
    heroHeadingMain: 'Know exactly who',
    heroHeadingGradient: 'your best buyers are.',
    heroSubtext: 'Stop treating all your customers the same. Arcli automatically segments your Shopify buyers by LTV, purchase frequency, and churn risk so you can target them effectively.',
    primaryIcon: <Users className="w-6 h-6 text-rose-500" />,
    problemTitle: 'Generic emails don\'t convert.',
    problemText: 'Blasting the same 20% off discount code to your entire list trains your VIPs to wait for sales, destroying your profit margins.',
    solutionTitle: 'Hyper-targeted LTV segments.',
    solutionText: 'Arcli identifies your "Whales" (high LTV), "At-Risk" buyers, and "One-Hit Wonders." Export these segments to Klaviyo in one click.'
  },
  'cohort-analysis': {
    title: 'Automated Shopify Cohort Analysis | Arcli',
    metaDescription: 'Understand your customer retention and LTV with automated Shopify cohort analysis. Stop wrestling with Excel and let AI build your cohort charts.',
    linkTitle: 'Cohort Analysis',
    heroHeadingTag: 'Automated Cohort Tracking',
    heroHeadingMain: 'Track customer retention',
    heroHeadingGradient: 'like a data scientist.',
    heroSubtext: 'Knowing when your customers come back is the key to scaling profitability. Arcli automatically generates beautiful cohort analyses from your Shopify data.',
    primaryIcon: <PieChart className="w-6 h-6 text-purple-500" />,
    problemTitle: 'Cohort analysis in Excel is a nightmare.',
    problemText: 'Trying to map out customer retention by acquisition month using VLOOKUPs and pivot tables is prone to errors and takes hours every week.',
    solutionTitle: 'Real-time cohort generation.',
    solutionText: 'Ask Arcli to "Show me 6-month retention for customers acquired during Black Friday." Get a precise cohort chart and retention curve instantly.'
  },
  'profit-margin-tracker': {
    title: 'Shopify Profit Margin Tracker & Calculator | Arcli',
    metaDescription: 'Stop tracking profit in spreadsheets. Arcli factors in COGS, shipping, discounts, and ad spend to give you real-time Shopify profit margin tracking.',
    linkTitle: 'Profit Margin Tracker',
    heroHeadingTag: 'Real-Time Profit Tracking',
    heroHeadingMain: 'Know your exact profit,',
    heroHeadingGradient: 'down to the penny.',
    heroSubtext: 'Revenue is a vanity metric. Arcli analyzes your COGS, discounts, returns, and sales data to show you your true net profit across every product line.',
    primaryIcon: <DollarSign className="w-6 h-6 text-emerald-500" />,
    problemTitle: 'Shopify only shows you top-line revenue.',
    problemText: 'You might be selling thousands of dollars of a product, but after COGS, free shipping, and discount codes, you could actually be losing money on every order.',
    solutionTitle: 'True SKU-level profitability.',
    solutionText: 'Arcli syncs your costs and instantly highlights your most and least profitable items. Ask "Which products have the lowest profit margin this month?" to stop the bleeding.'
  },
  'custom-report-builder': {
    title: 'AI Custom Report Builder for Shopify | Arcli',
    metaDescription: 'Ditch the CSV exports. Use Arcli\'s AI to build custom Shopify reports in seconds just by typing what you want to see.',
    linkTitle: 'Custom Report Builder',
    heroHeadingTag: 'The Ultimate Custom Report Builder',
    heroHeadingMain: 'Build custom Shopify reports',
    heroHeadingGradient: 'in seconds, not hours.',
    heroSubtext: 'Need a specific breakdown of sales by region, discount code, and UTM parameter? Just ask Arcli. We generate custom, boardroom-ready reports instantly.',
    primaryIcon: <LineChart className="w-6 h-6 text-blue-500" />,
    problemTitle: 'You are limited by pre-built templates.',
    problemText: 'Most analytics tools force your data into their specific templates. If you need a unique view of your data, you have to export to CSV and do it yourself.',
    solutionTitle: 'Conversational report generation.',
    solutionText: 'Type: "Create a report of all orders over $100 in California that used the code SUMMER20." Arcli builds the exact data table you need on the fly.'
  },
  'customer-retention': {
    title: 'Improve Shopify Customer Retention | Arcli',
    metaDescription: 'Boost your Shopify customer retention rate. Arcli identifies churn risks and tells you exactly when to re-engage past buyers.',
    linkTitle: 'Customer Retention',
    heroHeadingTag: 'Predictive Retention AI',
    heroHeadingMain: 'Turn one-time buyers',
    heroHeadingGradient: 'into loyal brand advocates.',
    heroSubtext: 'It costs 5x more to acquire a new customer than to keep an existing one. Arcli uses AI to predict when a customer is about to churn so you can win them back.',
    primaryIcon: <Activity className="w-6 h-6 text-rose-400" />,
    problemTitle: 'You only engage when they are already gone.',
    problemText: 'Most brands wait until a customer hasn\'t bought for 6 months to send a "We miss you" email. By then, they are already shopping with competitors.',
    solutionTitle: 'Predictive churn alerts.',
    solutionText: 'Arcli learns the unique buying cycle for your products. We flag customers the moment they slip past their expected reorder date, allowing you to trigger timely win-back campaigns.'
  }
};

const BASE_URL = 'https://arcli.tech';
const DEFAULT_SHOPIFY_SLUG = 'analytics-app';

// ============================================================================
// 2. NEXT.JS DYNAMIC ROUTING & SEO
// ============================================================================

export async function generateStaticParams() {
  return Object.keys(seoPages).map((slug) => ({
    slug: slug,
  }));
}

export async function generateMetadata({ params }: { params?: { slug?: string } }): Promise<Metadata> {
  const slug = params?.slug;

  if (!slug) {
    const canonicalUrl = `${BASE_URL}/shopify/${DEFAULT_SHOPIFY_SLUG}`;
    const ogImageUrl = `${BASE_URL}/api/og?title=Shopify%20AI%20Analytics%20Pages&type=shopify`;

    return {
      title: 'Shopify AI Analytics | Arcli',
      description: 'Explore conversion-focused Shopify analytics pages powered by Arcli AI.',
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title: 'Shopify AI Analytics | Arcli',
        description: 'Explore conversion-focused Shopify analytics pages powered by Arcli AI.',
        url: canonicalUrl,
        siteName: 'Arcli',
        locale: 'en_US',
        type: 'website',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: 'Shopify AI analytics pages by Arcli',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Shopify AI Analytics | Arcli',
        description: 'Explore conversion-focused Shopify analytics pages powered by Arcli AI.',
        images: [ogImageUrl],
      },
    };
  }

  const pageData = seoPages[slug];
  
  if (!pageData) {
    return {
      title: 'Not Found',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const canonicalUrl = `${BASE_URL}/shopify/${slug}`;
  const ogImageUrl = new URL('/api/og', BASE_URL);
  ogImageUrl.searchParams.set('title', pageData.title);
  ogImageUrl.searchParams.set('type', 'shopify');

  return {
    title: pageData.title,
    description: pageData.metaDescription,
    openGraph: {
      title: pageData.title,
      description: pageData.metaDescription,
      url: canonicalUrl,
      siteName: 'Arcli',
      locale: 'en_US',
      type: 'website',
      images: [
        {
          url: ogImageUrl.toString(),
          width: 1200,
          height: 630,
          alt: `${pageData.linkTitle} | Arcli`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageData.title,
      description: pageData.metaDescription,
      images: [ogImageUrl.toString()],
    },
    alternates: {
      canonical: canonicalUrl,
    }
  };
}

// ============================================================================
// 3. PAGE COMPONENT
// ============================================================================

export default function ShopifySeoLandingPage({ params }: { params?: { slug?: string } }) {
  const slug = params?.slug;
  if (!slug) {
    redirect(`/shopify/${DEFAULT_SHOPIFY_SLUG}`);
  }

  const pageData = seoPages[slug];

  if (!pageData) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-indigo-500/30">
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-white to-white dark:from-indigo-900/20 dark:via-zinc-950 dark:to-zinc-950 -z-10"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-4xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-sm font-medium border border-indigo-100 dark:border-indigo-500/20">
              {pageData.primaryIcon}
              <span>{pageData.heroHeadingTag}</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-balance leading-tight">
              {pageData.heroHeadingMain}<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">
                {pageData.heroHeadingGradient}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed text-balance">
              {pageData.heroSubtext}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link 
                href="/register" 
                className="w-full sm:w-auto px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all flex items-center justify-center gap-2 shadow-xl shadow-zinc-900/20 dark:shadow-white/10"
              >
                Start 3-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-500 pt-4 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Secure Shopify Integration. Setup in 60s.
            </p>
          </div>
        </div>
      </section>

      {/* Dynamic Problem / Solution Grid */}
      <section className="py-20 bg-zinc-50 dark:bg-zinc-900/20 border-y border-zinc-200 dark:border-zinc-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
              <div className="mb-4">
                <span className="text-xs font-bold text-rose-500 uppercase tracking-wider flex items-center gap-2">
                  <SearchX className="w-4 h-4" /> The Problem
                </span>
                <h3 className="text-2xl font-bold mt-2 text-zinc-900 dark:text-zinc-100">{pageData.problemTitle}</h3>
              </div>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {pageData.problemText}
              </p>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-8 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10">
                 {pageData.primaryIcon}
               </div>
              <div className="mb-4">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> The Arcli Solution
                </span>
                <h3 className="text-2xl font-bold mt-2 text-zinc-900 dark:text-zinc-100">{pageData.solutionTitle}</h3>
              </div>
              <p className="text-lg text-zinc-700 dark:text-zinc-300 leading-relaxed relative z-10">
                {pageData.solutionText}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Universal Chat Interface Mockup */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Just ask. Arcli does the rest.</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">No formulas, no SQL, no coding. If you can text, you can do advanced data analytics.</p>
          </div>
          
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-2 md:p-4 shadow-2xl relative overflow-hidden backdrop-blur-sm">
            <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <div className="h-12 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-2 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <div className="mx-auto font-medium text-sm text-zinc-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Shopify Store Sync Active
                </div>
              </div>

              <div className="p-6 md:p-10 flex flex-col gap-8">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-zinc-600 dark:text-zinc-400 font-bold text-sm">You</span>
                  </div>
                  <div className="bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl rounded-tl-none px-5 py-3 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/50 max-w-xl text-lg">
                    "Give me a summary of my store's performance this week compared to last week."
                  </div>
                </div>
                
                <div className="flex items-start gap-4 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <BrainCircuit className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl rounded-tr-none px-6 py-5 text-zinc-800 dark:text-zinc-200 border border-indigo-100 dark:border-indigo-500/20 max-w-2xl w-full space-y-4">
                    <p className="text-lg">Here is your weekly Shopify performance breakdown:</p>
                    <ul className="space-y-3 mt-4">
                      <li className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">Total Revenue</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">$14,240 (+12%)</span>
                      </li>
                      <li className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">Average Order Value (AOV)</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">$84.50 (+5%)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. THE SEO LINK SILO (Passes Link Equity to all other Shopify Pages) */}
      <section className="py-16 bg-zinc-50 dark:bg-zinc-900/30 border-t border-zinc-200 dark:border-zinc-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-8">
            <LinkIcon className="w-5 h-5 text-indigo-500" />
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Explore More Shopify Analytics Use Cases
            </h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(seoPages)
              // Filter out the current page so we don't link to ourselves
              .filter(([slug]) => slug !== params.slug)
              .map(([slug, data]) => (
                <Link 
                  key={slug} 
                  href={`/shopify/${slug}`}
                  className="group flex items-center justify-between p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-500 transition-colors shadow-sm"
                >
                  <span className="font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {data.linkTitle}
                  </span>
                  <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 transition-colors group-hover:translate-x-1" />
                </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Universal CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-indigo-600 dark:bg-indigo-900"></div>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        
        <div className="container mx-auto px-4 relative z-10 text-center text-white max-w-3xl">
          <MessageSquare className="w-16 h-16 mx-auto mb-6 text-indigo-200" />
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-balance">
            Stop guessing. Start knowing.
          </h2>
          <p className="text-indigo-100 text-xl mb-10 text-balance">
            Try Arcli risk-free. No credit card required. Setup takes exactly 60 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/register" 
              className="px-8 py-4 bg-white text-indigo-600 rounded-lg font-bold hover:bg-zinc-50 transition-colors shadow-xl text-lg w-full sm:w-auto flex items-center justify-center gap-2"
            >
              Start 3-Day Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>
      
    </div>
  );
}