"use client";

// Next.js route segment config must come after the use client directive
// when it is a purely client-rendered component that needs to bypass cache.
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { 
  Database, 
  Upload, 
  BarChart2, 
  Settings, 
  LogOut,
  RefreshCw,
  LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";

// 1. Strict Default Import (Modular Strategy)
import FileUploadZone from "@/components/ingestion/FileUploadZone";
import DashboardOrchestrator from "@/components/dashboard/DashboardOrchestrator";

// --- Types ---
type ActiveTab = "overview" | "ingest" | "analyze" | "settings";

// --- Main Page Component ---
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Supabase Client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/login");
        return;
      }
      
      setUser(session.user);
      setLoading(false);
    };

    fetchUser();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col md:flex-row bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <Database className="h-6 w-6 text-blue-600" />
            <span>DataOmen</span>
          </div>
          <p className="text-xs text-zinc-500 mt-2 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Button variant="secondary" className="w-full justify-start gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Workspace
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2 text-zinc-500">
            <Upload className="h-4 w-4" />
            Ingestion
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2 text-zinc-500">
            <BarChart2 className="h-4 w-4" />
            Analysis
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2 text-zinc-500">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </nav>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
          <form action="/auth/signout" method="post">
            <Button variant="ghost" className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-zinc-950 p-6">
         <DashboardOrchestrator />
      </main>

    </div>
  );
}