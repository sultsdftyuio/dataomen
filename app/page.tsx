import Link from 'next/link';
import { 
  ArrowRight, Database, Sparkles, LineChart, Code2, 
  CheckCircle2, Zap, Shield, BarChart3, Terminal, 
  MessageSquare, ChevronRight, PlayCircle
} from 'lucide-react';
import { SeoLinkSilo } from '@/components/landing/seo-link-silo';

// FIXED: Using named imports to match your existing component definitions
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 selection:bg-blue-500/30">
      <Navbar />

      <main>
        {/* 1. HERO SECTION: Problem + Value Prop */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
          {/* Background Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-500 to-transparent blur-3xl rounded-full mix-blend-screen" />
          </div>

          <div className="container relative z-10 px-4 max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4" />
              <span>GPT-4 Powered Data Engine</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 leading-[1.1]">
              Your AI Data Analyst.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                Ask questions in plain English.
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-neutral-400 mx-auto max-w-3xl mb-10 leading-relaxed">
              Connect PostgreSQL, Snowflake, or CSV files and get instant insights, charts, and highly-optimized SQL generated automatically. No coding required.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/register" 
                className="inline-flex h-14 items-center justify-center rounded-lg bg-blue-600 px-8 text-base font-bold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] w-full sm:w-auto"
              >
                Start Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link 
                href="#demo" 
                className="inline-flex h-14 items-center justify-center rounded-lg bg-white/5 border border-white/10 px-8 text-base font-bold text-white transition-all hover:bg-white/10 w-full sm:w-auto"
              >
                <PlayCircle className="mr-2 h-5 w-5 text-neutral-400" />
                See Demo
              </Link>
            </div>
          </div>
        </section>

        {/* 2. TRUST SIGNALS: Credibility */}
        <section className="py-10 border-y border-white/5 bg-white/[0.02]">
          <div className="container px-4 max-w-6xl mx-auto text-center">
            <p className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-8">
              Trusted by Data Teams & Built On Modern Tech
            </p>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale">
              <div className="text-xl font-bold font-mono">PostgreSQL</div>
              <div className="text-xl font-bold font-mono">Snowflake</div>
              <div className="text-xl font-bold font-mono">DuckDB</div>
              <div className="text-xl font-bold font-mono">OpenAI</div>
              <div className="text-xl font-bold font-mono">Parquet</div>
            </div>
            <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-neutral-400 font-medium">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-500"/> Query 10M+ rows instantly</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-500"/> Semantic Schema Routing</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-500"/> Zero-retention secure execution</div>
            </div>
          </div>
        </section>

        {/* 3. PRODUCT DEMO: The "Aha!" Moment */}
        <section id="demo" className="py-24">
          <div className="container px-4 max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">See it in action.</h2>
              <p className="text-lg text-neutral-400">Watch AI turn a simple question into a production-ready dashboard.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-neutral-900 overflow-hidden shadow-2xl">
              <div className="h-12 border-b border-white/10 bg-black/50 flex items-center px-4">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="mx-auto text-xs text-neutral-500 font-mono">DataOmen Workspace</div>
              </div>
              
              <div className="p-6 md:p-10 grid md:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
                      <Terminal className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-4 text-sm text-neutral-200">
                      Show me the total revenue by region for last month.
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="space-y-4 w-full">
                      <div className="text-sm text-neutral-400 flex items-center gap-2">
                        <Zap className="w-3 h-3 text-yellow-500" />
                        Analyzed 4.2M rows in 0.8s
                      </div>
                      <div className="bg-black border border-white/10 rounded-xl p-4 overflow-x-auto">
                        <pre className="text-xs font-mono text-blue-300">
                          <code>
<span className="text-pink-400">SELECT</span> region, <span className="text-pink-400">SUM</span>(revenue) <span className="text-pink-400">AS</span> total_revenue<br/>
<span className="text-pink-400">FROM</span> sales_data<br/>
<span className="text-pink-400">WHERE</span> date &gt;= <span className="text-green-400">CURRENT_DATE</span> - <span className="text-orange-400">INTERVAL</span> <span className="text-green-400">'1 month'</span><br/>
<span className="text-pink-400">GROUP BY</span> region<br/>
<span className="text-pink-400">ORDER BY</span> total_revenue <span className="text-pink-400">DESC</span>;
                          </code>
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 h-full flex flex-col justify-end min-h-[300px]">
                  <h4 className="text-sm font-semibold text-white mb-6">Revenue by Region (Last 30 Days)</h4>
                  <div className="flex items-end justify-between gap-2 h-48 mt-auto">
                    {[80, 45, 100, 60, 30].map((height, i) => (
                      <div key={i} className="w-full flex flex-col items-center gap-2 group">
                        <div 
                          className="w-full bg-blue-500/80 rounded-t-sm group-hover:bg-blue-400 transition-colors relative" 
                          style={{ height: `${height}%` }}
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-mono text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            ${(height * 12.4).toFixed(1)}k
                          </div>
                        </div>
                        <span className="text-xs text-neutral-500">
                          {['NA', 'EMEA', 'APAC', 'LATAM', 'AFR'][i]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. HOW IT WORKS */}
        <section className="py-24 bg-black">
          <div className="container px-4 max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">How it works</h2>
              <p className="text-lg text-neutral-400">From raw data to actionable insights in seconds.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { step: '01', title: 'Connect Data', desc: 'Securely link your database or upload files. We safely map your schema without storing your raw data.', icon: <Database className="w-6 h-6 text-blue-400" /> },
                { step: '02', title: 'Ask Questions', desc: 'Type what you want to know in plain English. Our Semantic Router translates intent to precise context.', icon: <MessageSquare className="w-6 h-6 text-purple-400" /> },
                { step: '03', title: 'Get Insights', desc: 'Receive interactive charts, performant SQL queries, and written summaries instantly.', icon: <BarChart3 className="w-6 h-6 text-emerald-400" /> }
              ].map((item, i) => (
                <div key={i} className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
                  <div className="text-6xl font-black text-white/[0.03] absolute -right-2 -top-4 pointer-events-none">
                    {item.step}
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-neutral-900 border border-white/10 flex items-center justify-center mb-6 shadow-lg">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                  <p className="text-neutral-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. PRICING */}
        <section className="py-24 border-y border-white/5">
          <div className="container px-4 max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Simple, transparent pricing</h2>
              <p className="text-lg text-neutral-400">Start exploring for free. Upgrade when your data demands it.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <div className="p-8 rounded-3xl border border-white/10 bg-neutral-900/50 flex flex-col">
                <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
                <p className="text-neutral-400 mb-6 text-sm">Perfect for individuals and small files.</p>
                <div className="mb-8">
                  <span className="text-5xl font-extrabold text-white">$0</span>
                  <span className="text-neutral-500 font-medium">/mo</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  <li className="flex items-center text-neutral-300"><CheckCircle2 className="w-5 h-5 mr-3 text-blue-500/50" /> Up to 10,000 rows per query</li>
                  <li className="flex items-center text-neutral-300"><CheckCircle2 className="w-5 h-5 mr-3 text-blue-500/50" /> CSV & JSON File Uploads</li>
                  <li className="flex items-center text-neutral-300"><CheckCircle2 className="w-5 h-5 mr-3 text-blue-500/50" /> Basic Text-to-SQL Engine</li>
                </ul>
                <Link href="/register" className="w-full py-4 rounded-xl border border-white/20 text-center font-bold text-white hover:bg-white/5 transition-colors">
                  Start for Free
                </Link>
              </div>

              <div className="p-8 rounded-3xl border border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.15)] bg-gradient-to-b from-blue-900/20 to-neutral-900 relative flex flex-col">
                <div className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
                <p className="text-neutral-400 mb-6 text-sm">For data professionals and teams.</p>
                <div className="mb-8">
                  <span className="text-5xl font-extrabold text-white">$29</span>
                  <span className="text-neutral-500 font-medium">/mo</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  <li className="flex items-center text-white"><CheckCircle2 className="w-5 h-5 mr-3 text-blue-400" /> Unlimited query processing</li>
                  <li className="flex items-center text-white"><CheckCircle2 className="w-5 h-5 mr-3 text-blue-400" /> Live PostgreSQL & Snowflake Sync</li>
                  <li className="flex items-center text-white"><CheckCircle2 className="w-5 h-5 mr-3 text-blue-400" /> Contextual RAG Schema Routing</li>
                </ul>
                <Link href="/register?plan=pro" className="w-full py-4 rounded-xl bg-blue-600 text-center font-bold text-white hover:bg-blue-500 transition-colors shadow-lg">
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 6. FINAL CTA */}
        <section className="py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-blue-600/10" />
          <div className="container relative z-10 px-4 max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight">
              Stop waiting for the data team.
            </h2>
            <Link 
              href="/register" 
              className="inline-flex h-14 items-center justify-center rounded-lg bg-white px-10 text-lg font-bold text-black transition-all hover:bg-neutral-200 hover:scale-105"
            >
              Get Started Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </section>

        <SeoLinkSilo />
      </main>

      <Footer />
    </div>
  );
}