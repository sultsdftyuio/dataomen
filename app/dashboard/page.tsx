"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardOrchestrator } from '@/components/dashboard/DashboardOrchestrator';
import { supabase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Activity, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  // Security by Design: Verify tenant access at the edge of the interaction layer
  useEffect(() => {
    let isMounted = true;
    
    const verifySession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        if (isMounted) router.replace('/login');
      } else {
        if (isMounted) setIsAuthenticating(false);
      }
    };

    verifySession();
    
    // Attach listener for real-time token invalidation
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/login');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (isAuthenticating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  // 100% Functional, Declarative UI
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-blue-600 p-2 text-white">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Data Omen Analytics</h1>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleSignOut} 
          className="flex items-center gap-2 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                <h2 className="text-2xl font-bold tracking-tight">Compute Telemetry</h2>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Real-time anomaly detection and metric forecasting via vectorized rollups.
              </p>
            </div>
          </header>

          <Suspense fallback={
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-800">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          }>
            <DashboardOrchestrator />
          </Suspense>
        </div>
      </main>
    </div>
  );
}