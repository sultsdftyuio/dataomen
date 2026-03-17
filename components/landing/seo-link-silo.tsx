"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
// Matches your modular SEO architecture
import { seoPages } from '@/lib/seo/index';

/**
 * Interface Definitions
 * Computation (Execution): Strict TypeScript interfaces for self-documenting code.
 */
interface SeoPageLink {
  slug: string;
  title: string;
}

interface GroupedSeoPages {
  [key: string]: SeoPageLink[];
}

/**
 * SeoLinkSilo Component
 * Interaction (Frontend): 100% Functional React component with hooks.
 * * This component acts as a semantic link repository for crawlers and users,
 * improving SEO through automated link siloing.
 */
export function SeoLinkSilo() {
  /**
   * Analytical Efficiency: Memoizing the grouping logic to prevent 
   * unnecessary re-computations during state changes or re-renders.
   */
  const groupedPages = useMemo(() => {
    const grouped: GroupedSeoPages = {};

    Object.entries(seoPages).forEach(([slug, data]) => {
      const type = data.type || 'resources'; // Fallback logic
      
      if (!grouped[type]) {
        grouped[type] = [];
      }

      // Mathematical Precision: Clean up title logic using vector-like split/trim operations.
      // "Best AI Data Analysis | Arcli" -> "Best AI Data Analysis"
      const cleanTitle = data.title.split('|')[0].trim();
      grouped[type].push({ slug, title: cleanTitle });
    });

    return grouped;
  }, []);

  const columns = useMemo(() => Object.keys(groupedPages).sort(), [groupedPages]);

  if (columns.length === 0) return null;

  return (
    <section className="border-t border-slate-900 bg-slate-50 py-16" aria-labelledby="silo-heading">
      <div className="container px-4 max-w-6xl mx-auto">
        
        {/* Header Block: Grounded in outcome-driven positioning */}
        <div className="mb-12">
          <h2 id="silo-heading" className="text-2xl font-black uppercase tracking-tight text-slate-900 mb-2">
            Explore Arcli
          </h2>
          <p className="text-slate-600 text-sm font-medium max-w-2xl">
            Discover how our autonomous AI agents adapt to your specific analytical needs, 
            datasets, and engineering workflows.
          </p>
        </div>

        {/* Interaction (Frontend): Responsive, semantic grid for crawler accessibility */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {columns.map((type) => (
            <div key={type} className="flex flex-col space-y-4">
              <h3 className="text-xs font-black text-slate-900 tracking-widest uppercase border-l-2 border-orange-500 pl-3">
                {type.endsWith('s') ? type : `${type}s`}
              </h3>
              <ul className="flex flex-col space-y-3">
                {groupedPages[type].map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/${page.slug}`}
                      className="text-sm text-slate-500 font-medium hover:text-blue-600 transition-colors duration-200 block"
                    >
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}