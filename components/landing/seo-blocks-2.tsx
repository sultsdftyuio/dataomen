/**
 * FILE: components/landing/seo-blocks-2.tsx
 * ═══════════════════════════════════════════════════════════════════
 * BUG FIXES (Bulletproofing)
 * ═══════════════════════════════════════════════════════════════════
 * - Added strict null checks (!array || array.length === 0)
 * - Added optional chaining (?.) to all array.map() calls.
 * - Added strict type-guard for Object.keys() in Architecture block.
 * - Simplified RelatedLinks UI to a clean, minimal list layout.
 * - Fixed FAQs to seamlessly support both legacy (question/answer) 
 * and standardized (q/a) schemas without TypeScript compiler errors.
 */

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
  Layers
} from 'lucide-react';

import { NormalizedPage } from '@/lib/seo/parser';
import { getNormalizedPage as getPage } from '@/lib/seo/registry';
import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BOTTOM-OF-FUNNEL BLOCKS
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
            {steps?.map((step, i) => (
              <div 
                key={i} 
                style={{ transitionDelay: `${i * 200}ms` }}
                className={`relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-12 group transition-all duration-700 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`} 
              >
                <div className="hidden md:block w-1/2"></div>
                
                <div className="absolute left-[-20px] md:left-1/2 md:-ml-3 w-6 h-6 rounded-full bg-white border-[3px] border-slate-200 group-hover:border-[#2563eb] z-10 flex items-center justify-center transition-colors duration-300">
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
            {features?.map((feature, i) => (
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

  if (!architecture || typeof architecture !== 'object' || Object.keys(architecture).length === 0) return null;
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

export const RelatedLinks = ({ slugs, links, heroCta }: { slugs?: string[], links?: any[], heroCta: NormalizedPage['hero']['cta'] }) => {
  const [ref, vis] = useVisible(0.1);

  const items = links?.length ? links : slugs;
  if (!items || items.length === 0) return null;

  return (
    <section className="py-16 bg-white relative border-t border-slate-100">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <div ref={ref as React.RefObject<HTMLDivElement>} className={`transition-all duration-700 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-2xl font-bold text-[#0B1221] tracking-tight mb-6">Related Resources</h2>
          
          <div className="flex flex-col gap-2 mb-10">
            {items?.map((item, i) => {
              let relatedTitle = item.label || item.title;
              let description = item.description;
              let href = item.href || item.url;
              
              if (typeof item === 'string') {
                const rawRelated = getPage(item) as any;
                if (!rawRelated) return null;
                relatedTitle = rawRelated.type === 'template' 
                  ? rawRelated.hero?.h1 
                  : (rawRelated.h1 || rawRelated.heroTitle || rawRelated.title || item);
                href = `/${item}`;
              }

              if (!href) return null;

              return (
                <Link 
                  key={href}
                  href={href}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200"
                >
                  <div>
                    <h3 className="text-[16px] font-bold text-[#2563eb] group-hover:text-blue-700 transition-colors">
                      {relatedTitle}
                    </h3>
                    {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
                  </div>
                  <div className="mt-2 sm:mt-0 flex items-center text-sm font-bold text-slate-400 group-hover:text-[#2563eb] transition-colors">
                    Read <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
          
          {heroCta?.primary && (
            <div className="border-t border-slate-100 pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-[#0B1221]">Ready to dive in?</h4>
                <p className="text-sm text-slate-500">Get started with Arcli today.</p>
              </div>
              <Link 
                href={heroCta.primary.href || '#'} 
                className="inline-flex items-center gap-2 bg-[#2563eb] text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors"
              >
                {heroCta.primary.text || 'Get Started'}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export const FAQs = ({ faqs }: { faqs: NormalizedPage['faqs'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!faqs || faqs.length === 0) return null;
  return (
    <section className="py-16 md:py-24 bg-white border-t border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <SectionHeading 
          monoLabel="// DOCUMENTATION"
          subtitle="Everything you need to know about implementing Arcli's engine into your stack."
        >
          Expert Insights
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="space-y-3">
          {/* Explicitly cast faq as any here so TypeScript allows .q, .question, .a, .answer simultaneously */}
          {faqs?.map((faq: any, i) => (
            <details 
              key={i} 
              style={{ transitionDelay: `${i * 100}ms` }}
              className={`group bg-white border border-slate-200 rounded-lg overflow-hidden [&_summary::-webkit-details-marker]:hidden shadow-sm hover:border-slate-300 transition-all duration-700 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              <summary className="flex items-center justify-between cursor-pointer p-4 md:p-5 font-bold text-[#0B1221] text-[15px] md:text-[16px] hover:bg-slate-50 transition-colors focus:outline-none tracking-tight">
                {faq.q || faq.question}
                <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-slate-50 border border-slate-200 p-1.5 rounded-md text-slate-500 group-hover:bg-[#2563eb] group-hover:text-white group-hover:border-[#2563eb]">
                  <ChevronDown className="w-4 h-4" />
                </span>
              </summary>
              <div className="p-4 md:p-5 pt-2 text-slate-500 text-[14px] md:text-[15px] leading-relaxed font-medium bg-white border-t border-slate-100">
                {faq.a || faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};