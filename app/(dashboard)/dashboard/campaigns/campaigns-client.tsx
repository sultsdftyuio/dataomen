// app/(dashboard)/dashboard/campaigns/campaigns-client.tsx
"use client";

import React from "react";
import { Send, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CampaignsClient() {
  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-1">Configure automated recovery workflows and email sequences.</p>
        </div>
        <Button className="bg-[#0A192F] hover:bg-blue-900 text-white shadow-sm transition-all active:scale-[0.98]">
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* Empty / Placeholder State */}
      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-xl bg-slate-50/50 py-24 shadow-sm">
        <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
          <Send className="h-8 w-8 ml-1" /> {/* ml-1 slightly centers the paper airplane visually */}
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Define your recovery logic</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-sm text-center leading-relaxed">
          Create targeted campaigns to intercept churn signals and dispatch automated recovery payloads.
        </p>
      </div>
      
    </div>
  );
}