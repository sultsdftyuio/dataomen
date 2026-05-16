"use client";

import React from "react";
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  MoreVertical, 
  Clock, 
  Mail, 
  AlertCircle,
  PlayCircle,
  Ban
} from "lucide-react";

const MOCK_QUEUE = [
  {
    id: "risk_001",
    email: "alex.martinez@example.com",
    mrr: 49,
    signal: "Failed Stripe Invoice (Attempt 2)",
    signalType: "billing",
    status: "Email 1 Sent",
    cooldown: "48h remaining",
    severity: "high"
  },
  {
    id: "risk_002",
    email: "sarah.j@startup.io",
    mrr: 199,
    signal: "Zero Logins in 14 Days",
    signalType: "activity",
    status: "Pending Routing",
    cooldown: null,
    severity: "medium"
  },
  {
    id: "risk_003",
    email: "m.chen@enterprise.net",
    mrr: 850,
    signal: "Subscription Cancelled (End of Term)",
    signalType: "cancellation",
    status: "Founder Escalation",
    cooldown: null,
    severity: "critical"
  },
  {
    id: "risk_004",
    email: "david@designco.com",
    mrr: 29,
    signal: "Abandoned Onboarding Step 3",
    signalType: "activity",
    status: "Email 2 Sent",
    cooldown: "12h remaining",
    severity: "low"
  }
];

export default function RiskQueueClient({ tenantId }: { tenantId: string }) {
  // In a real implementation, you would fetch the queue via SWR/React Query
  // from an endpoint like `/api/queue/active?tenant_id=${tenantId}`
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* ── Header & Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0A192F] tracking-tight">Active Risk Queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Accounts currently flagged by deterministic churn signals.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search users..." 
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-64 transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {/* ── Data Table ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User / Account</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">MRR at Risk</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Deterministic Signal</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Engine Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_QUEUE.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                  
                  {/* User Column */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-[#0A192F]">{item.email}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">{item.id}</div>
                  </td>

                  {/* MRR Column */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-[#0A192F]">${item.mrr}<span className="text-slate-400 text-xs">/mo</span></div>
                  </td>

                  {/* Signal Column */}
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium
                      ${item.signalType === 'billing' ? 'bg-rose-50 border-rose-200 text-rose-700' : ''}
                      ${item.signalType === 'cancellation' ? 'bg-purple-50 border-purple-200 text-purple-700' : ''}
                      ${item.signalType === 'activity' ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}
                    `}>
                      {item.signalType === 'billing' && <AlertCircle className="h-3.5 w-3.5" />}
                      {item.signalType === 'cancellation' && <ShieldAlert className="h-3.5 w-3.5" />}
                      {item.signalType === 'activity' && <Clock className="h-3.5 w-3.5" />}
                      {item.signal}
                    </div>
                  </td>

                  {/* Status Column */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        {item.status.includes('Email') ? (
                          <Mail className="h-4 w-4 text-blue-500" />
                        ) : item.status.includes('Founder') ? (
                          <AlertCircle className="h-4 w-4 text-rose-500" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-amber-500 ml-1" />
                        )}
                        {item.status}
                      </div>
                      {item.cooldown && (
                        <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold ml-6">
                          Cooldown: {item.cooldown}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Actions Column */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        title="Force Execute Next Step"
                      >
                        <PlayCircle className="h-4 w-4" />
                      </button>
                      <button 
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Skip / Suppress User"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Empty State Fallback */}
          {MOCK_QUEUE.length === 0 && (
            <div className="p-12 text-center">
              <ShieldAlert className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-slate-900">Queue is empty</h3>
              <p className="text-sm text-slate-500 mt-1">No active churn risks detected.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}