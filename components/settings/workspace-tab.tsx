"use client";

import React, { useState } from "react";
import { Building2, Mail, Globe, Info, Save, Code } from "lucide-react";

interface WorkspaceData {
  name?: string;
  supportEmail?: string;
  website?: string;
}

interface WorkspaceTabProps {
  workspace?: WorkspaceData;
}

export default function WorkspaceTab({ workspace }: WorkspaceTabProps) {
  const [name, setName] = useState(workspace?.name || "");
  const [email, setEmail] = useState(workspace?.supportEmail || "");
  const [website, setWebsite] = useState(workspace?.website || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // TODO: Implement actual Supabase RPC transaction to update workspace
    setTimeout(() => setIsSaving(false), 800);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 md:p-8 space-y-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-[#0A192F]">Global Configuration</h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage your workspace identity. Changes propagate immediately across all active recovery campaigns.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Form Area (Spans 2 columns on large screens) */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 sm:p-8 border-b border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <Building2 className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-medium text-slate-900">Workspace Identity</h3>
              </div>

              <div className="space-y-6">
                {/* Company Name */}
                <div className="space-y-2">
                  <label htmlFor="companyName" className="text-sm font-medium text-slate-700 block">
                    Company Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building2 className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      id="companyName"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                </div>

                {/* Support Email */}
                <div className="space-y-2">
                  <label htmlFor="supportEmail" className="text-sm font-medium text-slate-700 block">
                    Support / Reply-To Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      id="supportEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="e.g. support@acmecorp.com"
                    />
                  </div>
                </div>

                {/* Website URL */}
                <div className="space-y-2">
                  <label htmlFor="website" className="text-sm font-medium text-slate-700 block">
                    Website URL
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Globe className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="https://acmecorp.com"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Action Footer */}
            <div className="bg-slate-50/50 p-4 px-6 flex justify-end">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-[#0A192F] text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-70 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving Configuration..." : "Save Workspace"}
              </button>
            </div>
          </section>
        </div>

        {/* Info / Context Sidebar */}
        <div className="space-y-6">
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Code className="h-5 w-5 text-blue-600" />
              <h4 className="text-sm font-bold text-[#0A192F]">Dynamic Injection</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              These global variables are injected dynamically into your outbound recovery emails. 
            </p>
            <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{"{{ company.name }}"}</span>
                <span className="text-slate-500 truncate max-w-[120px]">{name || "Not set"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{"{{ company.url }}"}</span>
                <span className="text-slate-500 truncate max-w-[120px]">{website || "Not set"}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-5 w-5 text-slate-500" />
              <h4 className="text-sm font-bold text-[#0A192F]">Reply-To Routing</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              When recovered users reply directly to your automated campaign emails, their responses will automatically route to the <strong className="font-medium text-slate-900">Support Email</strong> configured here.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}