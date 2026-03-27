import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { 
  ArrowRight, 
  MessageSquare, 
  TrendingUp, 
  AlertCircle, 
  Zap, 
  BrainCircuit, 
  SearchX, 
  PackageSearch,
  CheckCircle2,
  ShieldCheck,
  Clock
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Analyze Shopify Data with AI | Arcli',
  description: 'Connect your Shopify store in 60 seconds. Talk to your store data in plain English to uncover hidden revenue, prevent stockouts, and grow your brand.',
  openGraph: {
    title: 'Stop Guessing. Start Knowing Your Shopify Data.',
    description: 'Drowning in data but starving for answers? Ask Arcli questions in plain English and get instant insights to grow your e-commerce revenue.',
    url: 'https://www.arcli.tech/analyze-shopify-data',
    siteName: 'Arcli',
    locale: 'en_US',
    type: 'website',
  },
};

export default function AnalyzeShopifyDataPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-indigo-500/30">
      
      {/* 1. Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-white to-white dark:from-indigo-900/20 dark:via-zinc-950 dark:to-zinc-950 -z-10"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-4xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-sm font-medium border border-indigo-100 dark:border-indigo-500/20">
              <Zap className="w-4 h-4" />
              <span>1-Click Shopify Integration</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-balance leading-tight">
              Talk to your Shopify store.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">Find hidden revenue.</span>
            </h1>
            <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed text-balance">
              Drowning in spreadsheets? Can't figure out why sales are down? Connect your store in 60 seconds and ask Arcli anything in plain English. No coding or data skills required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link 
                href="/register" 
                className="w-full sm:w-auto px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all flex items-center justify-center gap-2 shadow-xl shadow-zinc-900/20 dark:shadow-white/10"
              >
                Start 3-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link 
                href="/chat/demo" 
                className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 rounded-lg font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
              >
                Watch How it Works
              </Link>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-500 pt-4 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Secure connection. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Plain English Interaction Mockup */}
      <section className="pb-20 md:pb-32 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl relative">
          <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-zinc-950 via-transparent to-transparent z-10 h-full pointer-events-none rounded-2xl"></div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-2 md:p-4 shadow-2xl relative overflow-hidden backdrop-blur-sm">
            <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              
              {/* Fake App Header */}
              <div className="h-12 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-2 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <div className="mx-auto font-medium text-sm text-zinc-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  MyShopify Store Sync Active
                </div>
              </div>

              {/* Fake App Body */}
              <div className="p-6 md:p-10 flex flex-col gap-8">
                {/* User Message */}
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-zinc-600 dark:text-zinc-400 font-bold text-sm">You</span>
                  </div>
                  <div className="bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl rounded-tl-none px-5 py-3 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/50 max-w-xl text-lg">
                    "Which products are most frequently bought together with the Summer Sun Hat?"
                  </div>
                </div>
                
                {/* AI Response */}
                <div className="flex items-start gap-4 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <BrainCircuit className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl rounded-tr-none px-6 py-5 text-zinc-800 dark:text-zinc-200 border border-indigo-100 dark:border-indigo-500/20 max-w-2xl w-full space-y-4">
                    <p className="text-lg">Customers who buy the <strong>Summer Sun Hat</strong> most often add these to their cart:</p>
                    <ul className="space-y-3 mt-4">
                      <li className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <span className="font-medium">1. Canvas Beach Tote</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Bought together 68% of the time</span>
                      </li>
                      <li className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <span className="font-medium">2. SPF 50 Face Sunscreen</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Bought together 42% of the time</span>
                      </li>
                    </ul>
                    <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-lg flex gap-3 items-start">
                      <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-900 dark:text-amber-200">
                        <strong>Arcli Suggestion:</strong> Create a "Beach Day Bundle" with these 3 items to instantly increase your Average Order Value (AOV).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* 3. Problem / Solution Section */}
      <section className="py-20 bg-zinc-50 dark:bg-zinc-900/20 border-y border-zinc-200 dark:border-zinc-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Stop guessing. Get answers.</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Running a Shopify store means you have a million things to do. You shouldn't have to become a data analyst just to understand your business.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <ProblemSolutionCard 
              icon={<SearchX className="w-6 h-6 text-rose-500" />}
              problem="I don't know who my best customers are."
              solution="Ask Arcli to find your VIPs. We'll show you exactly who buys the most, who buys most often, and who is at risk of never returning so you can email them."
            />
            <ProblemSolutionCard 
              icon={<PackageSearch className="w-6 h-6 text-amber-500" />}
              problem="I keep running out of my best sellers."
              solution="Arcli monitors your sales velocity daily. We alert you when a product is selling faster than usual so you can restock before you lose money."
            />
            <ProblemSolutionCard 
              icon={<TrendingUp className="w-6 h-6 text-emerald-500" />}
              problem="Dashboards don't answer my specific questions."
              solution="Stop clicking through rigid reports. Just type what you want to know. 'Compare last week's sales to this week by product category'—boom, done."
            />
          </div>
        </div>
      </section>

      {/* 4. The "Old Way" vs "The Arcli Way" */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-3xl md:text-4xl font-bold">
                Finally, analytics built for humans.
              </h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400">
                Traditional tools make you adapt to them. Arcli adapts to you. If you know how to text a friend, you know how to use Arcli to grow your store.
              </p>
              
              <div className="space-y-6 pt-4">
                <ComparisonRow 
                  title="No more exporting CSVs"
                  desc="We sync your orders, products, and customer data directly from Shopify automatically."
                />
                <ComparisonRow 
                  title="No formulas to memorize"
                  desc="Forget VLOOKUPs and pivot tables. Arcli calculates everything perfectly in the background."
                />
                <ComparisonRow 
                  title="Insights, not just charts"
                  desc="We don't just show you a graph going down. We tell you exactly WHICH products are causing the drop."
                />
              </div>
            </div>
            
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800 text-center flex flex-col items-center justify-center min-h-[400px]">
               <Clock className="w-16 h-16 text-indigo-500 mb-6" />
               <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Set up in 60 seconds</h3>
               <p className="text-zinc-600 dark:text-zinc-400 max-w-sm mb-8">
                 1. Click connect.<br/>
                 2. Approve Shopify permissions.<br/>
                 3. Start asking questions.
               </p>
               <div className="bg-white dark:bg-zinc-950 px-6 py-3 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-800 text-sm font-medium flex items-center gap-2">
                 <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                 Zero technical skills required
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Simple CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-indigo-600 dark:bg-indigo-900"></div>
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        
        <div className="container mx-auto px-4 relative z-10 text-center text-white max-w-3xl">
          <MessageSquare className="w-16 h-16 mx-auto mb-6 text-indigo-200" />
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-balance">
            Find the hidden money in your store today.
          </h2>
          <p className="text-indigo-100 text-xl mb-10 text-balance">
            Try Arcli risk-free. No credit card required. Setup takes exactly 1 minute.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/register" 
              className="px-8 py-4 bg-white text-indigo-600 rounded-lg font-bold hover:bg-zinc-50 transition-colors shadow-xl text-lg w-full sm:w-auto flex items-center justify-center gap-2"
            >
              Start 3-Day Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link 
              href="mailto:support@arcli.tech" 
              className="px-8 py-4 bg-indigo-700 text-white rounded-lg font-semibold hover:bg-indigo-800 transition-colors border border-indigo-500 text-lg w-full sm:w-auto"
            >
              Email Support
            </Link>
          </div>
        </div>
      </section>
      
    </div>
  );
}

// Sub-components for clean code
function ProblemSolutionCard({ icon, problem, solution }: { icon: React.ReactNode, problem: string, solution: string }) {
  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 hover:shadow-lg transition-shadow">
      <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-6">
        {icon}
      </div>
      <div className="mb-4">
        <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">The Problem</span>
        <h3 className="text-lg font-semibold mt-1">"{problem}"</h3>
      </div>
      <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">The Arcli Solution</span>
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-1">
          {solution}
        </p>
      </div>
    </div>
  );
}

function ComparisonRow({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="mt-1 flex-shrink-0">
        <CheckCircle2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div>
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">{title}</h4>
        <p className="text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}