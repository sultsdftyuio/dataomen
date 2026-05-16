// app/(dashboard)/layout.tsx
import React from "react";
import Link from "next/link";
import { 
  Activity, 
  LayoutDashboard, 
  Settings, 
  ShieldAlert, 
  Send
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* ── Top Navigation Bar (SaaS Standard) ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand & Main Nav */}
          <div className="flex items-center gap-10">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="bg-blue-600 p-1.5 rounded-md group-hover:bg-blue-700 transition-colors">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 tracking-tight text-lg">Arcli</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link 
                href="/dashboard" 
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Overview
              </Link>
              <Link 
                href="/dashboard/queue" 
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Risk Queue
              </Link>
              <Link 
                href="/dashboard/campaigns" 
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <Send className="h-4 w-4" />
                Campaigns
              </Link>
            </nav>
          </div>

          {/* User & Settings Actions */}
          <div className="flex items-center gap-4">
            <Link 
              href="/settings" 
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-100"
            >
              <Settings className="h-5 w-5" />
            </Link>
            
            {/* Placeholder Profile Avatar */}
            <div className="h-8 w-8 rounded-full bg-[#0A192F] text-white flex items-center justify-center text-xs font-semibold ring-2 ring-blue-50 shadow-sm cursor-pointer hover:bg-blue-900 transition-colors">
              U
            </div>
          </div>
        </div>
      </header>

      {/* ── Expanded Data-Density Focus Area ── */}
      <main className="flex-1 w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-500">
        {children}
      </main>
      
    </div>
  );
}