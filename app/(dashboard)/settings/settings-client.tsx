"use client";

import React, { useState, useEffect } from "react";
import { type User } from "@supabase/supabase-js";
import { 
  Building2, 
  Database, 
  UserCircle, 
  HelpCircle, 
  Mail, 
  ChevronRight,
  type LucideIcon
} from "lucide-react";

import WorkspaceTab from "@/components/settings/workspace_page/workspace-tab";
import { DataSourcesTab } from "@/components/settings/data-sources-tab";
import type { SettingsSnapshot } from "@/lib/settings/types";

// ── Strict Architectural Boundaries & Constants ──
type SettingsTab = "workspace" | "data-sources" | "account";

const SUPPORT_EMAIL = "support@arcli.tech";

const TABS: ReadonlyArray<{
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "workspace", label: "Company Workspace", icon: Building2 },
  { id: "data-sources", label: "Data Sources & API", icon: Database },
  { id: "account", label: "Personal Profile", icon: UserCircle },
];

export interface WorkspaceData {
  fullName: string;
  authEmail: string;
  companyName: string;
  supportEmail: string;
  websiteUrl: string;
}

interface SettingsClientProps {
  user: User;
  initialSettings: SettingsSnapshot;
  isRecoveryMode: boolean;
}

export default function SettingsClient({ 
  user, 
  initialSettings, 
  isRecoveryMode 
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    isRecoveryMode ? "account" : "workspace"
  );

  // Sync active tab safely if recovery mode changes dynamically
  useEffect(() => {
    if (isRecoveryMode) {
      setActiveTab("account");
    }
  }, [isRecoveryMode]);

  // Properly map Server-normalized settings & Auth user to the expected UI contract
  const workspaceData: WorkspaceData = {
    fullName: user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "",
    authEmail: user?.email ?? "",
    companyName: initialSettings.workspace?.companyName ?? "",
    supportEmail: initialSettings.workspace?.replyToEmail ?? "",
    websiteUrl: "", // Default to empty string until website URL persistence is added to schema
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-slate-50/50 animate-in fade-in duration-300">
      
      {/* ── Sleek, Pinned Sidebar Navigation ── */}
      <aside className="w-full md:w-60 shrink-0 bg-white border-r border-slate-200/80 flex flex-col justify-between md:sticky md:top-0 md:h-screen overflow-y-auto z-10 select-none">
        <div className="p-3 pt-4 space-y-1">
          <div className="flex flex-col gap-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  aria-pressed={isActive}
                  className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                    isActive 
                      ? "bg-blue-50/80 text-blue-700 font-semibold shadow-2xs border border-blue-100/60" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon className={`h-3.5 w-3.5 shrink-0 transition-colors ${isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                    <span className="truncate">{tab.label}</span>
                  </div>
                  {isActive && (
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-70 animate-in fade-in" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-auto">
          {/* Compact Support Section */}
          <div className="p-3 m-3 rounded-lg bg-slate-50/80 border border-slate-200/70 shadow-2xs">
            <div className="flex items-center gap-1.5 mb-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-slate-600" />
              <span className="text-[11px] font-semibold text-slate-800">Need Assistance?</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug mb-2.5">
              Engineering support for architectural & custom integrations.
            </p>
            <a 
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2 bg-white border border-slate-200/80 rounded text-[11px] font-medium text-slate-700 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50/50 transition-all shadow-2xs"
            >
              <Mail className="h-3 w-3" /> {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </aside>

      {/* ── Dynamic Content Area ── */}
      <main className="flex-1 flex flex-col min-h-screen bg-slate-50/30 overflow-y-auto w-full p-6 md:p-8 lg:p-10">
        <div className="w-full max-w-5xl mx-auto h-full flex flex-col">
          
          {activeTab === "workspace" && (
            <WorkspaceTab initialData={workspaceData} />
          )}
          
          {activeTab === "data-sources" && (
            <DataSourcesTab />
          )}

        </div>
      </main>

    </div>
  );
}