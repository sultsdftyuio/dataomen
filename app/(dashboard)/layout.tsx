// app/(dashboard)/layout.tsx
import React from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { OmniscientScratchpad } from "@/components/dashboard/OmniscientScratchpad"
import { Separator } from "@/components/ui/separator"
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb"
import { Database, Search } from "lucide-react"

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
      <SidebarInset className="bg-[#fafafa] flex flex-col min-h-[100dvh]">
        
        {/* Persistent Global Header */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-gray-200/80 bg-white/80 backdrop-blur-md px-6 sticky top-0 z-20 transition-all shadow-sm">
          
          {/* Left Side: Navigation & Context */}
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-2 text-slate-500 hover:text-blue-600 transition-colors" />
            <Separator orientation="vertical" className="h-5 bg-gray-200" />
            
            {/* Contextual Breadcrumbs */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard" className="flex items-center gap-2 text-slate-500 font-medium hover:text-slate-900 transition-colors">
                    <Database className="h-4 w-4" />
                    Workspace
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block text-slate-300" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-bold text-slate-900">
                    Active Session
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          
          {/* Right Side: Omniscient Trigger Hint & User Profile */}
          <div className="flex items-center gap-5">
            
            {/* Visual hint for the Cmd+K Omniscient Scratchpad */}
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-slate-50 border border-gray-200 rounded-lg text-sm text-slate-400 font-medium shadow-inner cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-colors pointer-events-none">
              <Search className="h-4 w-4" />
              <span>Global deep dive...</span>
              <kbd className="inline-flex items-center gap-1 rounded bg-white px-1.5 font-mono text-[10px] font-bold text-slate-500 border border-gray-200 shadow-sm ml-4">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>

            <Separator orientation="vertical" className="h-5 bg-gray-200 hidden lg:block" />

            {/* User Avatar Placeholder */}
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 font-extrabold text-sm border border-blue-100 cursor-pointer hover:bg-blue-600 hover:text-white transition-all shadow-sm">
              AD
            </div>
          </div>
        </header>

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