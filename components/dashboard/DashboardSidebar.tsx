"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Bot, 
  Settings, 
  CloudUpload,
  ActivitySquare,
  LogOut
} from "lucide-react";
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
  SidebarFooter
} from "@/components/ui/sidebar";
import FileUploadZone from "@/components/ingestion/FileUploadZone";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Sidebar variant="inset" className="border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      
      {/* Branding Header */}
      <SidebarHeader className="p-5 border-b border-neutral-100 dark:border-neutral-800/50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-sm">
            <ActivitySquare size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[15px] tracking-tight leading-none">Data Business</span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider mt-1">Analytical SaaS</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-3 space-y-6 overflow-y-auto custom-scrollbar">
        
        {/* Core Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2 px-2">
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard"} tooltip="Analytical Engine">
                  <Link href="/dashboard" className="flex items-center gap-3 py-2 transition-all">
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="font-medium text-sm">Analytical Engine</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/agents"} tooltip="AI Agents">
                  <Link href="/agents" className="flex items-center gap-3 py-2 transition-all">
                    <Bot className="w-4 h-4" />
                    <span className="font-medium text-sm">AI Agents</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Data Ingestion Module */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3 px-2 flex items-center gap-2">
            <CloudUpload size={14} className="text-neutral-500" /> Data Ingestion
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            {/* The Modular Strategy: Black-box ingestion utility injected seamlessly */}
            <FileUploadZone />
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      {/* Settings & Auth */}
      <SidebarFooter className="p-3 border-t border-neutral-100 dark:border-neutral-800/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/settings" className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-neutral-500" />
                <span className="font-medium text-sm">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
              <LogOut className="w-4 h-4" />
              <span className="font-medium text-sm">Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

    </Sidebar>
  );
}