import React from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Metadata } from 'next';
import { BarChart3, TrendingUp, Zap, ArrowRight, Activity } from 'lucide-react';
import Link from 'next/link';

// Assuming you have a component to render the chart payload
import { DynamicChartFactory } from '@/components/dashboard/DynamicChartFactory'; 

interface SharedDashboardProps {
  params: {
    id: string;
  };
}

const BASE_URL = 'https://arcli.tech';

// Helper to safely extract Supabase relations whether TS thinks it's an array or an object
const extractRelation = (relation: any) => {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] : relation;
};

// -----------------------------------------------------------------------------
// 1. VIRAL SEO & OPEN GRAPH (Twitter Cards)
// -----------------------------------------------------------------------------
export async function generateMetadata({ params }: SharedDashboardProps): Promise<Metadata> {
  const supabase = await createClient();
  
  // Fetch the shared metric metadata (No RLS for shared=true rows)
  const { data: metric } = await supabase
    .from('shared_metrics')
    .select('name, description, tenant_id, organizations(name)')
    .eq('id', params.id)
    .eq('is_public', true)
    .single();

  if (!metric) return { title: 'Dashboard Not Found' };

  // FIX: Safely extract the joined organization
  const org = extractRelation(metric.organizations);
  const companyName = org?.name || 'A DataFast Startup';
  const metricName = metric.name || 'Shared Dashboard';
  const description = metric.description || `Live SaaS metrics for ${companyName}.`;
  const canonicalUrl = `${BASE_URL}/share/${params.id}`;

  const ogImageUrl = new URL('/api/og', BASE_URL);
  ogImageUrl.searchParams.set('title', `${companyName} ${metricName}`);
  ogImageUrl.searchParams.set('type', 'dashboard');

  return {
    title: `${metricName} | ${companyName}`,
    description,
    openGraph: {
      title: `${companyName} is sharing their ${metricName} publicly!`,
      description,
      type: 'website',
      url: canonicalUrl,
      siteName: 'Arcli',
      images: [
        {
          url: ogImageUrl.toString(),
          width: 1200,
          height: 630,
          alt: `${metricName} dashboard shared by ${companyName}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${companyName}'s Live ${metricName}`,
      description,
      images: [ogImageUrl.toString()],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

// -----------------------------------------------------------------------------
// 2. PUBLIC PAGE RENDERER
// -----------------------------------------------------------------------------
export default async function PublicSharedDashboard({ params }: SharedDashboardProps) {
  const supabase = await createClient();

  // Fetch the pre-computed payload and metadata
  const { data: sharedData, error } = await supabase
    .from('shared_metrics')
    .select(`
      id,
      name,
      description,
      payload,
      insights,
      updated_at,
      organizations ( name, logo_url )
    `)
    .eq('id', params.id)
    .eq('is_public', true)
    .single();

  if (error || !sharedData) {
    notFound();
  }

  // FIX: Safely extract the joined organization for the UI
  const org = extractRelation(sharedData.organizations);
  const companyName = org?.name || 'An Open Startup';
  const logoUrl = org?.logo_url;

  const lastUpdated = new Date(sharedData.updated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100">
      
      {/* VIRAL LOOP HEADER */}
      <div className="w-full bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400 fill-current" />
          <span className="text-sm font-semibold tracking-wide">DataFast</span>
          <span className="hidden sm:inline-block text-xs text-slate-400 ml-2 border-l border-slate-700 pl-3">
            Zero-ETL Analytics for Founders
          </span>
        </div>
        <Link 
          href="/register?utm_source=viral_share" 
          className="text-xs font-bold bg-white text-slate-900 px-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors flex items-center gap-1"
        >
          Connect your Stripe in 60s <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-12 sm:py-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Startup Branding */}
        <div className="flex flex-col items-center text-center mb-10">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={companyName} 
              className="w-16 h-16 rounded-2xl shadow-sm mb-4 border border-slate-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm mb-4 text-white font-bold text-2xl">
              {companyName.charAt(0)}
            </div>
          )}
          
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-4">
            <Activity className="w-3 h-3" /> Live Open Startup
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
            {sharedData.name}
          </h1>
          {sharedData.description && (
            <p className="text-slate-500 max-w-lg mx-auto text-sm sm:text-base">
              {sharedData.description}
            </p>
          )}
        </div>

        {/* The Data Payload Container */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
          
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Verified Metric
            </div>
            <div className="text-xs text-slate-400 font-medium font-mono uppercase tracking-wider">
              Updated {lastUpdated}
            </div>
          </div>

          <div className="p-6 sm:p-8 min-h-[400px]">
            {sharedData.payload ? (
               <DynamicChartFactory 
                 payload={sharedData.payload} 
                 anomalies={sharedData.insights?.anomalies} 
               />
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-slate-400">
                Data currently unavailable.
              </div>
            )}
          </div>

          {/* Highlighted Insight */}
          {sharedData.insights?.trends?.[0] && (
            <div className="bg-blue-50/50 border-t border-blue-100 p-5 flex items-start gap-4">
              <div className="bg-blue-100 p-2 rounded-xl text-blue-600 mt-0.5">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-blue-900 mb-1">Key Insight</h4>
                <p className="text-sm text-blue-700/80 leading-relaxed">
                  {sharedData.insights.trends[0].column} is trending {sharedData.insights.trends[0].direction} 
                  by <strong className="text-blue-900">{sharedData.insights.trends[0].percentage_change.toFixed(1)}%</strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-slate-500 text-sm mb-4">Want to share your own metrics transparently?</p>
          <Link href="/register">
            <button className="bg-slate-900 text-white font-semibold py-3 px-8 rounded-xl shadow-lg hover:bg-slate-800 transition-all hover:-translate-y-0.5 active:translate-y-0">
              Build your Open Startup Dashboard
            </button>
          </Link>
        </div>

      </main>
    </div>
  );
}