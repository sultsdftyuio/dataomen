'use client';

import { useState } from 'react';
import { Save, AlertCircle } from 'lucide-react';

interface CreateAgentFormProps {
  onSuccess?: () => void;
}

export function CreateAgentForm({ onSuccess }: CreateAgentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // In production: await fetch('/api/routes/agents', { method: 'POST', body: ... })
    setTimeout(() => {
      setIsSubmitting(false);
      if (onSuccess) onSuccess();
    }, 800);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 border border-indigo-100 shadow-lg shadow-indigo-100/50">
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
        <div className="w-10 h-10 bg-indigo-50 flex items-center justify-center rounded-lg border border-indigo-100">
          <Save className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Configure New Agent</h2>
          <p className="text-sm text-slate-500">Deploy a swappable logic module to monitor your datasets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Agent Name</label>
            <input 
              type="text" 
              required
              placeholder="e.g. Unusual Spike Detector" 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Agent Strategy / Type</label>
            <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 appearance-none">
              <option value="anomaly_detector">Vectorized Anomaly Detector (NumPy)</option>
              <option value="nl2sql">Semantic NL2SQL Router</option>
              <option value="watchdog">Basic Threshold Watchdog</option>
            </select>
          </div>
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Target Dataset (Parquet/DuckDB)</label>
            <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 appearance-none">
              <option value="ds_1">stripe_mrr_prod</option>
              <option value="ds_2">user_events_parquet</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Execution Schedule (Cron)</label>
            <input 
              type="text" 
              placeholder="*/15 * * * *" 
              defaultValue="*/15 * * * *"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Advanced Config / JSON */}
      <div className="mb-8">
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
          <span>Sensitivity Configuration (JSON)</span>
          <span className="text-xs text-indigo-600 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Parameters for EMA/Linear Algebra</span>
        </label>
        <textarea 
          rows={4}
          className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-emerald-400 font-mono text-sm"
          defaultValue={JSON.stringify({ sensitivity_multiplier: 2.5, ema_window: 14 }, null, 2)}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button 
          type="button"
          onClick={onSuccess}
          className="px-6 py-2.5 rounded-lg font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button 
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow transition-all disabled:opacity-70 flex items-center gap-2"
        >
          {isSubmitting ? 'Deploying Logic...' : 'Deploy Agent'}
        </button>
      </div>
    </form>
  );
}