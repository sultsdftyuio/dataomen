"use client";

import React, { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

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
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-[#0A192F]">Workspace Identity</h2>
        <p className="text-sm text-slate-500 mt-1">Global variables used across your outbound recovery campaigns.</p>
      </div>

      <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-8">
        <div className="max-w-2xl space-y-4">
          <div className="flex justify-between items-center">
            <Label htmlFor="companyName" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
              Product / Company Name
            </Label>
            {companyName !== initialWorkspace.companyName && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">
                Unsaved
              </span>
            )}
          </div>
          <Input
            id="companyName"
            placeholder="e.g. Acme Corp"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 text-base shadow-sm"
          />
          <p className="text-xs text-slate-500">Injected dynamically into {'{{ company.name }}'} template variables.</p>
        </div>

        <div className="max-w-2xl space-y-4">
          <div className="flex justify-between items-center">
            <Label htmlFor="replyToEmail" className="text-xs font-bold tracking-wide text-slate-500 uppercase">
              Default Reply-To Email
            </Label>
            {replyToEmail !== initialWorkspace.replyToEmail && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">
                Unsaved
              </span>
            )}
          </div>
          <Input
            id="replyToEmail"
            type="email"
            placeholder="support@yourdomain.com"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
            className="bg-white border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-11 text-base shadow-sm"
          />
          <p className="text-xs text-slate-500">When recovered users reply to campaign emails, this is where it routes.</p>
        </div>

      </div>

      <div className="px-8 lg:px-12 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between mt-auto">
        <p className="text-xs font-medium text-slate-500">Global variables propagate immediately.</p>
        <Button
          onClick={handleSaveWorkspace}
          disabled={isSavingWorkspace || !hasWorkspaceChanges}
          className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-md transition-all active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 px-6 h-10"
        >
          {isSavingWorkspace && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Save Workspace
        </Button>
      </div>
    </div>
  );
}
