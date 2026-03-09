// app/dashboard/page.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardOrchestrator } from '@/components/dashboard/DashboardOrchestrator';
import { createClient } from '@/utils/supabase/client';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function DashboardPage() {
  // Replace boolean with the strict cryptographic parameters required by the Orchestrator
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let isMounted = true;

    const checkSecurityBoundary = async () => {
      // Enforce Security By Design: Validate session before spawning the analytical engine
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        router.push('/login');
      } else if (isMounted) {
        // Extract the raw JWT and the immutable User UUID
        setSessionToken(session.access_token);
        setTenantId(session.user.id);
      }
    };

    checkSecurityBoundary();

    // Cleanup to prevent state updates on unmounted component
    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  // Loading State Canvas
  if (!sessionToken || !tenantId) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center animate-in fade-in duration-500">
        <div className="flex flex-col items-center gap-4 text-neutral-500">
          <div className="relative flex items-center justify-center h-12 w-12 bg-white dark:bg-neutral-900 rounded-full shadow-sm border border-neutral-100 dark:border-neutral-800">
            <Loader2 className="animate-spin h-6 w-6 text-blue-600" />
            <ShieldCheck className="absolute h-3 w-3 text-emerald-500 bottom-1 right-1 bg-white dark:bg-neutral-900 rounded-full" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Securing Context</p>
            <p className="text-xs">Authenticating isolated tenant partition...</p>
          </div>
        </div>
      </div>
    );
  }

  // Active Dashboard Engine
  return (
    <div className="flex flex-col gap-6 max-w-[1600px] mx-auto w-full h-full animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* Page Header */}
      <div className="flex flex-col space-y-2 pb-2 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          Interactive Analytical Engine
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm max-w-3xl leading-relaxed">
          Use the Natural Language interface below to query your vectorized datasets. Operations are processed via DuckDB for in-process, sub-second latency analytics.
        </p>
      </div>
      
      {/* Inject Orchestrator with Strict Multi-Tenant Routing Props */}
      <div className="flex-1 min-h-0">
        <DashboardOrchestrator 
          token={sessionToken} 
          tenantId={tenantId} 
        />
      </div>
      
    </div>
  );
}