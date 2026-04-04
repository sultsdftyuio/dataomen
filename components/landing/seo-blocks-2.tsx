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
  Database,
  Network,
  Cpu,
  Terminal,
  FileText
} from 'lucide-react';

import type { NormalizedPage } from '@/lib/seo/parser';

/**
 * PRODUCTION-READY TECHNICAL UI BLOCKS
 * High-signal documentation-style navigation and layouts.
 */

function SimpleHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-10">
      <div className="font-mono text-[11px] font-bold text-[#2563eb] tracking-[0.2em] uppercase mb-3">
        {label}
      </div>
      <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-slate-600 text-base font-medium leading-relaxed max-w-2xl">{subtitle}</p>}
    </div>
  );
}

export const Steps = ({ steps }: { steps: NormalizedPage['steps'] }) => {
  if (!steps?.length) return null;

  return (
    <section className="py-24 bg-white border-t border-slate-200">
      <div className="container mx-auto px-4 max-w-4xl">
        <SimpleHeader label="// PIPELINE" title="Implementation Sequence" />
        <div className="grid gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {steps.map((step, i) => (
            <div key={i} className="bg-white p-8 flex flex-col sm:flex-row gap-6 hover:bg-slate-50/50 transition-colors">
              <span className="font-mono text-sm font-black text-slate-300 mt-1">0{i + 1}</span>
              <div>
                <h4 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">{step.title}</h4>
                <p className="text-slate-600 text-sm font-medium leading-relaxed">{step.description}</p>
                {step.outcome && (
                  <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-[#2563eb] uppercase tracking-widest bg-blue-50/50 self-start inline-flex px-3 py-1.5 rounded-md">
                    <CheckCircle2 size={14} />
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

export const Features = ({ features }: { features: NormalizedPage['features'] }) => {
  if (!features?.length) return null;

  // Technical icon mapping
  const getIcon = (index: number) => {
    const icons = [Database, Network, Cpu, Terminal];
    const Icon = icons[index % icons.length];
    return <Icon size={18} strokeWidth={2} />;
  };

  return (
    <section className="py-24 bg-slate-50 border-y border-slate-200/60">
      <div className="container mx-auto px-4 max-w-5xl">
        <SimpleHeader 
          label="// SYSTEM_CAPABILITIES" 
          title="Engine Architecture" 
          subtitle="The technological foundation behind Arcli. Designed to eliminate infrastructure overhead and manual operations."
        />
        
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <div key={i} className="bg-white border border-slate-200 p-8 rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:border-[#2563eb]/40 transition-colors">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[#2563eb]">
                  {getIcon(i)}
                </div>
                <h3 className="font-bold text-slate-900 text-lg tracking-tight">
                  {feature.title}
                </h3>
              </div>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const Architecture = ({ architecture }: { architecture: NormalizedPage['architecture'] }) => {
  if (!architecture || Object.keys(architecture).length === 0) return null;

  return (
    <section className="py-24 bg-[#0B1221] text-white">
      <div className="container mx-auto px-4 max-w-5xl">
        <SimpleHeader label="// SPECIFICATION" title="Technical Architecture" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-white/[0.02] border border-white/10 rounded-xl p-8">
          {Object.entries(architecture).map(([key, value]) => (
            <div key={key} className="border-l-2 border-[#2563eb]/40 pl-4 py-1">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </div>
              <div className="text-sm font-bold text-white line-clamp-2">{value as string}</div>
            </div>
          ))}
        </div>
        
        <div className="mt-12 flex flex-wrap items-center gap-8 opacity-70">
           {[
             { Icon: Globe, Label: "MULTI-REGION COMPUTE" },
             { Icon: Lock, Label: "SOC2 COMPLIANT" },
             { Icon: Workflow, Label: "API FIRST DESIGN" },
             { Icon: BarChart3, Label: "LOW LATENCY ENGINE" }
           ].map((badge, idx) => (
             <div key={idx} className="flex items-center gap-2.5">
               <badge.Icon size={14} className="text-slate-400" />
               <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-slate-300">{badge.Label}</span>
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
    <section className="py-24 bg-white border-t border-slate-200">
      <div className="container mx-auto px-4 max-w-4xl">
        <SimpleHeader label="// REFERENCE_INDEX" title="Related Documentation" />
        
        {/* Minimalist Link List UI */}
        <div className="bg-white border border-slate-200 rounded-xl p-2 sm:p-4 mb-10 shadow-sm">
          <ul className="flex flex-col">
            {relatedPages.map((page, i) => (
              <li key={page.slug} className={`${i !== relatedPages.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <Link 
                  href={`/${page.slug}`}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <FileText size={16} className="text-slate-400 group-hover:text-[#2563eb] shrink-0 mt-0.5 sm:mt-0 transition-colors" />
                    <span className="text-slate-700 font-semibold group-hover:text-[#2563eb] transition-colors decoration-slate-300 underline-offset-4 group-hover:underline">
                      {page.title}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 pl-9 sm:pl-0">
                    <span className="font-mono text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded">
                      {page.tag}
                    </span>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-[#2563eb] group-hover:translate-x-1 transition-all hidden sm:block" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <Link 
            href={heroCta.primary.href}
            className="group inline-flex items-center gap-2 bg-[#0B1221] text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm"
          >
            {heroCta.primary.text}
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export const FAQs = ({ faqs }: { faqs: NormalizedPage['faqs'] }) => {
  if (!faqs?.length) return null;

  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200">
      <div className="container mx-auto px-4 max-w-3xl">
        <SimpleHeader label="// KNOWLEDGE_BASE" title="Frequently Asked Questions" />
        
        {/* Polished Native Accordion UI */}
        <div className="border-t border-slate-200 divide-y divide-slate-200">
          {faqs.map((faq, i) => (
            <details key={i} className="group [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between py-6 cursor-pointer list-none focus:outline-none">
                <h4 className="text-[17px] font-bold text-slate-900 group-hover:text-[#2563eb] transition-colors pr-6">
                  {faq.q}
                </h4>
                <span className="flex-shrink-0 w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-[#2563eb] group-hover:border-[#2563eb]/30 group-open:rotate-180 transition-all bg-white shadow-sm">
                  <ChevronDown size={16} strokeWidth={2.5} />
                </span>
              </summary>
              <div className="pb-8 pr-12 text-slate-600 text-sm font-medium leading-relaxed animate-in fade-in duration-300">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};