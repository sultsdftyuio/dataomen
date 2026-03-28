import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar'; // <-- Injected Navbar
import { 
  ArrowRight, 
  MessageSquare, 
  TrendingUp, 
  SearchX, 
  PackageSearch,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Zap,
  BrainCircuit,
  Star,
  LineChart,
  Users,
  ChevronDown,
  Sparkles,
  BarChart3
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Analyze Shopify Data Without Spreadsheets | Arcli',
  description: 'Connect your Shopify store in 60 seconds. Talk to your store data in plain English to uncover hidden revenue, prevent stockouts, and grow your brand. No tech skills needed.',
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
    <>
      {/* 0. Global Navigation */}
      <Navbar />

      <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
        
        {/* 1. Hero Section */}
        <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-50/50 rounded-full blur-3xl -z-10 pointer-events-none"></div>
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,white_100%)] -z-10 pointer-events-none"></div>
          
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
            <div className="text-center max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white text-blue-700 text-sm font-semibold border border-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                <Zap className="w-4 h-4 text-blue-500 fill-blue-500" />
                <span>1-Click Shopify Integration</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-balance leading-tight text-slate-900">
                Talk to your store like you <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500">text a friend.</span>
              </h1>
              
              <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed text-balance font-medium">
                Drowning in spreadsheets? Confused by complicated dashboards? Connect your store in 60 seconds and just ask Arcli what you want to know in plain English. <strong className="text-slate-900">Zero technical skills required.</strong>
              </p>
              
              <div className="flex flex-col items-center justify-center pt-6 gap-4">
                <Link 
                  href="/register" 
                  className="w-full sm:w-auto px-10 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(15,23,42,0.15)] hover:shadow-[0_0_40px_rgba(15,23,42,0.25)] hover:-translate-y-0.5 duration-300 text-lg"
                >
                  Start 3-Day Free Trial
                  <ArrowRight className="w-5 h-5" />
                </Link>
                
                <div className="flex items-center gap-4 mt-4 text-sm font-medium text-slate-500">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> 
                    Secure & Cancel Anytime
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Premium Plain English Interaction Mockup */}
        <section className="pb-24 md:pb-32 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-5xl relative">
            <div className="absolute -top-10 -right-10 w-72 h-72 bg-sky-200/30 rounded-full blur-3xl -z-10"></div>
            <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl -z-10"></div>
            
            <div className="rounded-3xl border border-slate-200/80 bg-white/50 p-2 md:p-4 shadow-2xl shadow-blue-900/10 relative overflow-hidden backdrop-blur-xl">
              <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-sm flex flex-col h-full">
                
                {/* Browser/App Header */}
                <div className="h-14 border-b border-slate-100 flex items-center px-6 gap-4 bg-slate-50/80 backdrop-blur-md">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
                  </div>
                  <div className="mx-auto flex items-center justify-center bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm text-xs font-semibold text-slate-600 gap-2 min-w-[200px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                    Shopify Live Sync
                  </div>
                  <div className="w-10"></div>
                </div>

                {/* Chat Interface Body */}
                <div className="p-6 md:p-12 flex flex-col gap-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50/50 to-white relative z-10">
                  
                  {/* User Message */}
                  <div className="flex items-start gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 border border-slate-200 shadow-sm">
                      <span className="text-slate-600 font-bold text-sm">US</span>
                    </div>
                    <div className="bg-white rounded-3xl rounded-tl-sm px-6 py-5 text-slate-800 border border-slate-200 shadow-sm max-w-xl text-lg font-medium">
                      "What products do people usually buy together with the Summer Sun Hat?"
                    </div>
                  </div>
                  
                  {/* AI Response */}
                  <div className="flex items-start gap-4 flex-row-reverse animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-backwards">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/30 border border-blue-400/50">
                      <BrainCircuit className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-blue-50/40 backdrop-blur-sm rounded-3xl rounded-tr-sm px-7 py-6 text-slate-800 border border-blue-100/80 max-w-2xl w-full space-y-5 shadow-sm">
                      <p className="text-lg font-medium text-slate-700">Looking at your recent orders, customers who buy the <strong>Summer Sun Hat</strong> almost always add these to their cart too:</p>
                      
                      <ul className="space-y-3 mt-4">
                        <li className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-3 mb-2 sm:mb-0">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                              <PackageSearch className="w-5 h-5 text-slate-500" />
                            </div>
                            <span className="font-bold text-slate-800">1. Canvas Beach Tote</span>
                          </div>
                          <span className="text-blue-700 font-bold bg-blue-100/50 px-3 py-1.5 rounded-lg text-sm border border-blue-200/50">
                            Bought together 68% of the time
                          </span>
                        </li>
                        <li className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-3 mb-2 sm:mb-0">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                              <PackageSearch className="w-5 h-5 text-slate-500" />
                            </div>
                            <span className="font-bold text-slate-800">2. SPF 50 Face Sunscreen</span>
                          </div>
                          <span className="text-blue-700 font-bold bg-blue-100/50 px-3 py-1.5 rounded-lg text-sm border border-blue-200/50">
                            Bought together 42% of the time
                          </span>
                        </li>
                      </ul>
                      
                      <div className="mt-6 p-5 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-100 rounded-xl flex gap-4 items-start shadow-sm">
                        <TrendingUp className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-blue-900 mb-1 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-blue-600 fill-blue-600" /> Quick Idea to Make More Money
                          </h4>
                          <p className="text-blue-900/80 leading-relaxed font-medium">
                            You should create a <strong>"Beach Day Bundle"</strong> on your store with these 3 items. If you offer a 10% discount for buying all three, you could easily increase how much money customers spend per visit.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Value Proposition */}
        <section className="py-24 bg-slate-50 border-y border-slate-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-4xl md:text-5xl font-extrabold mb-6 text-slate-900 tracking-tight">Stop guessing. Get clear answers.</h2>
              <p className="text-xl text-slate-600 font-medium">
                You run a brand. You have a million things to do. You shouldn't have to hire a data scientist or learn how to read complicated charts just to understand your business.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <ProblemSolutionCard 
                icon={<Users className="w-7 h-7 text-blue-600" />}
                problem="I don't know who my best customers are."
                solution="Just ask Arcli. We'll give you a simple list of who buys the most, who buys most often, and who hasn't bought in a while so you can email them a discount code."
              />
              <ProblemSolutionCard 
                icon={<LineChart className="w-7 h-7 text-blue-600" />}
                problem="I keep running out of my popular items."
                solution="Arcli watches your sales every day. We will tell you exactly when a product is selling unusually fast so you can re-order before you run out of stock and lose money."
              />
              <ProblemSolutionCard 
                icon={<SearchX className="w-7 h-7 text-blue-600" />}
                problem="My dashboards are too confusing."
                solution="Stop clicking through 20 different screens to find one number. Just type your question like: 'How many red shirts did we sell last week compared to this week?'"
              />
            </div>
          </div>
        </section>

        {/* 4. Non-Tech Focus Comparison */}
        <section className="py-28 bg-white overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-10 relative z-10">
                <div>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
                    Built for store owners, not <span className="text-blue-600">IT experts</span>.
                  </h2>
                  <p className="text-xl text-slate-600 font-medium leading-relaxed">
                    Traditional tools make you learn their confusing menus. Arcli is entirely different. If you know how to text, you know how to use Arcli. 
                  </p>
                </div>
                
                <div className="space-y-4 pt-2">
                  <ComparisonRow 
                    title="No exporting to Excel"
                    desc="We pull your Shopify orders, products, and customer info automatically. You never touch a spreadsheet."
                  />
                  <ComparisonRow 
                    title="No math or formulas required"
                    desc="Forget trying to figure out how to calculate your return rate. Arcli does all the math perfectly in the background."
                  />
                  <ComparisonRow 
                    title="We give you advice, not just numbers"
                    desc="We don't just show you a chart going down. We tell you exactly WHICH products are causing the drop so you can fix it."
                  />
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-[2rem] p-10 border border-slate-200 text-center flex flex-col items-center justify-center min-h-[450px] relative overflow-hidden shadow-2xl shadow-slate-200/50 group">
                 <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                 <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-200 rounded-full blur-3xl opacity-30 pointer-events-none group-hover:opacity-50 transition-opacity duration-700"></div>
                 
                 <div className="w-24 h-24 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-8 relative z-10 group-hover:scale-110 transition-transform duration-500">
                   <Clock className="w-12 h-12 text-blue-600" />
                 </div>
                 
                 <h3 className="text-3xl font-extrabold text-slate-900 mb-6 relative z-10">Ready in 60 seconds</h3>
                 
                 <div className="space-y-4 text-left relative z-10 mb-10 w-full max-w-xs">
                   <div className="flex items-center gap-3 text-slate-700 font-medium text-lg">
                     <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">1</div>
                     Click "Connect Shopify"
                   </div>
                   <div className="flex items-center gap-3 text-slate-700 font-medium text-lg">
                     <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">2</div>
                     Approve permissions
                   </div>
                   <div className="flex items-center gap-3 text-slate-700 font-medium text-lg">
                     <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">3</div>
                     Start asking questions
                   </div>
                 </div>
                 
                 <div className="bg-white px-6 py-3.5 rounded-full shadow-sm border border-slate-200 text-sm font-bold text-slate-800 flex items-center gap-2 relative z-10">
                   <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                   Zero technical skills required
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Internal Backlinks / SEO Links - FIXED SLUGS */}
        <section className="py-20 bg-slate-50 border-t border-slate-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Explore more Arcli capabilities</h2>
              <p className="text-slate-600 font-medium text-lg">Discover other ways our AI can help optimize your e-commerce brand.</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Fixed link to Conversational AI */}
              <Link 
                href="/ai-data-analysis" 
                className="bg-white p-8 rounded-3xl border border-slate-200 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 group flex flex-col h-full"
              >
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                  Conversational AI Data Analysis
                </h3>
                <p className="text-slate-600 leading-relaxed font-medium mb-8 flex-grow">
                  Go beyond Shopify. Connect your marketing platforms and databases, and chat with all your company data in one place.
                </p>
                <div className="text-blue-600 font-bold flex items-center gap-2 group-hover:gap-3 transition-all">
                  Learn more <ArrowRight className="w-4 h-4" />
                </div>
              </Link>

              {/* Fixed link to Predictive Analytics */}
              <Link 
                href="/predictive-ai-analytics" 
                className="bg-white p-8 rounded-3xl border border-slate-200 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 group flex flex-col h-full"
              >
                <div className="w-12 h-12 bg-sky-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-6 h-6 text-sky-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                  Predictive AI Analytics & Forecasting
                </h3>
                <p className="text-slate-600 leading-relaxed font-medium mb-8 flex-grow">
                  Turn your historical data into a crystal ball. Automatically forecast future sales, predict inventory needs, and anticipate customer churn.
                </p>
                <div className="text-blue-600 font-bold flex items-center gap-2 group-hover:gap-3 transition-all">
                  Learn more <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* 6. FAQ Section */}
        <section className="py-24 bg-white border-t border-slate-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">Frequently Asked Questions</h2>
              <p className="text-lg text-slate-600 font-medium">Everything you need to know about setting up and using Arcli.</p>
            </div>
            
            <div className="space-y-4">
              <FAQItem 
                question="Do I need to know how to code or use Excel?" 
                answer="Not at all! Arcli is built specifically for people with zero technical background. You don't need to know any code, SQL, or Excel formulas. If you can type a text message, you can use Arcli to analyze your store." 
              />
              <FAQItem 
                question="Will connecting Arcli slow down my Shopify store?" 
                answer="No. Arcli has absolutely zero impact on your store's loading speed for your customers. We securely pull your data in the background using Shopify's official API, meaning no heavy code is added to your actual storefront." 
              />
              <FAQItem 
                question="Is my store data secure?" 
                answer="Yes. Security is our top priority. We request 'Read-Only' access to your Shopify store, meaning Arcli can only view your data to analyze it—we cannot change your store settings, delete products, or modify orders. All data is encrypted at an enterprise level." 
              />
              <FAQItem 
                question="How long does it actually take to set up?" 
                answer="About 60 seconds. You literally just click 'Connect', approve the secure connection on your Shopify admin page, and Arcli instantly starts analyzing your recent orders. You can start asking questions immediately." 
              />
              <FAQItem 
                question="What if I want to cancel my account?" 
                answer="You can cancel at any time with a single click inside your account settings. There are no contracts, no hidden fees, and no commitments. Try it risk-free with our 3-day trial to see if it helps your store grow." 
              />
            </div>
          </div>
        </section>

        {/* 7. Powerful CTA */}
        <section className="py-28 relative overflow-hidden bg-slate-900">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900 via-slate-900 to-slate-950"></div>
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
          
          <div className="container mx-auto px-4 relative z-10 text-center text-white max-w-4xl">
            <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-8 border border-blue-400/20 backdrop-blur-sm">
              <MessageSquare className="w-10 h-10 text-blue-400" />
            </div>
            
            <h2 className="text-4xl md:text-6xl font-extrabold mb-6 text-balance text-white tracking-tight">
              Find the hidden money in your store today.
            </h2>
            
            <p className="text-blue-100/80 text-xl md:text-2xl mb-12 text-balance font-medium max-w-2xl mx-auto">
              Try Arcli risk-free. No credit card required. Setup takes exactly 1 minute.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
              <Link 
                href="/register" 
                className="px-10 py-5 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-50 transition-all hover:scale-105 duration-300 shadow-[0_0_40px_rgba(255,255,255,0.15)] text-lg w-full sm:w-auto flex items-center justify-center gap-2"
              >
                Start 3-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link 
                href="mailto:support@arcli.tech" 
                className="px-10 py-5 bg-slate-800/50 backdrop-blur-md text-white rounded-xl font-bold hover:bg-slate-800 transition-colors border border-slate-700 text-lg w-full sm:w-auto"
              >
                Email Support
              </Link>
            </div>
          </div>
        </section>
        
      </div>
    </>
  );
}

