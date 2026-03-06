"use client";

import React from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
// 1. Import the SidebarProvider from your UI module
import { SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* 2. Wrap your layout in the Provider to initialize the context */
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
        <DashboardSidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-background">
          {/* We keep the dynamic children isolated here */}
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}