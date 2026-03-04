"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardOrchestrator } from '@/components/dashboard/DashboardOrchestrator';
import { supabase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Activity, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  // We initialize as true to prevent a flash of unauthenticated content
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    const enforceTenantAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          console.warn("[Auth Warning] No active tenant session found. Redirecting...");
          if (mounted) router.replace('/login');
          return;
        }
        
        // Security by Design: Auth successful, release the loading lock
        if (mounted) setIsAuthenticating(false);
      } catch (err) {
        console.error("[Auth Error] Failed to verify tenant session:", err);
        if (mounted) router.replace('/login');
      }
    };

    enforceTenantAuth();

    // Modular Strategy: Reactive listener for session expiration/logout across tabs
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && mounted) {
        router.replace('/login');
      }
    });

    // Cleanup function to prevent memory leaks if the component unmounts mid-flight
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // Determine what to show while auth is resolving
  if (isAuthenticating) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500 font-medium">Verifying tenant credentials...</p>
        </div>
      </div>
    );
  }

  // Auth has passed; render the application shell
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          </div>
          <Button 
            variant="outline" 
            onClick={async () => {
              // Functional execution: clean sign out
              await supabase.auth.signOut();
              router.replace('/login');
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </header>

        {/* Hybrid Performance Paradigm: Wrap heavy client execution in a suspense boundary */}
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col items-center gap-2">
               <Activity className="h-8 w-8 animate-pulse text-gray-400" />
               <span className="text-sm text-gray-500">Initializing orchestrator...</span>
            </div>
          </div>
        }>
          <DashboardOrchestrator />
        </Suspense>
      </div>
    </div>
  );
}