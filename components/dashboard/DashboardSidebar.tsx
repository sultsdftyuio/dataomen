'use client'

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Database, 
  Bot, 
  MessageSquare, 
  Settings,
  LayoutDashboard,
  Folder
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
  useSidebar,
} from "@/components/ui/sidebar"

// 1. Type Safety: Define the interface for our modular navigation items
interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

// 2. Data Structure: Centralized routing logic
const mainNavItems: NavItem[] = [
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "My Files", url: "/files", icon: Folder },
  { title: "Integrations", url: "/datasets", icon: Database },
  { title: "Agents", url: "/agents", icon: Bot },
]

const systemNavItems: NavItem[] = [
  { title: "Settings", url: "/settings", icon: Settings },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  // 3. Logic: Use the sidebar context to control expansion on hover
  const { setOpen } = useSidebar()

  return (
    <Sidebar 
      variant="inset" 
      collapsible="icon"
      // 4. Hover Expansion Logic:
      // When the mouse enters the sidebar area, we expand it to show names.
      // When it leaves, we collapse it back to icons.
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <SidebarHeader className="flex h-[60px] items-center px-4 border-b border-sidebar-border bg-sidebar">
        <Link href="/chat" className="flex items-center gap-3 font-semibold text-sidebar-foreground transition-opacity hover:opacity-80">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
            <img src="/icon.svg" alt="Arcli Logo" className="h-full w-full object-contain" />
          </div>
          {/* group-data-[collapsible=icon]:hidden ensures text is only visible when expanded */}
          <span className="truncate text-lg group-data-[collapsible=icon]:hidden font-bold tracking-tight">
            Arcli
          </span>
        </Link>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Core Workspace Routes */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 group-data-[collapsible=icon]:hidden">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.title} // Shows name as tooltip when fully collapsed
                      className="transition-all duration-200"
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
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
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 group-data-[collapsible=icon]:hidden">
            System
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === item.url}
                    tooltip={item.title}
                    className="transition-all duration-200"
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: Workspace Profile Area */}
      <SidebarFooter className="border-t border-sidebar-border p-3 bg-sidebar">
        <div className="flex items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent cursor-pointer transition-colors">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
            WS
          </div>
          <div className="flex flex-col flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-none truncate text-sidebar-foreground">Workspace User</span>
            <span className="text-[10px] text-muted-foreground mt-1.5 truncate">user@workspace.com</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}