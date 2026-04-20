// app/(dashboard)/layout.tsx
import React from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { OmniscientScratchpad } from "@/components/dashboard/OmniscientScratchpad"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      {/* The DashboardSidebar mounts exactly ONCE here. 
        It will not re-render or flash as users navigate between routes.
      */}
      <DashboardSidebar />
      
      {/* SidebarInset ensures the main content area adjusts perfectly to the sidebar's state */}
      <SidebarInset className="bg-white flex flex-col min-h-[100dvh]">

        {/* Page Content Injection Area */}
        <main className="flex-1 flex flex-col relative animate-in fade-in duration-500 overflow-hidden">
          {children}
        </main>
        
      </SidebarInset>

      {/* Global Cmd+K Canvas mounted strictly ONCE at the top layout level */}
      <OmniscientScratchpad />
      
    </SidebarProvider>
  )
}