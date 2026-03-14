import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, BarChart3, Database, FileSpreadsheet, Sparkles, 
  ChevronRight, CheckCircle2, ShoppingCart, CreditCard, X, Check,
  ListTodo
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// 1. OMNI-CHANNEL CONTENT DICTIONARY (Features, Integrations, Comparisons)
// This schema now supports the 5 pillars of SaaS SEO.
// When you migrate to Supabase, this becomes your exact SQL table schema.
type SEOPageData = {
  type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: JSX.Element;
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

const seoPages: Record<string, SEOPageData> = {
  'ai-data-analysis': {
    type: 'feature',
    title: 'AI Data Analysis Platform | DataOmen',
    description: 'Transform your raw data into actionable business intelligence instantly with our AI data analysis platform. No coding required.',
    h1: 'AI Data Analysis Built for Speed',
    subtitle: 'Upload your data and let our AI engine uncover patterns, anomalies, and insights in seconds.',
    icon: <Sparkles className="w-12 h-12 text-blue-500 mb-6" />,
    features: ['Instant Anomaly Detection', 'Predictive Forecasting', 'Automated Insights Generation'],
    steps: [
      { name: 'Connect Data', text: 'Securely connect your database or upload a CSV. We enforce read-only connections for absolute security.' },
      { name: 'Ask in Plain English', text: 'Type your question naturally. Our Semantic Router translates it into optimized SQL.' },
      { name: 'Get Instant Charts', text: 'Our vectorized compute engine (DuckDB/Polars) processes the data and generates a verified dashboard.' }
    ],
    useCases: [
      { title: 'Financial Forecasting', description: 'Automatically detect seasonal trends and generate rolling forecasts.' },
      { title: 'Customer Churn Analysis', description: 'Identify at-risk accounts before they cancel by analyzing usage patterns.' }
    ],
    faqs: [
      { q: 'What is AI data analysis?', a: 'AI data analysis uses machine learning algorithms to automatically clean, process, and extract actionable insights from raw data.' }
    ],
    relatedSlugs: ['analyze-stripe-data', 'dataomen-vs-tableau']
  },
  'analyze-stripe-data': {
    type: 'integration',
    title: 'Analyze Stripe Revenue Data with AI | DataOmen',
    description: 'Connect your Stripe account and use AI to analyze MRR, churn, cohort retention, and customer lifetime value instantly.',
    h1: 'AI Analytics for Your Stripe Data',
    subtitle: 'Stop exporting Stripe data to Excel. Connect directly and ask questions about your revenue in plain English.',
    icon: <CreditCard className="w-12 h-12 text-indigo-500 mb-6" />,
    features: ['Instant MRR/ARR Dashboards', 'Automated Cohort Analysis', 'Failed Payment Anomaly Detection'],
    steps: [
      { name: 'Authenticate Stripe', text: 'Use our secure OAuth integration to connect your Stripe account in one click.' },
      { name: 'Sync Historical Data', text: 'Our Sync Engine pulls your transaction and subscription history securely.' },
      { name: 'Analyze Revenue', text: 'Ask "Show me MRR churn categorized by pricing tier for the last 6 months" and get instant answers.' }
    ],
    useCases: [
      { title: 'SaaS Metrics', description: 'Instantly calculate net revenue retention (NRR) and blended CAC.' }
    ],
    faqs: [
      { q: 'Is my financial data secure?', a: 'Yes. DataOmen utilizes strict tenant isolation via Supabase RLS and only requests read access to your Stripe data.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'analyze-shopify-data']
  },
  'dataomen-vs-tableau': {
    type: 'comparison',
    title: 'DataOmen vs Tableau: The Best AI Alternative | DataOmen',
    description: 'Compare DataOmen and Tableau. See why modern data teams are switching to AI-native analytics to cut costs and increase speed.',
    h1: 'The Modern Tableau Alternative',
    subtitle: 'Stop wrestling with complex BI workflows and proprietary languages. Discover how AI-native analytics reduces time-to-insight from weeks to seconds.',
    icon: <BarChart3 className="w-12 h-12 text-rose-500 mb-6" />,
    features: ['Zero Proprietary Languages', 'Instant Setup', 'Fraction of the Cost'],
    steps: [
      { name: 'Connect Data', text: 'Link your Postgres, Snowflake, or CSVs directly without needing a data engineering pipeline.' },
      { name: 'Ask Questions', text: 'Instead of building manual dashboard views, just type what you want to know.' },
      { name: 'Share Insights', text: 'Send interactive, self-updating charts to your team via secure URLs.' }
    ],
    comparison: {
      competitor: 'Tableau',
      dataOmenWins: ['Conversational AI Interface (NL2SQL)', 'Zero learning curve for business users', 'No expensive desktop licenses required'],
      competitorFlaws: ['Requires knowing VizQL and complex calculated fields', 'Extremely expensive for full-org deployment', 'Slow desktop-to-cloud publishing workflows']
    },
    useCases: [
      { title: 'Democratizing Data', description: 'Allow marketing and sales teams to pull their own reports without waiting on data analysts.' }
    ],
    faqs: [
      { q: 'Can I migrate my Tableau dashboards to DataOmen?', a: 'Yes. While we do not directly import .twbx files, our AI can recreate your core metrics and dashboards in minutes just by connecting the same underlying data source.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'analyze-stripe-data']
  }
};

interface PageProps { params: { slug: string; }; }

// 2. BUILD-TIME STATIC GENERATION (0ms Latency)
export function generateStaticParams() {
  return Object.keys(seoPages).map((slug) => ({ slug }));
}

// 3. DYNAMIC METADATA & AUTOMATIC OG IMAGES
export function generateMetadata({ params }: PageProps): Metadata {
  const pageData = seoPages[params.slug];
  if (!pageData) return { title: 'Not Found' };

  // Points to an automatic OpenGraph generator (e.g., /api/og)
  const ogImageUrl = new URL('https://dataomen.com/api/og');
  ogImageUrl.searchParams.set('title', pageData.h1);
  ogImageUrl.searchParams.set('type', pageData.type);

  return {
    title: pageData.title,
    description: pageData.description,
    openGraph: {
      title: pageData.title,
      description: pageData.description,
      type: 'article',
      url: `https://dataomen.com/${params.slug}`,
      images: [{ url: ogImageUrl.toString(), width: 1200, height: 630 }]
    },
    alternates: { canonical: `https://dataomen.com/${params.slug}` },
  };
}

export default function SEOPage({ params }: PageProps) {
  const pageData = seoPages[params.slug];
  if (!pageData) notFound();

  // 4. THE ULTIMATE JSON-LD GRAPH (Software + Article + FAQ + HowTo + Breadcrumbs)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'DataOmen',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: pageData.description,
        url: `https://dataomen.com/${params.slug}`,
      },
      {
        '@type': 'Article',
        headline: pageData.h1,
        description: pageData.description,
        author: { '@type': 'Organization', name: 'DataOmen', url: 'https://dataomen.com' },
        publisher: { 
          '@type': 'Organization', 
          name: 'DataOmen', 
          logo: { '@type': 'ImageObject', url: 'https://dataomen.com/icon.png' } 
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id:': `https://dataomen.com/${params.slug}` }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dataomen.com' },
          { '@type': 'ListItem', position: 2, name: pageData.type.charAt(0).toUpperCase() + pageData.type.slice(1) + 's', item: `https://dataomen.com/${pageData.type}s` },
          { '@type': 'ListItem', position: 3, name: pageData.h1, item: `https://dataomen.com/${params.slug}` }
        ]
      },
      {
        '@type': 'FAQPage',
        mainEntity: pageData.faqs.map(faq => ({
          '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a }
        }))
      },
      {
        '@type': 'HowTo',
        name: `How to use ${pageData.h1}`,
        step: pageData.steps.map((step, idx) => ({
          '@type': 'HowToStep', position: idx + 1, name: step.name, text: step.text
        }))
      }
    ]
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="min-h-screen bg-neutral-950 text-neutral-50 pb-24">
        
        {/* BREADCRUMBS */}
        <div className="container max-w-6xl mx-auto px-4 pt-24 md:pt-32 mb-8">
          <nav className="flex text-sm text-neutral-500 font-medium">
            <ol className="inline-flex items-center space-x-2">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><ChevronRight className="w-4 h-4" /></li>
              <li className="capitalize"><span className="hover:text-white transition-colors cursor-default">{pageData.type}s</span></li>
              <li><ChevronRight className="w-4 h-4" /></li>
              <li><span className="text-neutral-300 truncate max-w-[200px] sm:max-w-none block">{pageData.h1}</span></li>
            </ol>
          </nav>
        </div>

        {/* HERO SECTION */}
        <section className="relative pb-20 border-b border-white/10">
          <div className="container relative z-10 px-4 max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-6">{pageData.icon}</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              {pageData.h1}
            </h1>
            <p className="text-xl md:text-2xl text-neutral-400 mx-auto mb-10 leading-relaxed">
              {pageData.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-md bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                Start Analyzing Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container px-4 max-w-6xl mx-auto grid lg:grid-cols-12 gap-12 lg:gap-16">
            
            {/* MAIN CONTENT (Left) */}
            <div className="lg:col-span-8 space-y-24">
              
              {/* TABLE OF CONTENTS (Automated based on available data) */}
              <nav className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] mb-12">
                <div className="flex items-center gap-2 mb-4 text-white font-semibold">
                  <ListTodo className="w-5 h-5 text-blue-500" />
                  <h2>Table of Contents</h2>
                </div>
                <ul className="grid sm:grid-cols-2 gap-3 text-sm text-neutral-400">
                  <li><a href="#how-it-works" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> How it Works</a></li>
                  {pageData.comparison && <li><a href="#comparison" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> {pageData.comparison.competitor} Comparison</a></li>}
                  <li><a href="#use-cases" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> Use Cases & Benefits</a></li>
                  <li><a href="#faq" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> Frequently Asked Questions</a></li>
                </ul>
              </nav>

              {/* HOW IT WORKS */}
              <div id="how-it-works" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">How it Works</h2>
                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-white/10">
                  {pageData.steps.map((step, idx) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-neutral-950 text-neutral-300 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_0_8px_#0a0a0a]">
                        {idx + 1}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                        <h3 className="font-bold text-lg text-white mb-2">{step.name}</h3>
                        <p className="text-neutral-400 leading-relaxed">{step.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* COMPARISON (Only renders if type is comparison or comparison data exists) */}
              {pageData.comparison && (
                <div id="comparison" className="scroll-mt-24">
                  <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">DataOmen vs. {pageData.comparison.competitor}</h2>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="p-8 rounded-2xl border border-white/5 bg-neutral-900/50">
                      <div className="text-xl font-bold text-neutral-400 mb-6">{pageData.comparison.competitor}</div>
                      <ul className="space-y-4">
                        {pageData.comparison.competitorFlaws.map((flaw, idx) => (
                          <li key={idx} className="flex items-start text-neutral-500">
                            <X className="w-5 h-5 mr-3 text-red-500/50 shrink-0 mt-0.5" />
                            {flaw}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-8 rounded-2xl border border-blue-500/30 bg-blue-500/5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 px-3 py-1 bg-blue-500 text-xs font-bold text-white rounded-bl-lg">Modern Choice</div>
                      <div className="text-xl font-bold text-white mb-6">DataOmen</div>
                      <ul className="space-y-4">
                        {pageData.comparison.dataOmenWins.map((win, idx) => (
                          <li key={idx} className="flex items-start text-neutral-200">
                            <Check className="w-5 h-5 mr-3 text-blue-400 shrink-0 mt-0.5" />
                            {win}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* USE CASES */}
              <div id="use-cases" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">Use Cases & Benefits</h2>
                <div className="grid sm:grid-cols-2 gap-6">
                  {pageData.useCases.map((useCase, idx) => (
                    <div key={idx} className="p-6 rounded-xl bg-white/[0.02] border border-white/10">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <h4 className="font-semibold text-white mb-2">{useCase.title}</h4>
                          <p className="text-sm text-neutral-400 leading-relaxed">{useCase.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQS */}
              <div id="faq" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">Frequently Asked Questions</h2>
                <Accordion type="single" collapsible className="w-full">
                  {pageData.faqs.map((faq, idx) => (
                    <AccordionItem key={idx} value={`item-${idx}`} className="border-white/10">
                      <AccordionTrigger className="text-left text-lg hover:no-underline hover:text-blue-400 transition-colors">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-neutral-400 text-base leading-relaxed">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

            </div>

            {/* SIDEBAR (Right) */}
            <div className="lg:col-span-4">
              <div className="sticky top-24 space-y-8">
                
                {/* Capabilities Box */}
                <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <h3 className="text-lg font-semibold text-white mb-6">Capabilities</h3>
                  <ul className="space-y-4 mb-8">
                    {pageData.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-sm text-neutral-300">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 mr-3 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className="flex w-full h-10 items-center justify-center rounded-md bg-white text-sm font-semibold text-black transition-colors hover:bg-neutral-200">
                    Get Started Now
                  </Link>
                </div>

                {/* Related Pages Siloing */}
                <div className="p-6 rounded-2xl border border-white/10 bg-black/50">
                  <h3 className="text-lg font-semibold text-white mb-4">Related Topics</h3>
                  <div className="flex flex-col gap-2">
                    {pageData.relatedSlugs.map((relatedSlug) => {
                      const relatedData = seoPages[relatedSlug];
                      if (!relatedData) return null;
                      return (
                        <Link 
                          key={relatedSlug}
                          href={`/${relatedSlug}`}
                          className="group flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/[0.04] transition-all text-sm text-neutral-400 hover:text-white"
                        >
                          <span className="truncate pr-4">{relatedData.title.split('|')[0].trim()}</span>
                          <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

          </div>
        </section>
      </main>
    </>
  );
}