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
  Network,
  Zap,
  ShieldCheck,
  FileCode,
  Box
} from 'lucide-react';

import type { NormalizedPage } from '@/lib/seo/parser';
import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BOTTOM-OF-FUNNEL BLOCKS (ELEGANT SOPHISTICATED STYLE)
// ----------------------------------------------------------------------

export const Steps = ({ steps }: { steps: NormalizedPage['steps'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!steps || steps.length === 0) return null;
  return (
    <section className="py-32 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading 
          monoLabel="// EXECUTION_PIPELINE"
          subtitle="Our engine handles the complexity of data movement while you focus on high-level decision logic."
        >
          Implementation Pipeline
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="relative pl-10 md:pl-0">
          <div className={`absolute left-[29px] md:left-1/2 md:-ml-[1px] top-0 bottom-0 w-[2px] bg-slate-100 transition-all duration-1000 ${vis ? 'opacity-100 h-full' : 'opacity-0 h-0'}`}></div>
          
          <div className="space-y-12 md:space-y-20">
            {steps.map((step, i) => (
              <div 
                key={i} 
                style={{ transitionDelay: `${i * 200}ms` }}
                className={`relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-12 group transition-all duration-700 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`} 
              >
                <div className="hidden md:block w-1/2 text-right pr-12">
                   <span className="font-mono text-[11px] font-bold text-slate-300 tracking-[0.3em]">STEP_0{i + 1}</span>
                </div>
                
                <div className="absolute left-[-20px] md:left-1/2 md:-ml-2.5 w-5 h-5 rounded-full bg-white border-2 border-slate-200 group-hover:border-[#2563eb] z-10 flex items-center justify-center transition-all duration-300 shadow-sm group-hover:scale-125">
                   <div className="w-1.5 h-1.5 bg-transparent group-hover:bg-[#2563eb] rounded-full transition-colors"></div>
                </div>
                
                <div className="w-full md:w-1/2 bg-white border border-slate-200 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] rounded-2xl p-8 hover:shadow-[0_20px_40px_-15px_rgba(37,99,235,0.1)] hover:border-[#2563eb]/20 transition-all duration-500 relative overflow-hidden">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563eb] mb-3">
                    {step.title}
                  </div>
                  <h4 className="text-[19px] font-extrabold text-[#0B1221] leading-tight mb-3 tracking-tight">
                    {step.description}
                  </h4>
                  {step.outcome && (
                    <div className="mt-4 text-[14px] text-slate-500 font-semibold flex items-center gap-2.5 pt-4 border-t border-slate-50">
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
    <section className="py-32 bg-[#f8fafc] relative border-y border-slate-200/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        
        <div className="flex flex-col lg:flex-row gap-16 relative">
          
          <div className="w-full lg:w-5/12">
            <div className="sticky top-32">
              <SectionHeading 
                align="left"
                monoLabel="// ENGINE_CAPABILITIES"
                subtitle="The technological foundation behind Arcli. Designed to eliminate infrastructure overhead and manual RevOps lag."
              >
                Sophisticated<br />Data Handling
              </SectionHeading>
              
              <div className="hidden lg:flex items-center gap-4 text-slate-400 mt-12">
                <div className="w-10 h-[1px] bg-slate-300"></div>
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em]">Scroll to inspect system specs</span>
              </div>
            </div>
          </div>

          <div ref={ref as React.RefObject<HTMLDivElement>} className="w-full lg:w-7/12 space-y-6">
            {features.map((feature, i) => (
              <div 
                key={i} 
                style={{ transitionDelay: `${i * 100}ms` }}
                className={`flex flex-col sm:flex-row items-start gap-8 bg-white p-10 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-[0_30px_60px_-15px_rgba(11,18,33,0.08)] hover:border-[#2563eb]/20 transition-all duration-700 group relative overflow-hidden transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2563eb] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="relative shrink-0 w-16 h-16 rounded-2xl border border-slate-100 flex items-center justify-center bg-slate-50 group-hover:bg-blue-50/50 group-hover:border-blue-100 transition-all duration-500">
                  <Box className="w-7 h-7 text-slate-400 group-hover:text-[#2563eb] transition-colors" />
                </div>

                <div>
                  <h3 className="text-2xl font-black text-[#0B1221] mb-3 tracking-tight">{feature.title}</h3>
                  {feature.description && (
                    <p className="text-slate-500 leading-relaxed font-medium text-[17px]">
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
    <section className="py-32 bg-[#0B1221] text-white relative overflow-hidden">
      {/* Visual background accents */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#2563eb]/5 blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/5 blur-[100px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] opacity-30"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="mb-20">
          <div className={`transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-[#60a5fa]" />
              </div>
              <span className="font-mono text-[11px] font-black uppercase tracking-[0.3em] text-[#60a5fa]">SYSTEM_SPECIFICATION_v4.0</span>
            </div>
            <h2 className="text-[clamp(36px,5vw,56px)] font-black tracking-tighter leading-none mb-6">Enterprise Architecture</h2>
            <p className="text-slate-400 max-w-xl text-lg font-medium">The technical protocols governing Arcli's high-concurrency local execution engine.</p>
          </div>
        </div>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-3 gap-1 mb-20 bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          {Object.entries(architecture).map(([key, value], i) => (
            <div 
              key={key} 
              className="bg-[#0B1221] p-10 hover:bg-white/[0.03] transition-colors group border-white/5 border"
            >
              <h4 className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4 group-hover:text-[#60a5fa] transition-colors">
                {/* Fixed the clunky camelCase logic to return INGESTION_METHOD style */}
                {key.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toUpperCase()}
              </h4>
              <p className="text-[20px] font-bold text-white leading-snug tracking-tight">
                {value as string}
              </p>
            </div>
          ))}
        </div>

        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-8 transition-all duration-1000 delay-500 ${vis ? 'opacity-100' : 'opacity-0'}`}>
           {[
             { Icon: Globe, Label: "MULTI-REGION" },
             { Icon: Lock, Label: "SOC2 TYPE II" },
             { Icon: Workflow, Label: "API FIRST" },
             { Icon: BarChart3, Label: "LOW LATENCY" }
           ].map((badge, idx) => (
             <div key={idx} className="flex items-center gap-3">
               <badge.Icon className="w-4 h-4 text-slate-500" />
               <span className="text-slate-400 font-black font-mono text-[11px] tracking-widest uppercase">{badge.Label}</span>
             </div>
           ))}
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
    <section className="py-32 bg-white relative overflow-hidden border-t border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <SectionHeading 
          monoLabel="// SEMANTIC_CLUSTERS"
          subtitle="Explore semantically connected architectural patterns and technical documentation."
        >
          Deep Dive Exploration
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {relatedPages.map((page, i) => (
            <Link 
              key={page.slug}
              href={`/${page.slug}`}
              style={{ transitionDelay: `${i * 100}ms` }}
              className={`bg-[#f8fafc] p-10 rounded-[2rem] border border-slate-200 shadow-sm hover:border-[#2563eb]/40 hover:shadow-[0_30px_60px_-15px_rgba(37,99,235,0.12)] transition-all duration-700 group flex flex-col justify-between h-full hover:-translate-y-2 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <div>
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-[#2563eb] group-hover:border-blue-100 transition-all">
                    <FileCode size={16} />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400 font-black">
                    {page.tag}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-[#0B1221] mb-8 tracking-tight line-clamp-3 leading-snug">
                  {page.title}
                </h3>
              </div>
              <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-200/50">
                <span className="font-mono text-[10px] font-black text-[#2563eb] uppercase tracking-[0.2em]">ACCESS_FILE</span>
                <ArrowRight className="w-4 h-4 text-[#2563eb] group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
        
        <div className={`flex justify-center transition-all duration-1000 delay-300 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <Link 
            href={heroCta.primary.href} 
            className="group relative flex items-center justify-center gap-3 bg-[#0B1221] text-white px-10 py-5 rounded-2xl text-lg font-black shadow-xl hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)] hover:-translate-y-1 transition-all duration-300"
          >
            {heroCta.primary.text} 
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
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
    <section className="py-32 bg-[#f8fafc] border-t border-slate-200/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading 
          monoLabel="// TECHNICAL_FAQ"
          subtitle="Critical insights regarding local compute, data sovereignty, and engine integration."
        >
          Expert Insights
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="space-y-4 mt-12">
          {faqs.map((faq, i) => (
            <details 
              key={i} 
              style={{ transitionDelay: `${i * 100}ms` }}
              className={`group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-[#2563eb]/20 transition-all duration-700 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              <summary className="flex items-center justify-between cursor-pointer p-8 font-bold text-[#0B1221] text-lg hover:bg-slate-50 transition-colors focus:outline-none tracking-tight list-none">
                <span className="pr-8">{faq.q}</span>
                <span className="shrink-0 transition-all duration-500 group-open:rotate-180 bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-slate-400 group-hover:text-[#2563eb]">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </summary>
              <div className="px-8 pb-8 text-slate-500 text-[17px] leading-relaxed font-medium bg-white">
                <div className="pt-2 border-t border-slate-100">
                  {faq.a}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};