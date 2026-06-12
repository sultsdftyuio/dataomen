"use client";

import React, { useMemo, useState } from "react";
import { RefreshCw, Building2, Globe, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import type { SettingsWorkspace } from "@/lib/settings/types";
import type { WorkspaceSettingsInput } from "@/lib/settings/schemas";

interface WorkspaceTabProps {
  workspace: SettingsWorkspace;
}

export default function WorkspaceTab({ workspace }: WorkspaceTabProps) {
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);

  const [companyName, setCompanyName] = useState(workspace.companyName);
  const [replyToEmail, setReplyToEmail] = useState(workspace.replyToEmail);
  const [initialWorkspace] = useState(workspace);
  
  const hasWorkspaceChanges = useMemo(
    () =>
      companyName !== initialWorkspace.companyName ||
      replyToEmail !== initialWorkspace.replyToEmail,
    [companyName, replyToEmail, initialWorkspace]
  );

  const handleSaveWorkspace = async () => {
    if (!hasWorkspaceChanges) return;
    setIsSavingWorkspace(true);
    try {
      const payload: WorkspaceSettingsInput = { companyName, replyToEmail };
      const res = await fetch("/api/settings/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sync workspace configuration");
      }
      toast({ title: "Workspace Synced", description: "Global recovery variables updated." });
    } catch (error: any) {
      toast({ title: "Sync Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 bg-white">
      
      {/* ── Section Header ── */}
      <div className="px-8 lg:px-12 py-8 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-blue-600 font-bold text-xs tracking-widest uppercase mb-3">
          <Globe className="h-4 w-4" /> Global Configuration
        </div>
        <h2 className="text-2xl font-semibold text-[#0A192F] tracking-tight">Workspace Identity</h2>
        <p className="text-sm text-slate-500 mt-1">Global variables used across your outbound recovery campaigns.</p>
      </div>

      <div className="p-8 lg:px-12 flex-1 overflow-y-auto">
        
        {/* ── Configuration Card ── */}
        <section className="border border-slate-200 rounded-xl bg-white shadow-sm max-w-2xl overflow-hidden flex flex-col">
          
          <div className="p-8 space-y-8">
            {/* Field 1: Company Name */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label htmlFor="companyName" className="text-xs font-bold tracking-wide text-slate-500 flex items-center gap-2 uppercase">
                  <Building2 className="h-4 w-4 text-slate-400" /> Product / Company Name
                </Label>
                {companyName !== initialWorkspace.companyName && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider shadow-sm">
                    Unsaved Edits
                  </span>
                )}
              </div>
              <Input
                id="companyName"
                placeholder="e.g. Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 text-base shadow-sm transition-colors"
              />
              <p className="text-xs text-slate-500 font-medium">
                Injected dynamically into <code className="font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">{'{{ company.name }}'}</code> template variables.
              </p>
            </div>

            {/* Field 2: Reply-To Email */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label htmlFor="replyToEmail" className="text-xs font-bold tracking-wide text-slate-500 flex items-center gap-2 uppercase">
                  <Mail className="h-4 w-4 text-slate-400" /> Default Reply-To Email
                </Label>
                {replyToEmail !== initialWorkspace.replyToEmail && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider shadow-sm">
                    Unsaved Edits
                  </span>
                )}
              </div>
              <Input
                id="replyToEmail"
                type="email"
                placeholder="support@yourdomain.com"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 text-base shadow-sm transition-colors"
              />
              <p className="text-xs text-slate-500 font-medium">
                When recovered users reply to your campaign emails, this is where it routes.
              </p>
            </div>
          </div>

          {/* ── Card Footer Action Bar ── */}
          <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto">
            <p className="text-xs font-medium text-slate-500">Changes propagate immediately upon saving.</p>
            <Button
              onClick={handleSaveWorkspace}
              disabled={isSavingWorkspace || !hasWorkspaceChanges}
              className="bg-[#0A192F] hover:bg-slate-800 text-white shadow-sm transition-all active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 px-6 h-10 font-medium"
            >
              {isSavingWorkspace && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Save Workspace
            </Button>
          </div>
          
        </section>

      </div>
    </div>
  );
}