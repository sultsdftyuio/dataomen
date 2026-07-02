"use client";

import React, { useState } from "react";
import { type User } from "@supabase/supabase-js";
import { Building2, Database, UserCircle, HelpCircle, Mail, ChevronRight } from "lucide-react";

// FIX 1: Import AccountPlanTab as a named export
import { AccountPlanTab } from "@/components/settings/account-tab";
import WorkspaceTab from "@/components/settings/workspace-tab";
import { DataSourcesTab } from "@/components/settings/data-sources-tab";
import type { SettingsSnapshot } from "@/lib/settings/types";

// Enforcing the strict 3-pillar architectural boundary
type SettingsTab = "workspace" | "data-sources" | "account";

interface SettingsClientProps {
  user: User;
  initialSettings: SettingsSnapshot;
  isRecoveryMode: boolean;
}

export default function SettingsClient({ user, initialSettings, isRecoveryMode }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(isRecoveryMode ? "account" : "workspace");

  // Updated nomenclature to match our architectural standard
  const TABS = [
    { id: "workspace", label: "Company Workspace", icon: Building2 },
    { id: "data-sources", label: "Data Sources & API", icon: Database },
    { id: "account", label: "Personal Profile", icon: UserCircle },
  ] as const;

  // Safely map initialSettings to avoid the SettingsWorkspace vs WorkspaceData TS Error
  // We typecast as any locally to handle variations in the DB schema vs frontend types
  const workspaceData = {
    name: (initialSettings.workspace as any)?.name || (initialSettings.workspace as any)?.company_name || "",
    supportEmail: (initialSettings.workspace as any)?.supportEmail || (initialSettings.workspace as any)?.support_email || "",
    website: (initialSettings.workspace as any)?.website || (initialSettings.workspace as any)?.website_url || "",
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 w-full h-full bg-slate-50/50 overflow-hidden animate-in fade-in duration-300">
      
      {/* Sleek, Compact Sidebar Navigation */}
      <aside className="w-full md:w-60 shrink-0 bg-white border-r border-slate-200/80 flex flex-col justify-between z-10 overflow-y-auto select-none">
        <div className="p-3 space-y-0.5">
          <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5 px-2 mt-1">
            Architecture Map
          </div>
          
          <div className="flex flex-col gap-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`group w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
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
              href="mailto:support@arcli.tech" 
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2 bg-white border border-slate-200/80 rounded text-[11px] font-medium text-slate-700 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50/50 transition-all shadow-2xs"
            >
              <Mail className="h-3 w-3" /> support@arcli.tech
            </a>
          </div>
        </div>
      </aside>

      {/* Dynamic Content Area */}
      <main className="flex-1 flex flex-col relative bg-slate-50/30 overflow-y-auto w-full h-full p-6 md:p-8 lg:p-10">
        <div className="w-full max-w-5xl mx-auto">
          
          {/* FIX 2: Pass flattened props matching WorkspaceSettingsProps interface */}
          {activeTab === "workspace" && (
            <WorkspaceTab 
              initialCompanyName={workspaceData.name}
              initialSupportEmail={workspaceData.supportEmail}
              initialWebsite={workspaceData.website}
            />
          )}
          
          {activeTab === "data-sources" && (
            <DataSourcesTab />
          )}
          
          {/* FIX 3: Use the correctly named component without unsupported children */}
          {activeTab === "account" && (
            <AccountPlanTab />
          )}

        </div>
      </main>

    </div>
  );
}