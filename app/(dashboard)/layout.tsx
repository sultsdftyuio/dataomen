// app/(dashboard)/layout.tsx

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background relative">
        {/* The Sidebar is mounted once here at the Route Group level. 
          It will persist seamlessly as the user navigates between 
          /dashboard, /datasets, /agents, and /chat.
        */}
        <DashboardSidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Global Header for the authenticated application */}
          <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b border-border bg-card/50 backdrop-blur-sm px-6 sticky top-0 z-10">
            <SidebarTrigger className="hover:bg-accent hover:text-accent-foreground transition-colors" />
            <div className="flex-1" />
            {/* Future modular injection point: UserNav, Workspace Switcher, or Global Search */}
          </header>

          {/* Page Content Injection */}
          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 animate-in fade-in duration-300">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}