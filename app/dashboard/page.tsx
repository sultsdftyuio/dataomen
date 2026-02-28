"use client";

// Next.js route segment config must come after the use client directive
// when it is a purely client-rendered component that needs to bypass cache.
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { 
  LayoutDashboard, 
  Database, 
  Sparkles, 
  Settings, 
  LogOut, 
  Bell, 
  Search,
  Menu,
  X,
  Activity,
  Zap
} from "lucide-react";

// 1. Strict Named Imports (Modular Strategy)
import { FileUploadZone } from "@/components/ingestion/FileUploadZone";
import { DashboardOrchestrator } from "@/components/dashboard/DashboardOrchestrator";

// --- Types ---
type ActiveTab = "overview" | "ingest" | "analyze" | "settings";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("ingest");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // State to hold the actively uploaded dataset for contextual RAG
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);

  // Initialize Supabase Client
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  // 2. Orchestration: Hydrate Auth State on Mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        router.push("/login");
      } else {
        setUser(session.user);
      }
    };
    checkAuth();
  }, [router, supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // --- Handlers ---
  const handleUploadSuccess = (datasetPath: string) => {
    // Orchestrate the state handoff from the Ingestion Module to the Analytical Module
    setActiveDatasetId(datasetPath);
    setActiveTab("analyze");
  };

  // --- UI Sub-Components ---
  const renderContent = () => {
    switch (activeTab) {
      case "ingest":
        return (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-2 mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Data Ingestion Engine</h2>
              <p className="text-muted-foreground">Upload your raw CSV, JSON, or Parquet files to be registered for analysis.</p>
            </div>
            
            {/* INJECTION: Pass the required props down to the module */}
            {user ? (
              <FileUploadZone 
                tenantId={user.id} 
                onUploadSuccess={handleUploadSuccess} 
              />
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Activity className="w-8 h-8 animate-spin mx-auto mb-2 text-primary/50" />
                Loading secure context...
              </div>
            )}
            
            <div className="mt-8 flex justify-center">
              <button 
                onClick={() => setActiveTab("analyze")}
                disabled={!activeDatasetId}
                className={`text-sm font-medium flex items-center transition-colors ${
                  activeDatasetId 
                    ? "text-primary hover:underline" 
                    : "text-muted-foreground opacity-50 cursor-not-allowed"
                }`}
              >
                Finished uploading? Proceed to AI Analysis <Sparkles className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        );
      case "analyze":
        return (
          <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="mb-8 border-b pb-6">
              <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
                <Sparkles className="w-6 h-6 mr-3 text-primary" />
                Generative Workspace
              </h2>
              <p className="text-muted-foreground mt-2">Ask natural language questions to generate instant, dynamic analytical dashboards.</p>
            </div>
            
            {/* Conditional execution: Only mount Orchestrator if we have data */}
            {activeDatasetId ? (
              <DashboardOrchestrator datasetId={activeDatasetId} />
            ) : (
              <div className="text-center py-16 border-2 border-dashed border-border rounded-xl bg-muted/10">
                <Database className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">No Dataset Active</h3>
                <p className="text-sm text-muted-foreground mb-6">Please ingest a dataset first to begin analysis.</p>
                <button 
                  onClick={() => setActiveTab("ingest")}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Go to Ingestion
                </button>
              </div>
            )}
          </div>
        );
      case "overview":
      case "settings":
      default:
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 animate-in fade-in duration-700">
            <div className="p-6 bg-muted/30 rounded-full">
              <Activity className="w-12 h-12 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-semibold">Coming Soon</h3>
            <p className="text-muted-foreground max-w-sm">This module is currently being optimized by our engineering team. Stick to Data Ingestion and AI Analysis for now.</p>
          </div>
        );
    }
  };

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center font-bold text-lg tracking-tight">
          <Zap className="w-5 h-5 mr-2 text-primary" /> DataOmen
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-muted rounded-md text-foreground">
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} 
        md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border shadow-xl md:shadow-none transition-transform duration-300 ease-in-out flex flex-col
      `}>
        <div className="h-16 flex items-center px-6 border-b border-border/50">
           <Zap className="w-6 h-6 mr-2 text-primary" />
           <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-500">
             DataOmen
           </span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">Analytics</p>
          
          <button 
            onClick={() => { setActiveTab("overview"); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === "overview" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <LayoutDashboard className="w-5 h-5" /> <span>Overview</span>
          </button>
          
          <button 
            onClick={() => { setActiveTab("ingest"); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === "ingest" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Database className="w-5 h-5" /> <span>Data Pipeline</span>
          </button>

          <button 
            onClick={() => { setActiveTab("analyze"); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === "analyze" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Sparkles className="w-5 h-5" /> <span>Generative UI</span>
          </button>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-8 mb-4 px-2">System</p>
          
          <button 
            onClick={() => { setActiveTab("settings"); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === "settings" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Settings className="w-5 h-5" /> <span>Settings</span>
          </button>
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border/50">
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate text-foreground">{user?.email || "Loading..."}</span>
              <span className="text-xs text-muted-foreground">Pro Plan</span>
            </div>
            <button onClick={handleSignOut} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-muted/10">
        
        {/* Top Header */}
        <header className="h-16 hidden md:flex items-center justify-between px-8 bg-background/50 backdrop-blur-md border-b border-border/50 sticky top-0 z-40">
          <div className="flex items-center flex-1 max-w-md bg-muted/50 rounded-full px-4 py-2 border border-border/50 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
            <Search className="w-4 h-4 text-muted-foreground mr-2" />
            <input 
              type="text" 
              placeholder="Search datasets, queries, or metrics..." 
              className="bg-transparent border-0 focus:ring-0 outline-none text-sm w-full text-foreground placeholder:text-muted-foreground"
            />
          </div>
          
          <div className="flex items-center space-x-4 ml-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              {activeDatasetId && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center text-white font-bold shadow-sm cursor-pointer hover:opacity-90 transition-opacity">
              {user?.email ? user.email.charAt(0).toUpperCase() : "U"}
            </div>
          </div>
        </header>

        {/* Dynamic Canvas */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 scroll-smooth">
          {renderContent()}
        </div>
      </main>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}