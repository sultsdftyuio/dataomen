"use client";

import React from "react";
// FIX 1: Destructure DashboardSidebar as a named import
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
// FIX 2: Import the SidebarProvider
import { SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* FIX 2: Wrap your layout in the Provider to initialize the context */
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-white text-slate-900">
        {/* Modular Architecture: The sidebar handles pure navigation and route state isolated from heavy compute tasks. */}
        <DashboardSidebar />
        
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white">
          {/* We keep the dynamic children isolated here */}
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}