"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  MessageSquare, 
  Database, 
  Settings, 
  CreditCard, 
  Bot,
  Search
} from "lucide-react"

// Universal Brand Logo Integration
import { Logo } from "@/components/ui/logo" 

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

// Adjust these to match your exact routing
const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Datasets", href: "/datasets", icon: Database },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Investigate", href: "/investigate", icon: Search },
]

const footerItems = [
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const { state } = useSidebar()

  return (
    <Sidebar collapsible="icon" className="border-r bg-background">
      
      {/* Strict Header Height:
        Added fixed heights (h-16) and flex-shrink-0 to prevent 
        the top area from shifting layout during state changes.
      */}
      <SidebarHeader className="flex-shrink-0 h-16 flex justify-center border-b border-border/50">
        <div className="flex items-center justify-between px-2 w-full">
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <div className="flex-shrink-0">
              {/* Brand Logo perfectly matching the Landing Page */}
              <Logo className="h-8 w-8" /> 
            </div>
            {state === "expanded" && (
              <span className="font-bold text-lg tracking-tight whitespace-nowrap">
                Arcli.tech
              </span>
            )}
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden pt-4 custom-scrollbar">
        <SidebarGroup>
          <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : "px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"}>
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname?.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.name}
                      className="transition-colors"
                    >
                      <Link href={item.href} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {state === "expanded" && <span>{item.name}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-2 flex-shrink-0">
        <SidebarMenu>
          {footerItems.map((item) => {
            const isActive = pathname?.startsWith(item.href)
            return (
               <SidebarMenuItem key={item.name}>
                 <SidebarMenuButton 
                   asChild 
                   isActive={isActive}
                   tooltip={item.name}
                   className="transition-colors"
                 >
                   <Link href={item.href} className="flex items-center gap-3">
                     <item.icon className="h-4 w-4 shrink-0" />
                     {state === "expanded" && <span>{item.name}</span>}
                   </Link>
                 </SidebarMenuButton>
               </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}