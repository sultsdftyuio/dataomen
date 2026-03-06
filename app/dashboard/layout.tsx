"use client";

import React from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Modular Architecture: The sidebar handles pure navigation and tenant identity state, 
        completely decoupled from the main computational views.
      */}
      <DashboardSidebar />
      
      {/* Main Execution Canvas */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-muted/10 relative">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto h-full">
             {children}
          </div>
        </div>
      </main>
    </div>
  );
}