"use client";

import React, { useState } from "react";
import { type User } from "@supabase/supabase-js";
import { Building2, Database, UserCircle, HelpCircle, Mail } from "lucide-react";

import AccountTab from "@/components/settings/account-tab";
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
  
  const accountInitialData = (() => {
    const metadata = user.user_metadata || {};
    const metadataName = metadata.full_name || metadata.name || metadata.preferred_username;
    return {
      fullName: typeof metadataName === "string" ? metadataName.trim() : undefined,
    };
  })();

  // Updated nomenclature to match our Constitution
  const TABS = [
    { id: "workspace", label: "Company Workspace", icon: Building2 },
    { id: "data-sources", label: "Data Sources & Webhooks", icon: Database },
    { id: "account", label: "Personal Profile", icon: UserCircle },
  ] as const;

  return (
    <div className="flex flex-col md:flex-row flex-1 w-full h-full bg-white overflow-hidden animate-in fade-in duration-300">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-72 shrink-0 bg-slate-50/50 border-r border-slate-100 flex flex-col justify-between z-10 overflow-y-auto">
        <div className="p-4 space-y-1">
          <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-3 px-3 mt-2">Architecture Map</div>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-all duration-200 ${
                  isActive ? "bg-[#0A192F] text-white font-semibold shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 m-4 rounded-lg bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="h-4 w-4 text-[#0A192F]" />
            <span className="text-xs font-bold text-[#0A192F]">Need Assistance?</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed mb-3">Our engineering team is available for architectural support and custom integrations.</p>
          <a href="mailto:support@arcli.tech" className="flex items-center justify-center gap-2 w-full py-2 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors">
            <Mail className="h-3 w-3" /> support@arcli.tech
          </a>
        </div>
      </aside>

      {/* Dynamic Content Area */}
      {/* Note: Changed overflow-hidden to overflow-y-auto to support the new unified tab height */}
      <main className="flex-1 flex flex-col relative bg-gradient-to-br from-white to-slate-50/30 overflow-y-auto w-full h-full">
        
        {activeTab === "workspace" && <WorkspaceTab workspace={initialSettings.workspace} />}
        
        {/* The newly merged Unified Data Sources & Webhooks Tab */}
        {activeTab === "data-sources" && (
          <div className="w-full">
            <DataSourcesTab />
          </div>
        )}
        
        {activeTab === "account" && (
          <AccountTab user={user} initialData={accountInitialData} isRecoveryMode={isRecoveryMode} />
        )}

      </main>
    </div>
  );
}