"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Database, 
  Bot, 
  MessageSquare, 
  Settings, 
  LayoutDashboard,
  Activity
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter
} from "@/components/ui/sidebar";

const coreNavigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Data Pipeline", href: "/dashboard/pipeline", icon: Database },
  { name: "Anomaly Detection", href: "/dashboard/anomalies", icon: Activity },
];

const agentNavigation = [
  { name: "Custom Agents", href: "/agents", icon: Bot },
  { name: "Agent Chat", href: "/chat", icon: MessageSquare },
];

const systemNavigation = [
  { name: "Settings", href: "/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  const renderNavItems = (items: typeof coreNavigation) => (
    <SidebarMenu>
      {items.map((item) => {
        // Strict path matching to prevent layout layout thrashing on nested routes
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        
        return (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild isActive={isActive}>
              <Link href={item.href} className="flex items-center gap-3">
                <item.icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="h-14 flex items-center px-4 border-b">
        <span className="font-bold text-lg tracking-tight text-primary">Data Omen</span>
      </SidebarHeader>
      
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupLabel>Analytics Engine</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(coreNavigation)}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>AI Orchestration</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(agentNavigation)}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            {renderNavItems(systemNavigation)}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}