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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

// 1. Centralized Navigation Config (The Modular Strategy)
// Any future links should just be added to this array.
const navItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Datasets", url: "/datasets", icon: Database },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Chat", url: "/chat", icon: MessageSquare }, // <-- Chat hub link
  { title: "Activity", url: "/activity", icon: Activity },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-6 py-4">
        {/* Branding / Tenant Display */}
        <div className="flex items-center gap-2 font-bold tracking-tight text-lg">
          <Database className="h-5 w-5 text-primary" />
          <span>Dataomen</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                // Determine if active: either exact match or starts with base path (e.g. /chat/agent-id)
                const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.title}
                      className={cn(
                        "transition-colors",
                        isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}