// --- Sub-components ---

function ProblemSolutionCard({ icon, problem, solution }: { icon: React.ReactNode, problem: string, solution: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-8 hover:shadow-2xl hover:shadow-blue-900/5 hover:-translate-y-2 transition-all duration-300 group">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300">
        {icon}
      </div>
      <div className="mb-6">
        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">How it usually goes:</span>
        <h3 className="text-2xl font-bold mt-3 text-slate-900 leading-snug">"{problem}"</h3>
      </div>
      <div className="pt-6 border-t border-slate-100">
        <span className="text-xs font-extrabold text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
          <Zap className="w-3 h-3 fill-blue-600" /> How Arcli fixes it:
        </span>
        <p className="text-slate-600 leading-relaxed mt-3 font-medium text-lg">
          {solution}
        </p>
      </div>
    </div>
  );
}

function ComparisonRow({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="flex gap-5 p-5 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group">
      <div className="mt-1 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
          <CheckCircle2 className="w-5 h-5 text-blue-600" />
        </div>
      </div>
      <div>
        <h4 className="font-extrabold text-slate-900 text-xl mb-1">{title}</h4>
        <p className="text-slate-600 leading-relaxed font-medium">{desc}</p>
      </div>
    </div>
  );
}

// 100% Server-side CSS-driven Accordion for optimal performance & SEO
function FAQItem({ question, answer }: { question: string, answer: string }) {
  return (
    <details className="group bg-white border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center justify-between cursor-pointer p-6 font-bold text-slate-900 text-lg hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset">
        {question}
        <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-slate-100 p-2 rounded-full text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600">
          <ChevronDown className="w-5 h-5" />
        </span>
      </summary>
      <div className="p-6 pt-0 text-slate-600 text-lg leading-relaxed font-medium bg-white border-t border-slate-100">
        {answer}
      </div>
    </details>
  );
}