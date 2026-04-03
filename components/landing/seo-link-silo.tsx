// components/landing/seo-link-silo.tsx
import React from 'react';
import Link from 'next/link';

// Core Registry & Deep-Data Parser
import { getAllSlugs } from '@/lib/seo/index';
import { getNormalizedPage } from '@/lib/seo/parser';

/**
 * PHASE 2: Semantic Topic Clusters (The Ontology)
 * Controlled Determinism: Maps dynamic, flexible page tags into rigid, predictable 
 * SEO silos to build high-authority topic clusters for search engines.
 */
const CLUSTER_ONTOLOGY: Record<string, string[]> = {
  'Security & Governance': ['security', 'soc2', 'encryption', 'compliance', 'governance', 'rbac', 'trust', 'audit'],
  'Data Integrations': ['integration', 'database', 'warehouse', 'api', 'etl', 'connector', 'pipeline', 'sync'],
  'AI & Analytics': ['sql', 'ai', 'insights', 'analysis', 'reporting', 'machine-learning', 'text-to-sql', 'visualization'],
  'Business Outcomes': ['finance', 'marketing', 'sales', 'revops', 'cfo', 'enterprise', 'roi', 'efficiency'],
  'Engineering Hub': ['performance', 'infrastructure', 'architecture', 'developer', 'latency', 'wasm', 'duckdb']
};

interface SeoPageLink {
  slug: string;
  title: string;
}

/**
 * SeoLinkSilo Component (Upgraded to Server Component)
 * Orchestrates automated internal linking. Moved away from client-side execution 
 * to ensure 100% crawler visibility and zero client-side JavaScript cost.
 */
export async function SeoLinkSilo() {
  const slugs = getAllSlugs();
  
  // Initialize cluster buckets
  const clusters: Record<string, SeoPageLink[]> = {};
  Object.keys(CLUSTER_ONTOLOGY).forEach(key => clusters[key] = []);
  const fallbackCluster = 'Platform Resources';
  clusters[fallbackCluster] = [];

  // Semantic Intersection Engine
  slugs.forEach((slug) => {
    const page = getNormalizedPage(slug);
    if (!page) return;

    // Mathematical Precision: Clean up title logic. "Best AI Data Analysis | Arcli" -> "Best AI Data Analysis"
    const cleanTitle = page.seo.title.split('|')[0].trim();
    let matched = false;

    // Route page into the correct semantic silo based on Tag Intersection
    for (const [clusterName, keywords] of Object.entries(CLUSTER_ONTOLOGY)) {
      const hasOverlap = page.tags.some(tag => keywords.includes(tag.toLowerCase()));
      
      if (hasOverlap) {
        // Determinism: Prevent duplicates. A page belongs to its highest-priority matched silo.
        clusters[clusterName].push({ slug, title: cleanTitle });
        matched = true;
        break; 
      }
    }

    // Fallback logic for standalone or lightly-tagged pages
    if (!matched && page.type !== 'campaign' && page.type !== 'template') {
      clusters[fallbackCluster].push({ slug, title: cleanTitle });
    }
  });

  // Prune empty clusters and enforce deterministic alphabetical sorting for UI stability
  const activeColumns = Object.entries(clusters)
    .filter(([_, links]) => links.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (activeColumns.length === 0) return null;

  return (
    <section className="border-t border-slate-900 bg-slate-50 py-16" aria-labelledby="silo-heading">
      <div className="container px-4 max-w-6xl mx-auto">
        
        {/* Header Block: Grounded in outcome-driven positioning */}
        <div className="mb-12">
          <h2 id="silo-heading" className="text-2xl font-black uppercase tracking-tight text-slate-900 mb-2">
            Explore Topic Clusters
          </h2>
          <p className="text-slate-600 text-sm font-medium max-w-2xl">
            Navigate our technical documentation, architecture deep-dives, and outcome-driven 
            blueprints through semantically connected learning paths.
          </p>
        </div>

        {/* Crawler-Optimized Semantic Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {activeColumns.map(([clusterName, links]) => (
            <div key={clusterName} className="flex flex-col space-y-4">
              <h3 className="text-xs font-black text-slate-900 tracking-widest uppercase border-l-2 border-[#2563eb] pl-3">
                {clusterName}
              </h3>
              <ul className="flex flex-col space-y-3">
                {/* Optional: Cap at top 8 links per column to prevent overwhelming UI */}
                {links.slice(0, 8).map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/${page.slug}`}
                      className="text-sm text-slate-500 font-medium hover:text-[#2563eb] transition-colors duration-200 block"
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