"use client";

import React from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-neutral-50 dark:bg-neutral-950 font-sans overflow-hidden">
        {/* Global Navigation & Ingestion Module */}
        <DashboardSidebar />
        
        {/* Main Application Canvas */}
        <main className="flex-1 flex flex-col min-w-0 h-screen">
          {/* Header Bar */}
          <header className="flex h-14 items-center gap-4 border-b border-neutral-200 bg-white px-6 dark:border-neutral-800 dark:bg-neutral-900 shrink-0 shadow-sm z-10">
            <SidebarTrigger className="-ml-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors" />
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 uppercase">
                Data Business
              </h1>
              <span className="text-neutral-300 dark:text-neutral-600">/</span>
              <span className="text-sm font-medium text-neutral-500">Workspace</span>
            </div>
          </header>
          
          {/* Interactive Route Content */}
          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 bg-neutral-50/50 dark:bg-neutral-950/50 relative">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}