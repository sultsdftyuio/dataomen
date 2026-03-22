// components/datasets/SemanticMetricBuilder.tsx
'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
  Users,
  RefreshCcw
} from 'lucide-react';

interface SemanticMetricBuilderProps {
  datasetId?: string; // Optional: specific dataset scoping
  datasetIds?: string[]; // Optional: cross-dataset metrics
  apiUrl?: string; 
  onMetricSaved?: () => void; 
}

// Phase 3: Golden Templates Configuration
const GOLDEN_TEMPLATES = [
  {
    id: 'true-roas',
    name: 'True ROAS',
    icon: <TrendingUp className="w-5 h-5 text-blue-500" />,
    description: 'Total actual Revenue (Stripe/Shopify) divided by total Ad Spend (Meta/Google).',
    badge: 'Cross-Platform',
    color: 'hover:border-blue-300 hover:shadow-blue-500/10'
  },
  {
    id: 'blended-cac',
    name: 'Blended CAC',
    icon: <Users className="w-5 h-5 text-purple-500" />,
    description: 'Total Marketing Spend divided by total New Customers Acquired.',
    badge: 'Standard',
    color: 'hover:border-purple-300 hover:shadow-purple-500/10'
  },
  {
    id: 'ltv',
    name: 'Customer LTV',
    icon: <Banknote className="w-5 h-5 text-emerald-500" />,
    description: 'Average Revenue Per User multiplied by the average customer lifespan.',
    badge: 'Predictive',
    color: 'hover:border-emerald-300 hover:shadow-emerald-500/10'
  }
];

export default function SemanticMetricBuilder({ 
  datasetId, 
  datasetIds = [],
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  onMetricSaved 
}: SemanticMetricBuilderProps) {
  const supabase = createClient();
  const { toast } = useToast();
  
  // Form State
  const [metricName, setMetricName] = useState('');
  const [description, setDescription] = useState('');
  
  // Execution State
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Result State
  const [compiledSql, setCompiledSql] = useState<string | null>(null);

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
    setCompiledSql(null); 
    toast({
      title: "Template Applied",
      description: `Loaded ${template.name} configuration. Ready to compile.`,
    });
  };

  /**
   * Step 1: Send Natural Language to the AI Compiler
   */
  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metricName.trim() || !description.trim()) return;

    setIsCompiling(true);
    setCompiledSql(null);

    try {
      const token = await getAuthToken();
      
      const payload = {
        metric_name: metricName,
        description: description,
        // Support global/multi-dataset metrics
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
      toast({
        title: "Compilation Successful",
        description: "AST validated. Please review the SQL before saving.",
      });

    } catch (err: any) {
      toast({
        title: "Compilation Error",
        description: err.message,
        variant: "destructive",
      });
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

    try {
      const token = await getAuthToken();
      
      const payload = {
        metric_name: metricName,
        description: description,
        compiled_sql: compiledSql,
        // Global metric if no specific dataset is passed
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

      toast({
        title: "Metric Governed Successfully",
        description: `${metricName} has been added to the Semantic Catalog.`,
      });
      
      // Reset form for the next metric
      setMetricName('');
      setDescription('');
      setCompiledSql(null);
      
      // Trigger parent component to refresh the catalog table
      if (onMetricSaved) onMetricSaved();

    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-8 w-full max-w-4xl mx-auto">
      
      {/* Header */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          Semantic Metric Builder
        </h3>
        <p className="text-sm text-gray-500 mt-2 font-medium">
          Define complex business logic using natural language. We'll compile it into deterministic, zero-latency DuckDB SQL for the AI Copilot to use.
        </p>
      </div>

      {/* Phase 3: Golden Templates Section */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Golden Templates</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {GOLDEN_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleApplyTemplate(template)}
              disabled={isCompiling || isSaving}
              className={`flex flex-col text-left p-4 rounded-2xl border border-gray-100 bg-gray-50/50 transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed group ${template.color}`}
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div className="p-2 bg-white border border-gray-100 rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                  {template.icon}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-white border border-gray-200 text-gray-600 rounded-full">
                  {template.badge}
                </span>
              </div>
              <h5 className="font-semibold text-[15px] text-gray-900 mb-1.5">{template.name}</h5>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                {template.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* STEP 1: Definition Form */}
      <form onSubmit={handleCompile} className="space-y-5">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Custom Definition</h4>
        
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Metric Name</label>
          <input
            type="text"
            required
            placeholder="e.g., Monthly Active Users"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            disabled={isCompiling || isSaving}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 font-medium text-gray-900 placeholder:text-gray-400 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Business Logic (Natural Language)</label>
          <textarea
            required
            rows={3}
            placeholder="e.g., Count unique users who have logged in within the last 30 days."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isCompiling || isSaving}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 resize-none text-sm font-medium text-gray-900 placeholder:text-gray-400"
          />
        </div>

        {!compiledSql && (
          <button
            type="submit"
            disabled={isCompiling || !metricName || !description}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3.5 rounded-xl hover:bg-blue-700 transition-all disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed font-semibold shadow-sm hover:shadow-blue-500/20"
          >
            {isCompiling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 ml-1" />}
            {isCompiling ? 'Compiling AST via AI...' : 'Compile Logic to SQL'}
          </button>
        )}
      </form>

      {/* STEP 2: SQL Validation & Save */}
      {compiledSql && (
        <div className="space-y-4 p-5 bg-white rounded-2xl border border-blue-200 shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code2 className="w-5 h-5 text-blue-600" />
              <h4 className="text-[15px] font-bold text-gray-900">Deterministic DuckDB Output</h4>
            </div>
            <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto shadow-inner border border-slate-800">
              <pre className="text-sm text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed">
                {compiledSql}
              </pre>
            </div>
            <div className="flex items-center gap-2 mt-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100/50">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-xs font-semibold">
                AST Validated. Destructive operations blocked. Ready for zero-latency injection.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              onClick={() => setCompiledSql(null)}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCcw className="w-4 h-4" />
              Discard & Edit
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-[2] flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-4 py-3 rounded-xl hover:bg-blue-700 transition-all shadow-sm shadow-blue-500/20 disabled:bg-blue-400"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Approve & Save to Catalog
            </button>
          </div>
        </div>
      )}
    </div>
  );
}