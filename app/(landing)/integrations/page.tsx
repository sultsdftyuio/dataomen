// app/(landing)/integrations/page.tsx
"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { INTEGRATIONS, CATEGORIES } from '@/lib/integration-config';
import type { IntegrationConfig } from '@/types/integration';

// --- Types & Utilities ---

type IntegrationCategory = IntegrationConfig['category'] | 'All';

// Better debounce: instant for short queries, smooth for long strings
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    if (delay === 0) {
      setDebouncedValue(value);
      return;
    }
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

const normalize = (s: string) => s.toLowerCase().trim();

// Smart string similarity for typo tolerance & better suggestions
function similarity(a: string, b: string) {
  return a.split('').filter(c => b.includes(c)).length;
}

// O(n) Precomputed Search Index
const SEARCH_INDEX = INTEGRATIONS.map(i => {
  const tableInsightsStr = i.tableInsights
    ? Object.entries(i.tableInsights).map(([k, v]) => `${k} ${v.purpose} ${v.dashboards.join(' ')}`).join(' ')
    : '';
  const insightsStr = i.insights
    ? i.insights.map(x => `${x.label} ${x.description || ''}`).join(' ')
    : '';

  return {
    integration: i,
    searchBlob: normalize([
      i.name,
      i.description,
      i.category,
      insightsStr,
      tableInsightsStr
    ].join(' '))
  };
});

// --- Main Content Component ---

function IntegrationsHubContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  // Hydration-safe state initialization
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>('All');

  // Memoize categories to prevent recreation on every render
  const allCategories: IntegrationCategory[] = useMemo(() => ['All', ...CATEGORIES], []);

  // 1. Initial State Sync (Prevent Hydration Mismatch)
  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    setSearchQuery(params.get('q') || '');

    // Strict URL Parameter Validation
    const validCategories = new Set(allCategories);
    const initialCategory = params.get('category');
    setActiveCategory(
      validCategories.has(initialCategory as any)
        ? (initialCategory as IntegrationCategory)
        : 'All'
    );

    setIsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run exactly once on mount

  // Dynamic Debounce
  const debouncedQuery = useDebounce(searchQuery, searchQuery.length > 2 ? 200 : 0);

  // 2. URL State Sync (Stable Dependency)
  useEffect(() => {
    if (!isHydrated) return;

    const params = new URLSearchParams(searchParamsString);

    if (debouncedQuery) params.set('q', debouncedQuery);
    else params.delete('q');

    if (activeCategory !== 'All') params.set('category', activeCategory);
    else params.delete('category');

    const newQuery = params.toString();
    if (searchParamsString !== newQuery) {
      router.replace(`${pathname}?${newQuery}`, { scroll: false });
    }
  }, [debouncedQuery, activeCategory, pathname, router, searchParamsString, isHydrated]);

  // Advanced Filtering, Deep Search & Scoring Engine
  const filteredIntegrations = useMemo(() => {
    const q = normalize(debouncedQuery);

    // Fast path: no search + no filter
    if (!q && activeCategory === 'All') return INTEGRATIONS;

    const scored = SEARCH_INDEX.map((indexedItem) => {
      let score = 0;
      const { integration, searchBlob } = indexedItem;

      // 1. Hard Category Check (Mandatory Filter)
      if (activeCategory !== 'All' && integration.category !== activeCategory) {
        return { integration, score: -1 };
      }

      // If category matches but no search term, return default positive score
      if (q === '') {
        return { integration, score: 1 };
      }

      const nameNorm = normalize(integration.name);
      const descNorm = normalize(integration.description);
      const catNorm = normalize(integration.category);

      // 2. Exact & Prefix Matches (Stacking Scores)
      if (nameNorm === q) score += 10;
      if (nameNorm.startsWith(q)) score += 5;
      if (nameNorm.includes(q)) score += 3;

      // 3. Metadata Matches
      if (descNorm.includes(q)) score += 2;
      if (catNorm.includes(q)) score += 2;

      // 4. O(1) Deep Context Match via Precomputed Blob
      if (searchBlob.includes(q)) score += 1;

      return { integration, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.integration);
  }, [debouncedQuery, activeCategory]);

  // Smart Empty State Suggestion Fallback (Typo Tolerance)
  const suggestion = useMemo(() => {
    if (filteredIntegrations.length > 0 || !debouncedQuery) return null;
    const q = normalize(debouncedQuery);

    const fallback = INTEGRATIONS
      .map(i => ({
        name: i.name,
        score: similarity(normalize(i.name), q)
      }))
      .sort((a, b) => b.score - a.score)[0]?.name;

    return fallback || 'PostgreSQL';
  }, [filteredIntegrations.length, debouncedQuery]);

  // Prevent flicker during hydration
  if (!isHydrated) {
    return <IntegrationsSkeleton />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="pt-24 pb-12 px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
          Connect your data. <span className="text-blue-600">Ask anything.</span>
        </h1>
        <p className="mt-4 text-lg text-zinc-600 max-w-2xl mx-auto">
          Arcli natively connects to your databases, payment providers, and SaaS applications.
          Analyze your ecosystem with zero data movement and enterprise-grade security.
        </p>
      </section>

      {/* Control Bar (Search & Filter) */}
      <section className="px-6 lg:px-8 max-w-5xl mx-auto mb-12">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-zinc-50 p-4 rounded-2xl border border-zinc-200">

          {/* Search Input */}
          <div className="relative w-full sm:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-zinc-300 rounded-lg leading-5 bg-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 sm:text-sm transition-all shadow-sm"
              placeholder="Search integrations, metrics, dashboards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {allCategories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeCategory === category
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300'
                  }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Grid */}
      <section className="px-6 lg:px-8 max-w-7xl mx-auto pb-24 min-h-[400px]">
        {filteredIntegrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIntegrations.map((integration) => {
              const Icon = integration.icon;
              return (
                <Link
                  href={`/integrations/${integration.id}`}
                  key={integration.id}
                  className="group relative bg-white border border-zinc-200 rounded-2xl p-6 hover:shadow-lg hover:border-blue-200 transition-all duration-300 flex flex-col h-full overflow-hidden will-change-transform"
                >
                  {/* Status Badge */}
                  {integration.isPopular && (
                    <span className="absolute top-6 right-6 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-100 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Popular
                    </span>
                  )}

                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${integration.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">{integration.name}</h3>
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        {integration.category}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-zinc-600 flex-grow leading-relaxed">
                    {integration.description}
                  </p>

                  <div className="mt-6 flex items-center text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                    Explore capabilities
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 bg-zinc-50 rounded-2xl border border-dashed border-zinc-300 animate-in fade-in duration-500">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-100 mb-4">
              <Search className="w-6 h-6 text-zinc-400" />
            </div>

            <p className="text-zinc-600 font-medium mb-2">
              No integrations found for "{searchQuery}"
            </p>

            {/* Smart Empty State Correction */}
            {suggestion && (
              <p className="text-sm text-zinc-500 mb-6">
                Did you mean <button onClick={() => setSearchQuery(suggestion)} className="text-blue-600 font-medium hover:underline">{suggestion}</button>?
              </p>
            )}

            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
                className="text-sm px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors font-medium shadow-sm"
              >
                Clear search filters
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// --- Loading Skeleton (Eliminates CLS) ---
function IntegrationsSkeleton() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-zinc-500 font-medium">Loading integrations ecosystem...</p>
      </div>
    </div>
  );
}

// --- Provider Wrapper ---
// Required Next.js pattern: Suspense boundary ensures the page won't de-opt to purely client side
export default function IntegrationsHubPage() {
  return (
    <Suspense fallback={<IntegrationsSkeleton />}>
      <IntegrationsHubContent />
    </Suspense>
  );
}