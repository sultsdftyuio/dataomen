// components/dashboard/DashboardOrchestrator.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Changed to Named Imports based on your module architecture
import { DataPreview } from "./DataPreview";
import { DynamicChartFactory } from "./DynamicChartFactory";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function DashboardOrchestrator() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const enforceAuth = async () => {
      try {
        // Instant, local-first session check (avoids network waterfall if cached)
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          console.warn("[Auth Warning] No active tenant session found. Redirecting...");
          window.location.replace('/login');
          return;
        }

        if (isMounted) {
          // Security by Design: Explicit tenant isolation map
          // Fallback to user.id if a dedicated tenant_id isn't in metadata yet
          const activeTenantId = session.user.user_metadata?.tenant_id || session.user.id;
          setTenantId(activeTenantId);
        }
      } catch (err) {
        console.error("[Auth] Session validation failed:", err);
        window.location.replace('/login');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    // Execute immediately - eliminated artificial delays
    enforceAuth();

    // Listen for session expiry or logouts triggered in other browser tabs
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.replace('/login');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!tenantId) return null;

  // The Modular Strategy: Pass tenantId down as a strict prop constraint to child data-fetching components
  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-7xl mx-auto w-full">
      <header className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytical Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Tenant ID: {tenantId}</p>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DynamicChartFactory tenantId={tenantId} />
        </div>
        <div className="space-y-6">
          <DataPreview tenantId={tenantId} />
        </div>
      </main>
    </div>
  );
}