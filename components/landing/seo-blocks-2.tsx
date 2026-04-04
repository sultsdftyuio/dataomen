"use client";

import React from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  CheckCircle2,
  Globe,
  Lock,
  Workflow,
  BarChart3,
  ChevronDown,
  FileCode,
  Sparkles, 
  Fingerprint, 
  Compass, 
  Shield, 
  Zap, 
  Orbit
} from 'lucide-react';

import type { NormalizedPage } from '@/lib/seo/parser';
import { useVisible } from "@/hooks/useVisible";

/**
 * PRODUCTION-READY HYBRID UI BLOCKS
 * Combines high-signal technical documentation layout with an "Elegant & Luxury" Feature section.
 */

function SimpleHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-12">
      <div className="font-mono text-[10px] font-bold text-[#2563eb] tracking-[0.2em] uppercase mb-2">
        {label}
      </div>
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-slate-500 text-sm font-medium leading-relaxed max-w-2xl">{subtitle}</p>}
    </div>
  );
}

export const Steps = ({ steps }: { steps: NormalizedPage['steps'] }) => {
  if (!steps?.length) return null;

  return (
    <section className="py-20 bg-white border-t border-slate-100">
      <div className="container mx-auto px-4 max-w-4xl">
        <SimpleHeader label="// PIPELINE" title="Implementation Steps" />
        <div className="grid gap-px bg-slate-100 border border-slate-100 rounded-lg overflow-hidden shadow-sm">
          {steps.map((step, i) => (
            <div key={i} className="bg-white p-6 flex gap-6 hover:bg-slate-50 transition-colors">
              <span className="font-mono text-xs font-black text-slate-300 mt-1">0{i + 1}</span>
              <div>
                <h4 className="font-bold text-slate-900 mb-1">{step.title}</h4>
                <p className="text-slate-500 text-sm font-medium leading-snug">{step.description}</p>
                {step.outcome && (
                  <div className="mt-3 flex items-center gap-2 text-[10px] font-black text-[#2563eb] uppercase tracking-widest">
                    <CheckCircle2 size={12} />
                    {step.outcome}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/**
 * Heuristic Visual Mapping
 * Maps features to elegant, abstract icons.
 * Luxury branding often uses metaphor over literal representation.
 */
const getElegantIcon = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes('data') || t.includes('intelligence')) return Fingerprint;
  if (t.includes('ai') || t.includes('automated')) return Sparkles;
  if (t.includes('workflow') || t.includes('sync')) return Orbit;
  if (t.includes('security') || t.includes('trust')) return Shield;
  if (t.includes('speed') || t.includes('real-time')) return Zap;
  return Compass;
};

export const Features = ({ features }: { features: NormalizedPage['features'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!features || features.length === 0) return null;

  return (
    <section className="py-32 bg-[#FAF9F6] relative overflow-hidden border-y border-slate-200/60">
      {/* Subtle Grain Texture Overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        <div className="flex flex-col lg:flex-row gap-20">
          
          {/* Left Column: The Editorial Hook */}
          <div className="w-full lg:w-5/12">
            <div className="sticky top-32">
              <div className="mb-6">
                <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-slate-400 block mb-4">
                  // THE_ART_OF_PRECISION
                </span>
              </div>

              <h2 className="text-5xl lg:text-6xl font-light text-[#1A1A1A] leading-[1.1] tracking-tight mb-8">
                The <span className="italic font-serif">Standard</span> <br />
                of Intelligence
              </h2>
              
              <p className="text-lg text-slate-500 leading-relaxed font-light max-w-sm mb-12">
                Designed for those who demand clarity without compromise. A seamless orchestration of data, refined for the modern executive.
              </p>

              {/* Minimalist Progress Line */}
              <div className="hidden lg:block w-px h-32 bg-gradient-to-b from-slate-200 to-transparent ml-2" />
            </div>
          </div>

          {/* Right Column: The Feature Gallery */}
          <div ref={ref as React.RefObject<HTMLDivElement>} className="w-full lg:w-7/12">
            <div className="grid grid-cols-1 gap-px bg-slate-200/60 overflow-hidden rounded-3xl border border-slate-200/60">
              {features.map((feature, i) => {
                const Icon = getElegantIcon(feature.title);
                return (
                  <div 
                    key={i} 
                    style={{ transitionDelay: `${i * 150}ms` }}
                    className={`group relative bg-[#FAF9F6] p-12 lg:p-16 transition-all duration-1000 ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                  >
                    <div className="flex flex-col sm:flex-row items-start gap-10">
                      
                      {/* Icon as Jewelry */}
                      <div className="relative shrink-0 mt-1">
                        <div className="w-14 h-14 rounded-full border border-slate-200 flex items-center justify-center bg-white shadow-sm group-hover:border-slate-400 group-hover:scale-110 transition-all duration-700">
                          <Icon className="w-5 h-5 text-slate-400 group-hover:text-slate-900 transition-colors duration-500 stroke-[1.2px]" />
                        </div>
                        <div className="absolute -inset-2 bg-slate-400/5 rounded-full scale-0 group-hover:scale-100 transition-transform duration-700 -z-10" />
                      </div>

                      {/* Content Section */}
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-slate-300 tracking-[0.3em] uppercase">
                            0{i + 1}
                          </span>
                        </div>
                        
                        <h3 className="text-2xl font-medium text-[#1A1A1A] tracking-tight group-hover:translate-x-1 transition-transform duration-500">
                          {feature.title}
                        </h3>
                        
                        {feature.description && (
                          <p className="text-slate-500 leading-relaxed font-light text-[17px] max-w-md">
                            {feature.description}
                          </p>
                        )}

                        <div className="pt-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-300 group-hover:text-slate-900 transition-colors duration-500">
                          Explore Capability
                          <ArrowRight className="w-3 h-3 translate-x-0 group-hover:translate-x-2 transition-transform duration-500" />
                        </div>
                      </div>
                    </div>

                    {/* Subtle Internal Glow */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-0 group-hover:opacity-100 blur-3xl transition-opacity duration-1000 -z-10" />
                  </div>
                );
              })}
            </div>
            
            {/* Elegant Footer Note */}
            <div className="mt-12 text-center lg:text-left px-4">
              <p className="font-serif italic text-slate-400 text-sm">
                Built to be invisible. Experienced as indispensable.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export const Architecture = ({ architecture }: { architecture: NormalizedPage['architecture'] }) => {
  if (!architecture || Object.keys(architecture).length === 0) return null;

  return (
    <section className="py-20 bg-[#0B1221] text-white">
      <div className="container mx-auto px-4 max-w-5xl">
        <SimpleHeader label="// ARCHITECTURE" title="Technical Specification" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(architecture).map(([key, value]) => (
            <div key={key} className="border-l border-white/10 pl-4 py-2">
              <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </div>
              <div className="text-sm font-bold text-white line-clamp-2">{value as string}</div>
            </div>
          ))}
        </div>
        
        <div className="mt-12 pt-8 border-t border-white/5 grid grid-cols-2 lg:grid-cols-4 gap-6 opacity-60">
           {[
             { Icon: Globe, Label: "MULTI-REGION" },
             { Icon: Lock, Label: "SOC2 COMPLIANT" },
             { Icon: Workflow, Label: "API FIRST" },
             { Icon: BarChart3, Label: "LOW LATENCY" }
           ].map((badge, idx) => (
             <div key={idx} className="flex items-center gap-2.5">
               <badge.Icon size={14} className="text-slate-400" />
               <span className="font-mono text-[9px] font-black tracking-[0.2em] uppercase">{badge.Label}</span>
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
  if (!relatedPages?.length) return null;

  return (
    <section className="py-20 bg-white border-t border-slate-100">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <SimpleHeader label="// SEMANTIC_LINKS" title="Related Articles" />
          <Link 
            href={heroCta.primary.href}
            className="group inline-flex items-center gap-2 bg-[#0B1221] text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all shadow-md shadow-slate-900/10"
          >
            {heroCta.primary.text}
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
        
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {relatedPages.map((page) => (
            <Link 
              key={page.slug}
              href={`/${page.slug}`}
              className="bg-white p-6 hover:bg-slate-50 transition-colors group h-full flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileCode size={12} className="text-slate-400 group-hover:text-[#2563eb]" />
                  <span className="font-mono text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    {page.tag}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-[#2563eb] transition-colors line-clamp-2">
                  {page.title}
                </h4>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export const FAQs = ({ faqs }: { faqs: NormalizedPage['faqs'] }) => {
  if (!faqs?.length) return null;

  return (
    <section className="py-20 bg-white border-t border-slate-100">
      <div className="container mx-auto px-4 max-w-3xl">
        <SimpleHeader label="// FAQ" title="Expert Insights" />
        <div className="divide-y divide-slate-100">
          {faqs.map((faq, i) => (
            <details key={i} className="group">
              <summary className="flex items-center justify-between py-5 cursor-pointer font-bold text-slate-900 hover:text-[#2563eb] transition-colors list-none">
                <span>{faq.q}</span>
                <ChevronDown size={16} className="text-slate-400 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="pb-6 text-slate-500 text-sm font-medium leading-relaxed">
                <div className="pt-2 border-t border-slate-50">
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