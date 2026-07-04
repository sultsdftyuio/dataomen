// app/(dashboard)/layout.tsx
import React from "react";
import Link from "next/link";
import { 
  LayoutDashboard, 
  Settings, 
  ShieldAlert, 
  Send
} from "lucide-react";
import Logo from "@/components/ui/logo";
import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-900">
      
      {/* ── Top Navigation Bar (SaaS Standard) ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="w-full px-6 h-16 flex items-center justify-between">
          
          {/* Brand & Main Nav */}
          <div className="flex items-center gap-10">
            <Link href="/dashboard" className="flex items-center transition-opacity hover:opacity-90">
              <Logo className="h-8" iconOnly={false} />
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link 
                href="/dashboard" 
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-all"
              >
                <LayoutDashboard className="h-4 w-4 text-slate-400" />
                Overview
              </Link>
              <Link 
                href="/dashboard/queue" 
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-all"
              >
                <ShieldAlert className="h-4 w-4 text-rose-500" />
                Risk Queue
              </Link>
              <Link 
                href="/dashboard/campaigns" 
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-all"
              >
                <Send className="h-4 w-4 text-blue-500" />
                Campaigns
              </Link>
            </nav>
          </div>

          {/* User & Settings Actions */}
          <div className="flex items-center gap-3">
            <Link 
              href="/settings" 
              className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-full hover:bg-slate-100"
              title="System Preferences"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Expanded Data-Density Focus Area ── */}
      <WorkspaceHeader />

      <main className="flex-1 w-full flex flex-col mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
        {children}
      </main>
      
    </div>
  );
}