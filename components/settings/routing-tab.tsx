"use client";

import React, { useMemo, useState } from "react";
import { type User } from "@supabase/supabase-js";
import { AlertCircle, BellRing, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

interface RoutingTabProps {
  user: User;
  initialSettings: {
    routing: { notifyAnomalies: boolean; notifyWeekly: boolean };
  };
}

export default function RoutingTab({ initialSettings }: RoutingTabProps) {
  const [isSavingRouting, setIsSavingRouting] = useState(false);
  const [notifyAnomalies, setNotifyAnomalies] = useState(initialSettings.routing.notifyAnomalies);
  const [notifyWeekly, setNotifyWeekly] = useState(initialSettings.routing.notifyWeekly);
  const [initialNotifyAnomalies, setInitialNotifyAnomalies] = useState(initialSettings.routing.notifyAnomalies);
  const [initialNotifyWeekly, setInitialNotifyWeekly] = useState(initialSettings.routing.notifyWeekly);

  const hasRoutingChanges = useMemo(
    () => notifyAnomalies !== initialNotifyAnomalies || notifyWeekly !== initialNotifyWeekly,
    [notifyAnomalies, notifyWeekly, initialNotifyAnomalies, initialNotifyWeekly]
  );

  const handleSaveRouting = async () => {
    if (!hasRoutingChanges) return;
    setIsSavingRouting(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyAnomalies, notifyWeekly }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save routing preferences");
      }
      setInitialNotifyAnomalies(notifyAnomalies);
      setInitialNotifyWeekly(notifyWeekly);
      toast({ title: "Routing Updated", description: "Recovery notification rules applied." });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingRouting(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="px-8 lg:px-12 py-8 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-[#0A192F]">Alerts & Routing</h2>
        <p className="text-sm text-slate-500 mt-1">Define internal notifications based on engine events.</p>
      </div>

      <div className="p-8 lg:px-12 flex-1 overflow-y-auto space-y-4 max-w-4xl">
        <div
          className={`flex items-start justify-between p-6 border bg-white rounded-xl transition-all duration-200 ${
            notifyAnomalies ? "border-rose-200 shadow-sm ring-1 ring-rose-50" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="space-y-2 max-w-[80%]">
            <Label
              className="text-base font-semibold text-[#0A192F] flex items-center gap-2 cursor-pointer"
              onClick={() => setNotifyAnomalies(!notifyAnomalies)}
            >
              <AlertCircle className={`h-5 w-5 ${notifyAnomalies ? "text-rose-500" : "text-slate-400"}`} />
              Critical Risk Escalation
            </Label>
            <p className="text-sm text-slate-500 leading-relaxed">
              Dispatch immediate email payloads to operators when the engine flags high-MRR accounts for severe, sudden churn risk.
            </p>
          </div>
          <Switch checked={notifyAnomalies} onCheckedChange={setNotifyAnomalies} className="data-[state=checked]:bg-rose-500 mt-1" />
        </div>

        <div
          className={`flex items-start justify-between p-6 border bg-white rounded-xl transition-all duration-200 ${
            notifyWeekly ? "border-blue-200 shadow-sm ring-1 ring-blue-50" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="space-y-2 max-w-[80%]">
            <Label
              className="text-base font-semibold text-[#0A192F] flex items-center gap-2 cursor-pointer"
              onClick={() => setNotifyWeekly(!notifyWeekly)}
            >
              <BellRing className={`h-5 w-5 ${notifyWeekly ? "text-blue-600" : "text-slate-400"}`} />
              Weekly Action Digest
            </Label>
            <p className="text-sm text-slate-500 leading-relaxed">
              Compile and transmit a summarized report of recovered MRR, pending queue actions, and campaign health every Monday morning.
            </p>
          </div>
          <Switch checked={notifyWeekly} onCheckedChange={setNotifyWeekly} className="data-[state=checked]:bg-blue-600 mt-1" />
        </div>
      </div>

      <div className="px-8 lg:px-12 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          {hasRoutingChanges ? (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">
              Unsaved Logic
            </span>
          ) : (
            <p className="text-xs font-medium text-slate-500">Routing rules active.</p>
          )}
        </div>
        <Button
          onClick={handleSaveRouting}
          disabled={isSavingRouting || !hasRoutingChanges}
          className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-md transition-all active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 px-6 h-10"
        >
          {isSavingRouting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
