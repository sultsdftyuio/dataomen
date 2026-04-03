"use client";

import React from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  CheckCircle2,
  Cpu,
  Globe,
  Lock,
  Workflow,
  BarChart3,
  ChevronDown,
  Layers,
  Network
} from 'lucide-react';

// Use 'import type' to ensure no server code (like 'fs') leaks into the client bundle
import type { NormalizedPage } from '@/lib/seo/parser';
import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BOTTOM-OF-FUNNEL BLOCKS (PHASE 3/4 UPGRADED)
// ----------------------------------------------------------------------

export const Steps = ({ steps }: { steps: NormalizedPage['steps'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!steps || steps.length === 0) return null;
  return (
    <section className="py-24 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading 
          monoLabel="// EXECUTION_PIPELINE"
          subtitle="Our engine handles the complexity of data movement while you focus on high-level decision logic."
        >
          Implementation Pipeline
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="relative pl-10 md:pl-0">
          <div className={`absolute left-[29px] md:left-1/2 md:-ml-[1.5px] top-0 bottom-0 w-[3px] bg-slate-100 transition-all duration-1000 ${vis ? 'opacity-100 h-full' : 'opacity-0 h-0'}`}></div>
          
          <div className="space-y-12 md:space-y-16">
            {steps.map((step, i) => (
              <div 
                key={i} 
                style={{ transitionDelay: `${i * 200}ms` }}
                className={`relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-12 group transition-all duration-700 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`} 
              >
                <div className="hidden md:block w-1/2"></div>
                
                <div className="absolute left-[-20px] md:left-1/2 md:-ml-3 w-6 h-6 rounded-full bg-white border-[3px] border-slate-200 group-hover:border-[#2563eb] z-10 flex items-center justify-center transition-colors duration-300 shadow-sm">
                   <div className="w-2 h-2 bg-transparent group-hover:bg-[#2563eb] rounded-full transition-colors duration-300"></div>
                </div>
                
                <div className="w-full md:w-1/2 bg-white border border-slate-200 shadow-sm rounded-2xl p-8 hover:shadow-[0_10px_25px_-5px_rgba(37,99,235,0.15)] hover:border-[#2563eb]/30 transition-all duration-300 relative overflow-hidden">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563eb] mb-2">
                    PHASE_{i + 1} // {step.title}
                  </div>
                  <h4 className="text-xl font-bold text-[#0B1221] leading-snug mb-2 tracking-tight">
                    {step.description}
                  </h4>
                  {step.outcome && (
                    <div className="mt-4 text-[15px] text-slate-500 font-bold flex items-center gap-2 pt-4 border-t border-slate-100">
                      <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
                      {step.outcome}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export const Features = ({ features }: { features: NormalizedPage['features'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!features || features.length === 0) return null;
  return (
    <section className="py-32 bg-slate-50 relative border-y border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        
        <div className="flex flex-col md:flex-row gap-16 relative">
          
          <div className="w-full md:w-5/12">
            <div className="sticky top-32">
              <SectionHeading 
                align="left"
                monoLabel="// CORE_ENGINE_SPECS"
                subtitle="The technological foundation behind the unified engine. Designed to completely bypass manual RevOps bottlenecks."
              >
                Core Capabilities
              </SectionHeading>
              
              <div className="hidden md:flex items-center gap-4 text-slate-400 mt-8">
                <span className="w-12 h-[1px] bg-slate-300"></span>
                <span className="font-mono text-xs font-bold uppercase tracking-widest">Scroll to explore</span>
              </div>
            </div>
          </div>

          <div ref={ref as React.RefObject<HTMLDivElement>} className="w-full md:w-7/12 space-y-8">
            {features.map((feature, i) => (
              <div 
                key={i} 
                style={{ transitionDelay: `${i * 150}ms` }}
                className={`flex flex-col sm:flex-row items-start gap-6 bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] border border-slate-200 shadow-[0_20px_40px_-15px_rgba(11,18,33,0.05)] hover:shadow-[0_25px_50px_-20px_rgba(37,99,235,0.15)] hover:border-[#2563eb]/20 transition-all duration-700 group relative overflow-hidden transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#2563eb] to-blue-300 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                <div className="relative shrink-0 w-20 h-20 rounded-2xl border border-blue-100 flex items-center justify-center bg-gradient-to-br from-white to-blue-50/50 group-hover:border-[#2563eb]/30 transition-colors shadow-sm">
                  <div className="absolute inset-2 rounded-full border border-dashed border-[#2563eb]/30 group-hover:rotate-180 transition-transform duration-[3000ms] ease-linear"></div>
                  <div className="absolute inset-4 rounded-full border border-slate-100 group-hover:border-blue-200 transition-colors"></div>
                  <Layers className="absolute inset-0 m-auto w-8 h-8 text-[#2563eb]" />
                </div>

                <div>
                  <h3 className="text-2xl font-bold text-[#0B1221] mb-3 tracking-tight">{feature.title}</h3>
                  {feature.description && (
                    <p className="text-slate-500 leading-relaxed font-medium text-[16px]">
                      {feature.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export const Architecture = ({ architecture }: { architecture: NormalizedPage['architecture'] }) => {
  const [ref, vis] = useVisible(0.2);

  if (!architecture || Object.keys(architecture).length === 0) return null;
  return (
    <section className="py-24 bg-[#0B1221] text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#2563eb]/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div className={`transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5 text-[#60a5fa]" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#60a5fa]">SYSTEM_SPECIFICATION</span>
            </div>
            <h2 className="text-[clamp(32px,5vw,48px)] font-extrabold tracking-tight leading-[1.05]">Enterprise Architecture</h2>
          </div>
        </div>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-3 gap-6 mb-12">
          {Object.entries(architecture).map(([key, value], i) => (
            <div 
              key={key} 
              style={{ transitionDelay: `${i * 100}ms` }}
              className={`bg-white/5 border border-white/10 p-8 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all duration-700 group transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2 group-hover:text-[#60a5fa] transition-colors">
                {key.replace(/([A-Z])/g, '_$1')}
              </h4>
              <p className="text-xl font-bold text-white leading-relaxed tracking-tight">
                {value as string}
              </p>
            </div>
          ))}
        </div>

        <div className={`pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6 transition-all duration-1000 delay-500 ${vis ? 'opacity-100' : 'opacity-0'}`}>
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <Globe className="w-4 h-4 text-slate-500" /> MULTI-REGION
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <Lock className="w-4 h-4 text-slate-500" /> SOC2 TYPE II
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <Workflow className="w-4 h-4 text-slate-500" /> API FIRST
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <BarChart3 className="w-4 h-4 text-slate-500" /> LOW LATENCY
           </div>
        </div>
      </div>
    </section>
  );
};

export const RelatedLinks = ({ 
  relatedPages, 
  heroCta 
}: { 
  relatedPages: Array<{ slug: string; title: string; tag: string }>; 
  heroCta: NormalizedPage['hero']['cta'];
}) => {
  const [ref, vis] = useVisible(0.1);

  if (!relatedPages || relatedPages.length === 0) return null;
  
  return (
    <section className="py-24 bg-slate-50 relative overflow-hidden border-t border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <SectionHeading 
          monoLabel="// SEMANTIC_CLUSTERS"
          subtitle="Continue exploring semantically connected architectural patterns and documentation."
        >
          Explore Deep Dives
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {relatedPages.map((page, i) => (
            <Link 
              key={page.slug}
              href={`/${page.slug}`}
              style={{ transitionDelay: `${i * 100}ms` }}
              className={`bg-white p-8 rounded-xl border border-slate-200 shadow-sm hover:border-[#2563eb]/40 hover:shadow-[0_8px_20px_-6px_rgba(37,99,235,0.15)] transition-all duration-700 group flex flex-col justify-between h-full hover:-translate-y-1 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Network className="w-4 h-4 text-slate-400" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                    {page.tag}
                  </span>
                </div>
                <h3 className="text-[19px] font-bold text-[#0B1221] mb-6 tracking-tight line-clamp-2">
                  {page.title}
                </h3>
              </div>
              <div className="flex items-center justify-between mt-auto">
                <span className="font-mono text-[10px] font-bold text-[#2563eb] uppercase tracking-[0.2em]">ACCESS_FILE</span>
                <ArrowRight className="w-4 h-4 text-[#2563eb] group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
        
        <div className={`flex justify-center transition-all duration-1000 delay-300 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <Link 
            href={heroCta.primary.href} 
            className="group relative flex items-center justify-center gap-2 bg-[#0B1221] text-white px-8 py-4 rounded-xl text-lg font-bold shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 transition-all duration-300"
          >
            {heroCta.primary.text} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export const FAQs = ({ faqs }: { faqs: NormalizedPage['faqs'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!faqs || faqs.length === 0) return null;
  return (
    <section className="py-24 bg-white border-t border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading 
          monoLabel="// DOCUMENTATION"
          subtitle="Everything you need to know about implementing Arcli's engine into your stack."
        >
          Expert Insights
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="space-y-4">
          {faqs.map((faq, i) => (
            <details 
              key={i} 
              style={{ transitionDelay: `${i * 100}ms` }}
              className={`group bg-white border border-slate-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden shadow-sm hover:border-slate-300 transition-all duration-700 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              <summary className="flex items-center justify-between cursor-pointer p-6 md:p-8 font-bold text-[#0B1221] text-[18px] hover:bg-slate-50 transition-colors focus:outline-none tracking-tight">
                {faq.q}
                <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-slate-50 border border-slate-200 p-2 rounded-lg text-slate-500 group-hover:bg-[#2563eb] group-hover:text-white group-hover:border-[#2563eb]">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </summary>
              <div className="p-6 md:p-8 pt-0 text-slate-500 text-[16px] leading-relaxed font-medium bg-white border-t border-slate-100">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};