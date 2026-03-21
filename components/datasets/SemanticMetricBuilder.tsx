'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Play, Save, AlertCircle, CheckCircle2, Loader2, Code2 } from 'lucide-react';

interface SemanticMetricBuilderProps {
  datasetId: string;
  apiUrl?: string; // Optional: e.g., process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
  onMetricSaved?: () => void; // Callback to refresh the metrics catalog table
}

export default function SemanticMetricBuilder({ 
  datasetId, 
  apiUrl = 'http://localhost:8080',
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
      
      const res = await fetch(`${apiUrl}/api/v1/datasets/${datasetId}/metrics/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          metric_name: metricName,
          description: description
        })
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
      
      const res = await fetch(`${apiUrl}/api/v1/datasets/${datasetId}/metrics/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          metric_name: metricName,
          description: description,
          compiled_sql: compiledSql
        })
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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Define Semantic Metric</h3>
        <p className="text-sm text-slate-500">
          Use Natural Language to define a business metric. Our AI will compile it into deterministic SQL for governed analytical use.
        </p>
      </div>

      {/* STEP 1: Definition Form */}
      <form onSubmit={handleCompile} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Metric Name</label>
          <input
            type="text"
            required
            placeholder="e.g., Monthly Active Users"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            disabled={isCompiling || isSaving}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50"
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
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50 resize-none"
          />
        </div>

        {!compiledSql && (
          <button
            type="submit"
            disabled={isCompiling || !metricName || !description}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-slate-800 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {isCompiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Compile AI Logic
          </button>
        )}
      </form>

      {/* Feedback Alerts */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      {/* STEP 2: SQL Validation & Save */}
      {compiledSql && (
        <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-slate-900">Compiled DuckDB Syntax</h4>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-blue-300 font-mono whitespace-pre-wrap">
                {compiledSql}
              </pre>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Review the logic above. If correct, save it to the Semantic Catalog. This logic will automatically inject into future AI queries.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setCompiledSql(null)}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Discard & Edit
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Approve & Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}