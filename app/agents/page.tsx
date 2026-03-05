'use client';

import { useState } from 'react';
import { Bot, Activity, Search, Clock, Plus, Settings2, PlayCircle, StopCircle } from 'lucide-react';
import { CreateAgentForm } from '@/components/agents/CreateAgentForm';

// Mock data - In production, fetch via useAgents hook powered by Supabase RLS
const MOCK_AGENTS = [
  { id: '1', name: 'Revenue Anomaly Watchdog', type: 'anomaly_detector', status: 'running', schedule: '*/15 * * * *', dataset: 'stripe_mrr_prod' },
  { id: '2', name: 'Support Ticket NL2SQL', type: 'nl2sql', status: 'sleeping', schedule: 'On Demand', dataset: 'zendesk_tickets' },
  { id: '3', name: 'Daily Churn EMA', type: 'watchdog', status: 'running', schedule: '0 0 * * *', dataset: 'user_events_parquet' },
];

export default function AgentsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const getAgentIcon = (type: string) => {
    switch(type) {
      case 'anomaly_detector': return <Activity className="w-5 h-5 text-rose-500" />;
      case 'nl2sql': return <Search className="w-5 h-5 text-indigo-500" />;
      default: return <Bot className="w-5 h-5 text-emerald-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">AI Agents</h1>
            <p className="text-slate-500 mt-1 text-lg">Manage your automated watchdogs, semantic routers, and anomaly detectors.</p>
          </div>
          <button 
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md"
          >
            {showCreate ? 'Close Editor' : <><Plus className="w-5 h-5" /> New Agent</>}
          </button>
        </div>

        {/* Conditional Create Form */}
        {showCreate && (
          <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-300">
            <CreateAgentForm onSuccess={() => setShowCreate(false)} />
          </div>
        )}

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_AGENTS.map((agent) => (
            <div key={agent.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">
              
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {getAgentIcon(agent.type)}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    agent.status === 'running' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {agent.status === 'running' ? <PlayCircle className="w-3 h-3" /> : <StopCircle className="w-3 h-3" />}
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 mb-1">{agent.name}</h3>
                <p className="text-sm text-slate-500 mb-4 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Schedule: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{agent.schedule}</code>
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-2">
                <div className="text-sm text-slate-500 flex flex-col">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Target</span>
                  <span className="font-medium text-slate-700 truncate max-w-[150px]">{agent.dataset}</span>
                </div>
                <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                  <Settings2 className="w-5 h-5" />
                </button>
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}