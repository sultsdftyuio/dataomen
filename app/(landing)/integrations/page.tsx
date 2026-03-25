// app/(landing)/integrations/page.tsx
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Database, Cloud, BarChart, ArrowRight, LayoutGrid, Terminal, Server } from 'lucide-react';

// --- Types & Interfaces ---

type IntegrationCategory = 'Database' | 'SaaS' | 'File' | 'All';

interface IntegrationRoute {
  name: string;
  slug: string;
  category: IntegrationCategory;
  description: string;
  icon: React.ElementType;
}

// --- Data Configuration (Derived from SEO Targets) ---

const INTEGRATIONS_DATA: IntegrationRoute[] = [
  // Databases & Warehouses
  { name: 'PostgreSQL', slug: '/postgresql-ai-analytics', category: 'Database', description: 'AI Text-to-SQL and automated reporting for your Postgres instances.', icon: Database },
  { name: 'Snowflake', slug: '/snowflake-ai-sql-generator', category: 'Database', description: 'Generate complex Snowflake SQL and build instant dashboards.', icon: Cloud },
  { name: 'MySQL', slug: '/mysql-ai-analytics', category: 'Database', description: 'Connect MySQL for instant AI-driven analytics and dashboarding.', icon: Database },
  { name: 'Microsoft SQL Server', slug: '/sql-server-ai-analytics', category: 'Database', description: 'Automate executive reporting from SQL Server environments.', icon: Server },
  { name: 'Google BigQuery', slug: '/bigquery-ai-analytics', category: 'Database', description: 'Analyze massive BigQuery datasets with zero data movement.', icon: Cloud },
  
  // SaaS & CRMs
  { name: 'Salesforce', slug: '/salesforce-ai-analytics', category: 'SaaS', description: 'Analyze pipelines, close rates, and Salesforce CRM data via AI chat.', icon: LayoutGrid },
  { name: 'HubSpot', slug: '/hubspot-ai-analytics', category: 'SaaS', description: 'Deep dive into deals, contacts, and revenue operations.', icon: LayoutGrid },
  { name: 'Shopify', slug: '/shopify-ai-analytics', category: 'SaaS', description: 'Predictive analytics and reporting for e-commerce stores.', icon: BarChart },
  { name: 'Google Analytics 4', slug: '/ga4-ai-dashboard', category: 'SaaS', description: 'Query web traffic and conversion metrics using natural language.', icon: BarChart },
  
  // Flat Files & Object Storage
  { name: 'Excel / CSV', slug: '/excel-csv-ai-analyzer', category: 'File', description: 'Replace brittle formulas. Analyze massive spreadsheets instantly.', icon: Terminal },
  { name: 'Parquet / JSON', slug: '/parquet-json-ai-analysis', category: 'File', description: 'Query complex, nested data exports using in-memory analytical engines.', icon: Terminal },
];

// --- Main Component ---

export default function IntegrationsHubPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>('All');

  // Memoized filtering for fast, client-side UI updates
  const filteredIntegrations = useMemo(() => {
    return INTEGRATIONS_DATA.filter((integration) => {
      const matchesSearch = integration.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            integration.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Fixed: Removed the invalid string literal comparison
      const matchesCategory = activeCategory === 'All' || integration.category === activeCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="pt-24 pb-12 px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
          Connect your data. <span className="text-blue-600">Ask anything.</span>
        </h1>
        <p className="mt-4 text-lg text-zinc-600 max-w-2xl mx-auto">
          Arcli natively connects to your databases, data warehouses, and SaaS applications. 
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
              className="block w-full pl-10 pr-3 py-2 border border-zinc-300 rounded-lg leading-5 bg-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 sm:text-sm transition-all"
              placeholder="Search integrations (e.g., PostgreSQL, HubSpot)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            {['All', 'Database', 'SaaS', 'File'].map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category as IntegrationCategory)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  activeCategory === category
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Grid */}
      <section className="px-6 lg:px-8 max-w-7xl mx-auto pb-24">
        {filteredIntegrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIntegrations.map((integration) => {
              const Icon = integration.icon;
              return (
                <Link 
                  href={integration.slug} 
                  key={integration.slug}
                  className="group relative bg-white border border-zinc-200 rounded-2xl p-6 hover:shadow-lg hover:border-blue-200 transition-all duration-200 flex flex-col h-full"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Icon className="w-6 h-6 text-blue-600 group-hover:text-white" />
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
          <div className="text-center py-20 bg-zinc-50 rounded-2xl border border-dashed border-zinc-300">
            <p className="text-zinc-500 font-medium">No integrations found matching "{searchQuery}".</p>
            <button 
              onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
              className="mt-4 text-blue-600 font-medium hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}