'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  BarChart3, 
  Database, 
  Bot, 
  MessageSquare, 
  Settings,
  LayoutDashboard
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// 1. Type Safety: Define the interface for our modular navigation items
interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

// 2. Data Structure: Centralized routing logic
const mainNavItems: NavItem[] = [
  {
    title: "Overview",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Datasets",
    url: "/datasets",
    icon: Database,
  },
  {
    title: "Agents",
    url: "/agents",
    icon: Bot,
  },
  {
    title: "Chat",
    url: "/chat",
    icon: MessageSquare,
  },
]

const systemNavItems: NavItem[] = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="flex h-[60px] items-center px-4 border-b border-sidebar-border bg-sidebar">
        <Link href="/dashboard" className="flex items-center gap-3 font-semibold text-sidebar-foreground transition-opacity hover:opacity-80">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <span className="truncate text-lg">DataOmen</span>
        </Link>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Core Workspace Routes */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                // Strict path matching: checks if we are on the exact route OR a nested route (e.g. /chat/123)
                const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.title}
                      className="transition-all duration-200"
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* System & Configuration Routes */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            System
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === item.url}
                    className="transition-all duration-200"
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: Multi-Tenant & Auth Injection Point */}
      <SidebarFooter className="border-t border-sidebar-border p-4 bg-sidebar">
        <div className="flex items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent cursor-pointer transition-colors">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
            AD
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium leading-none truncate text-sidebar-foreground">Admin User</span>
            <span className="text-xs text-muted-foreground mt-1 truncate">admin@dataomen.com</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}