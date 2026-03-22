// components/datasets/SemanticMetricBuilder.tsx
'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { 
  Play, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Code2, 
  Sparkles, 
  TrendingUp,
  Banknote,
  Users
} from 'lucide-react';

interface SemanticMetricBuilderProps {
  datasetId?: string; // Made optional to support global metrics
  datasetIds?: string[]; // Added to support cross-dataset metrics
  apiUrl?: string; 
  onMetricSaved?: () => void; 
}

// Phase 3: Golden Templates Configuration
const GOLDEN_TEMPLATES = [
  {
    id: 'true-roas',
    name: 'True ROAS',
    icon: <TrendingUp className="w-4 h-4 text-amber-500" />,
    description: 'Total actual Revenue (Stripe/Shopify) divided by total Ad Spend (Meta/Google).',
    badge: 'Cross-Platform',
    color: 'bg-amber-50 border-amber-200 text-amber-800'
  },
  {
    id: 'blended-cac',
    name: 'Blended CAC',
    icon: <Users className="w-4 h-4 text-blue-500" />,
    description: 'Total Marketing Spend divided by total New Customers Acquired.',
    badge: 'Standard',
    color: 'bg-blue-50 border-blue-200 text-blue-800'
  },
  {
    id: 'ltv',
    name: 'Customer LTV',
    icon: <Banknote className="w-4 h-4 text-emerald-500" />,
    description: 'Average Revenue Per User multiplied by the average customer lifespan.',
    badge: 'Predictive',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-800'
  }
];

export default function SemanticMetricBuilder({ 
  datasetId, 
  datasetIds = [],
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  onMetricSaved 
}: SemanticMetricBuilderProps) {
  const supabase = createClient();
  
  // Form State
  const [metricName, setMetricName] = useState('');
  const [description, setDescription] = useState('');
  
  // Execution State
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Result State
  const [compiledSql, setCompiledSql] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /**
   * Helper: Securely fetches the current user's JWT session token.
   */
  const getAuthToken = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw new Error("Authentication session expired. Please log in again.");
    return session.access_token;
  };

  /**
   * Applies a Golden Template to the builder form
   */
  const handleApplyTemplate = (template: typeof GOLDEN_TEMPLATES[0]) => {
    setMetricName(template.name);
    setDescription(template.description);
    setCompiledSql(null); // Clear previous compilations
    setError(null);
    setSuccess(null);
  };

  /**
   * Step 1: Send Natural Language to the AI Compiler
   */
  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metricName.trim() || !description.trim()) return;

    setIsCompiling(true);
    setError(null);
    setCompiledSql(null);
    setSuccess(null);

    try {
      const token = await getAuthToken();
      
      const payload = {
        metric_name: metricName,
        description: description,
        // Phase 1 Upgrade: Support global/multi-dataset metrics
        dataset_ids: datasetIds.length > 0 ? datasetIds : (datasetId ? [datasetId] : [])
      };

      const res = await fetch(`${apiUrl}/api/v1/metrics/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Compilation failed. Please refine your description.');
      }

      setCompiledSql(data.compiled_sql);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCompiling(false);
    }
  };

  /**
   * Step 2: Save the Human-Approved SQL to the Database
   */
  const handleSave = async () => {
    if (!compiledSql) return;

    setIsSaving(true);
    setError(null);

    try {
      const token = await getAuthToken();
      
      const payload = {
        metric_name: metricName,
        description: description,
        compiled_sql: compiledSql,
        // If it's a cross-dataset metric, we save it as a global metric (dataset_id = null)
        dataset_id: datasetIds.length > 0 ? null : datasetId
      };

      const res = await fetch(`${apiUrl}/api/v1/metrics/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save the metric.');
      }

      setSuccess(`Successfully governed metric: ${metricName}`);
      
      // Reset form for the next metric
      setMetricName('');
      setDescription('');
      setCompiledSql(null);
      
      // Trigger parent component to refresh the catalog table
      if (onMetricSaved) onMetricSaved();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-8 max-w-3xl">
      
      {/* Header */}
      <div>
        <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          Semantic Metric Builder
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Define complex business logic using natural language. We'll compile it into deterministic, zero-latency DuckDB SQL.
        </p>
      </div>

      {/* Phase 3: Golden Templates Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Golden Templates</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {GOLDEN_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleApplyTemplate(template)}
              disabled={isCompiling || isSaving}
              className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${template.color}`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  {template.icon}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-white/50 rounded-full">
                  {template.badge}
                </span>
              </div>
              <h5 className="font-semibold text-sm mb-1">{template.name}</h5>
              <p className="text-xs opacity-80 leading-relaxed line-clamp-2">
                {template.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* STEP 1: Definition Form */}
      <form onSubmit={handleCompile} className="space-y-5">
        <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Custom Definition</h4>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Metric Name</label>
          <input
            type="text"
            required
            placeholder="e.g., Monthly Active Users"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            disabled={isCompiling || isSaving}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50 font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Business Logic (Natural Language)</label>
          <textarea
            required
            rows={3}
            placeholder="e.g., Count unique users who have logged in within the last 30 days."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isCompiling || isSaving}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50 resize-none text-sm"
          />
        </div>

        {!compiledSql && (
          <button
            type="submit"
            disabled={isCompiling || !metricName || !description}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed font-medium shadow-sm"
          >
            {isCompiling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isCompiling ? 'Compiling AST via AI...' : 'Compile Logic to SQL'}
          </button>
        )}
      </form>

      {/* Feedback Alerts */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100 animate-in fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      {/* STEP 2: SQL Validation & Save */}
      {compiledSql && (
        <div className="space-y-4 p-5 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code2 className="w-5 h-5 text-indigo-600" />
              <h4 className="text-sm font-bold text-slate-900">Deterministic DuckDB Output</h4>
            </div>
            <div className="bg-slate-950 rounded-lg p-4 overflow-x-auto shadow-inner">
              <pre className="text-sm text-blue-300 font-mono whitespace-pre-wrap leading-relaxed">
                {compiledSql}
              </pre>
            </div>
            <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              AST Validated. Destructive operations blocked. Ready for zero-latency injection.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCompiledSql(null)}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Discard & Edit
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-medium px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:bg-indigo-400"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Approve & Save to Catalog
            </button>
          </div>
        </div>
      )}
    </div>
  );
}