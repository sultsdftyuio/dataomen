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
  Bot
} from "lucide-react"

// Universal Brand Logo Integration
import { Logo } from "@/components/ui/logo" 
import { cn } from "@/lib/utils"

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

// Core Platform Navigation
const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Datasets", href: "/datasets", icon: Database },
  { name: "Agents", href: "/agents", icon: Bot },
]

const footerItems = [
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const { state } = useSidebar()

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-200/80 bg-white">
      
      {/* Strict Header Height to prevent layout shifts */}
      <SidebarHeader className="h-16 flex-shrink-0 border-b border-slate-200/70 bg-white/95 px-2">
        <Link
          href="/dashboard"
          className={cn(
            "group flex h-full w-full items-center overflow-hidden rounded-xl px-2.5 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:translate-x-[1px] hover:bg-slate-100/80 motion-reduce:transform-none",
            state === "collapsed" ? "justify-center" : "gap-2.5",
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-px group-hover:bg-slate-200/70 motion-reduce:transform-none">
            <Logo iconOnly className="!gap-0 [&_svg]:h-7 [&_svg]:w-7" />
          </span>
          <span
            className={cn(
              "origin-left truncate text-[15px] font-semibold tracking-tight text-slate-900 transition-[width,opacity,transform] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none",
              state === "expanded" ? "w-auto translate-x-0 opacity-100" : "w-0 -translate-x-1 opacity-0",
            )}
          >
            Arcli
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar flex flex-1 flex-col overflow-x-hidden overflow-y-auto pt-4">
        
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className={state === "collapsed" ? "sr-only" : "mb-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"}>
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.name}
                      className="transition-all duration-300"
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center overflow-hidden transition-[gap,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none",
                          state === "collapsed" ? "justify-center gap-0" : "gap-3",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span
                          className={cn(
                            "truncate transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none",
                            state === "expanded"
                              ? "w-auto translate-x-0 opacity-100"
                              : "w-0 -translate-x-1 opacity-0",
                          )}
                        >
                          {item.name}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter className="flex-shrink-0 border-t border-slate-200/70 bg-white/95 p-2">
        <SidebarMenu>
          {footerItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            return (
               <SidebarMenuItem key={item.name}>
                 <SidebarMenuButton 
                   asChild 
                   isActive={isActive}
                   tooltip={item.name}
                   className="transition-all duration-300"
                 >
                   <Link
                     href={item.href}
                     className={cn(
                       "flex items-center overflow-hidden transition-[gap,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none",
                       state === "collapsed" ? "justify-center gap-0" : "gap-3",
                     )}
                   >
                     <item.icon className="h-4 w-4 shrink-0" />
                     <span
                       className={cn(
                         "truncate transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none",
                         state === "expanded"
                           ? "w-auto translate-x-0 opacity-100"
                           : "w-0 -translate-x-1 opacity-0",
                       )}
                     >
                       {item.name}
                     </span>
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