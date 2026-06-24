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
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between z-10 overflow-y-auto">
        <div className="p-4 space-y-1">
          <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-3 px-3 mt-2">
            Architecture Map
          </div>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? "bg-blue-50 text-blue-700 font-semibold shadow-sm border border-blue-100/50" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-auto">
          {/* Support Section */}
          <div className="p-4 m-4 rounded-xl bg-slate-50 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="h-4 w-4 text-slate-700" />
              <span className="text-xs font-bold text-slate-900">Need Assistance?</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
              Our engineering team is available for architectural support and custom integrations.
            </p>
            <a 
              href="mailto:support@arcli.tech" 
              className="flex items-center justify-center gap-2 w-full py-2 px-2 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
            >
              <Mail className="h-3 w-3" /> support@arcli.tech
            </a>
          </div>
        </div>
      </aside>

      {/* Dynamic Content Area */}
      <main className="flex-1 flex flex-col relative bg-slate-50/30 overflow-y-auto w-full h-full p-6 md:p-8 lg:p-10">
        <div className="w-full max-w-5xl mx-auto">
          
          {activeTab === "workspace" && (
            <WorkspaceTab workspace={workspaceData} />
          )}
          
          {activeTab === "data-sources" && (
            <DataSourcesTab />
          )}
          
          {activeTab === "account" && (
            <AccountTab>
               <div className="text-sm text-slate-500 py-8 text-center bg-white border border-slate-200 rounded-xl shadow-sm">
                 Personal Profile Configuration
               </div>
            </AccountTab>
          )}

        </div>
      </main>

    </div>
  );
}