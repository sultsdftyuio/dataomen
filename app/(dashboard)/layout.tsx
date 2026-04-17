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
import { Database, Sparkles } from "lucide-react"

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
        
        {/* Persistent Global Header */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/92 px-6 backdrop-blur-md transition-all">
          
          {/* Left Side: Navigation & Context */}
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-2 text-slate-500 hover:text-slate-900 transition-colors" />
            <Separator orientation="vertical" className="h-5 bg-slate-200" />
            
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
          
          {/* Right Side: Product Status + User Profile */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              Engine online
            </div>

            {/* User Avatar Placeholder */}
            <div className="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-sm border border-slate-800/80 cursor-pointer hover:bg-slate-800 transition-all shadow-sm">
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