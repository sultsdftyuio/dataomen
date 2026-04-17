// app/(dashboard)/layout.tsx
import React from "react"
import Link from "next/link"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { OmniscientScratchpad } from "@/components/dashboard/OmniscientScratchpad"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/utils/supabase/server"
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb"
import { Database, Sparkles } from "lucide-react"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const accountEmail = user?.email || "unknown@account"
  const metadata = (user?.user_metadata || {}) as Record<string, any>
  const metadataName = metadata.full_name || metadata.name || metadata.preferred_username
  const accountName =
    typeof metadataName === "string" && metadataName.trim().length > 0
      ? metadataName.trim()
      : accountEmail.includes("@")
        ? accountEmail.split("@")[0]
        : "User"
  const accountInitials =
    accountName
      .split(" ")
      .filter(Boolean)
      .map((segment) => segment[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"

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

            {/* Signed-in account badge */}
            <Link
              href="/settings"
              className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              aria-label="Open account settings"
              title="Open account settings"
            >
              <div className="h-8 w-8 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-xs border border-slate-800/80">
                {accountInitials}
              </div>
              <div className="max-w-[190px] leading-tight">
                <p className="truncate text-[12px] font-semibold text-slate-900">{accountName}</p>
                <p className="truncate text-[11px] text-slate-500">{accountEmail}</p>
              </div>
            </Link>

            <Link
              href="/settings"
              className="h-9 w-9 sm:hidden rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-sm border border-slate-800/80 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              aria-label="Open account settings"
              title={`${accountName} • ${accountEmail}`}
            >
              {accountInitials}
            </Link>
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