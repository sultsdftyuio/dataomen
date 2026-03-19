// app/(dashboard)/layout.tsx

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { Separator } from "@/components/ui/separator"
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb"
import { Database } from "lucide-react"

export default function DashboardRouteGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      {/* The DashboardSidebar mounts exactly ONCE here. 
        It will not re-render or flash as users navigate between /dashboard, /datasets, etc.
      */}
      <DashboardSidebar />
      
      {/* SidebarInset ensures the main content area adjusts perfectly to the sidebar's width & state */}
      <SidebarInset className="bg-background flex flex-col min-h-screen">
        
        {/* Persistent Global Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card/50 backdrop-blur-md px-4 sticky top-0 z-20 transition-all">
          <div className="flex items-center gap-2 px-2">
            <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            
            {/* Contextual Breadcrumbs for better User-Friendliness */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard" className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5" />
                    Workspace
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-medium text-foreground">
                    Active Session
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          
          <div className="flex-1" />
          
          {/* Right side of header - Ready for User Avatar, Notifications, or Command Palette */}
          <div className="flex items-center gap-4">
             <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors">
              AD
            </div>
          </div>
        </header>

        {/* Page Content Injection Area - Optimized for scrolling and layout shifts */}
        <main className="flex-1 flex flex-col h-[calc(100vh-64px)] animate-in fade-in duration-500 overflow-hidden">
          {children}
        </main>
        
      </SidebarInset>
    </SidebarProvider>
  )
}