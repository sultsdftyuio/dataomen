"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast"; // Assuming standard shadcn path
import { 
  Bot, 
  Database, 
  Sparkles, 
  BrainCircuit, 
  ShieldCheck, 
  Settings2,
  CheckCircle2,
  Webhook,
  FileSpreadsheet,
  Cloud,
  ShoppingBag,
  Megaphone,
  CreditCard,
  HeadphonesIcon,
  Lock,
  Link as LinkIcon
} from "lucide-react";

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------
export interface AgentCreatePayload {
  name: string;
  description: string;
  role_description: string; 
  dataset_ids: string[];    
  document_ids: string[];   
  temperature: number;      
}

export interface MockAsset {
  id: string;
  name: string;
  type: 'dataset' | 'document';
  sourceType?: string; 
  isConnected: boolean; // NEW: Enforces actual connection status
}

interface CreateAgentFormProps {
  onSubmit: (payload: AgentCreatePayload) => Promise<void>;
  isLoading?: boolean;
  availableAssets?: MockAsset[]; 
}

// Mocking the real backend state. 
// In production, `isConnected` would be determined by checking if the tenant has active credentials in your DB.
const ACTUAL_INTEGRATIONS: MockAsset[] = [
  // Warehouses
  { id: 'ds_snowflake', name: 'Snowflake DW', type: 'dataset', sourceType: 'Snowflake', isConnected: true },
  { id: 'ds_bigquery', name: 'Google BigQuery', type: 'dataset', sourceType: 'BigQuery', isConnected: false },
  { id: 'ds_redshift', name: 'AWS Redshift', type: 'dataset', sourceType: 'Redshift', isConnected: false },
  
  // E-commerce & Payments
  { id: 'ds_stripe_prod', name: 'Stripe Billing', type: 'dataset', sourceType: 'Stripe', isConnected: true },
  { id: 'ds_shopify', name: 'Shopify Store', type: 'dataset', sourceType: 'Shopify', isConnected: false },
  
  // CRM & Support
  { id: 'ds_hubspot_crm', name: 'HubSpot CRM', type: 'dataset', sourceType: 'HubSpot', isConnected: false },
  { id: 'ds_salesforce', name: 'Salesforce', type: 'dataset', sourceType: 'Salesforce', isConnected: false },
  { id: 'ds_zendesk', name: 'Zendesk Tickets', type: 'dataset', sourceType: 'Zendesk', isConnected: false },
  
  // Marketing & Ads
  { id: 'ds_google_ads', name: 'Google Ads', type: 'dataset', sourceType: 'Google Ads', isConnected: false },
  { id: 'ds_meta_ads', name: 'Meta Ads', type: 'dataset', sourceType: 'Meta Ads', isConnected: false },
  
  // Internal/Files
  { id: 'ds_app_telemetry', name: 'App Telemetry', type: 'dataset', sourceType: 'Parquet', isConnected: true },
];

export function CreateAgentForm({ 
  onSubmit, 
  isLoading = false,
  availableAssets = ACTUAL_INTEGRATIONS 
}: CreateAgentFormProps) {
  
  const { toast } = useToast();

  // 1. Identity
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  
  // 2. Instructions
  const [roleDescription, setRoleDescription] = useState("");

  // 3. Knowledge Base
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  // 4. Engine Behavior
  const [temperature, setTemperature] = useState<number[]>([0.0]); 

  // Updated toggle logic: Enforce connection check before allowing selection
  const toggleDataset = (ds: MockAsset) => {
    if (!ds.isConnected) {
      toast({
        title: "Integration Not Connected",
        description: `Please connect your ${ds.sourceType} workspace in the Datasets tab before giving this agent access to it.`,
        variant: "destructive"
      });
      return;
    }

    setSelectedDatasets(prev => 
      prev.includes(ds.id) ? prev.filter(x => x !== ds.id) : [...prev, ds.id]
    );
  };

  const toggleDocument = (doc: MockAsset) => {
    if (!doc.isConnected) {
      toast({
        title: "Document Not Processed",
        description: `This document is not fully embedded yet. Please wait or re-upload.`,
        variant: "destructive"
      });
      return;
    }

    setSelectedDocuments(prev => 
      prev.includes(doc.id) ? prev.filter(x => x !== doc.id) : [...prev, doc.id]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const payload: AgentCreatePayload = {
      name,
      description,
      role_description: roleDescription,
      dataset_ids: selectedDatasets,
      document_ids: selectedDocuments,
      temperature: temperature[0],
    };

    await onSubmit(payload);

    // Reset
    setName("");
    setDescription("");
    setRoleDescription("");
    setSelectedDatasets([]);
    setSelectedDocuments([]);
    setTemperature([0.0]);
  };

  const getTempLabel = (val: number) => {
    if (val === 0.0) return "Strictly Deterministic (Math/SQL)";
    if (val <= 0.4) return "Balanced (Summaries)";
    return "Creative (Brainstorming)";
  };

  const datasets = availableAssets.filter(a => a.type === 'dataset');
  const documents = availableAssets.filter(a => a.type === 'document');

  // Dynamic Icon Mapping
  const getSourceIcon = (sourceType?: string) => {
    const type = sourceType?.toLowerCase() || '';
    if (type.includes('snowflake') || type.includes('bigquery')) return <Cloud className="w-5 h-5 text-sky-500" />;
    if (type.includes('redshift') || type.includes('postgresql')) return <Database className="w-5 h-5 text-blue-500" />;
    if (type.includes('stripe')) return <CreditCard className="w-5 h-5 text-indigo-500" />;
    if (type.includes('shopify')) return <ShoppingBag className="w-5 h-5 text-emerald-500" />;
    if (type.includes('hubspot') || type.includes('salesforce')) return <Webhook className="w-5 h-5 text-orange-500" />;
    if (type.includes('zendesk')) return <HeadphonesIcon className="w-5 h-5 text-teal-500" />;
    if (type.includes('ads')) return <Megaphone className="w-5 h-5 text-rose-500" />;
    if (type.includes('parquet')) return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    return <Database className="w-5 h-5 text-gray-500" />;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10 bg-white border border-gray-200 rounded-3xl p-8 shadow-sm max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="border-b border-gray-100 pb-6">
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 rounded-xl shadow-sm">
            <Bot className="w-6 h-6 text-white" />
          </div>
          Configure Agent
        </h2>
        <p className="text-base text-gray-500 mt-3 font-medium">
          Define persona, strict directives, and provision data memory limits.
        </p>
      </div>
      
      {/* SECTION 1: LLM Persona */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
          <BrainCircuit className="h-5 w-5 text-indigo-500" />
          <h3 className="text-sm font-bold tracking-widest uppercase text-gray-900">LLM Persona</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <Label htmlFor="name" className="text-gray-700 font-bold">Agent Identity</Label>
            <Input 
              id="name" 
              placeholder="e.g., Growth Analytics Copilot" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              required 
              className="bg-gray-50 border-gray-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 rounded-xl py-6 shadow-inner"
            />
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="desc" className="text-gray-700 font-bold">Objective Summary</Label>
            <Input 
              id="desc" 
              placeholder="e.g., Analyzes ROAS across Shopify and Meta Ads." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              required 
              className="bg-gray-50 border-gray-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 rounded-xl py-6 shadow-inner"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="instructions" className="text-gray-700 font-bold">Strict Directives (System Prompt)</Label>
          <Textarea 
            id="instructions" 
            placeholder="e.g., You are an expert data analyst. Cross-reference Shopify sales with Meta Ad spend to calculate accurate ROAS. Never hallucinate numbers." 
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
            disabled={isLoading}
            required 
            rows={4}
            className="bg-gray-50 border-gray-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 rounded-xl resize-none shadow-inner"
          />
        </div>
      </div>

      {/* SECTION 2: Memory Boundaries */}
      <div className="space-y-6 pt-2">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <h3 className="text-sm font-bold tracking-widest uppercase text-gray-900">Memory Boundaries</h3>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200 uppercase tracking-wider">
            Tenant Isolated
          </span>
        </div>

        {/* Structured Datasets Grid */}
        {datasets.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Label className="text-gray-500 font-semibold text-xs uppercase tracking-wider">
                Active Integrations & Warehouses
              </Label>
              <span className="text-xs text-gray-400 font-medium">Select multiple active sources to enable cross-platform insights.</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
              {datasets.map(ds => {
                const isSelected = selectedDatasets.includes(ds.id);
                const isConnected = ds.isConnected;
                
                return (
                  <div 
                    key={ds.id}
                    onClick={() => toggleDataset(ds)}
                    className={`relative p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col gap-3 group 
                      ${!isConnected ? 'opacity-60 bg-gray-50 border-gray-100 cursor-not-allowed hover:opacity-80' : 'cursor-pointer'}
                      ${isSelected ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-500/10' : ''}
                      ${isConnected && !isSelected ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-white shadow-sm' : 'bg-gray-100/80 group-hover:bg-white'}`}>
                        {getSourceIcon(ds.sourceType)}
                      </div>
                      
                      {isConnected ? (
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-colors ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-200'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                      ) : (
                        <div className="bg-gray-200 p-1 rounded-full" title="Not Connected">
                          <Lock className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`font-bold text-sm ${isSelected ? 'text-blue-950' : 'text-gray-900'}`}>
                          {ds.name}
                        </h4>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-xs font-medium ${isSelected ? 'text-blue-600' : 'text-gray-500'}`}>
                          {ds.sourceType || 'Dataset'}
                        </p>
                        {!isConnected && (
                          <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" /> Connect
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unstructured Documents Grid - Hidden if empty */}
        {documents.length > 0 && (
          <div className="space-y-3 pt-4">
            <Label className="text-gray-500 font-semibold text-xs uppercase tracking-wider">
              Unstructured Documents (Vector RAG)
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {documents.map(doc => {
                const isSelected = selectedDocuments.includes(doc.id);
                return (
                  <div 
                    key={doc.id}
                    onClick={() => toggleDocument(doc)}
                    className={`relative p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col gap-3 group ${
                      isSelected 
                        ? 'border-purple-600 bg-purple-50/50 shadow-md shadow-purple-500/10' 
                        : 'border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-white shadow-sm' : 'bg-gray-50 group-hover:bg-white'}`}>
                        {getSourceIcon(doc.sourceType)}
                      </div>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-200'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm truncate ${isSelected ? 'text-purple-950' : 'text-gray-900'}`}>
                        {doc.name}
                      </h4>
                      <p className={`text-xs font-medium mt-0.5 ${isSelected ? 'text-purple-600' : 'text-gray-500'}`}>
                        {doc.sourceType || 'Document'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Engine Behavior */}
      <div className="space-y-6 pt-2">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
          <Settings2 className="h-5 w-5 text-gray-500" />
          <h3 className="text-sm font-bold tracking-widest uppercase text-gray-900">Engine Settings</h3>
        </div>

        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-inner">
          <div className="flex justify-between items-end mb-6">
            <Label className="font-bold text-gray-800">Model Temperature</Label>
            <span className="text-xs font-bold text-slate-700 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200">
              {getTempLabel(temperature[0])}
            </span>
          </div>
          
          <Slider
            value={temperature}
            onValueChange={setTemperature}
            max={1.0}
            min={0.0}
            step={0.1}
            disabled={isLoading}
            className="py-2 cursor-pointer"
          />
          <p className="text-sm text-gray-500 font-medium leading-relaxed mt-4">
            Keep temperature at 0.0 for agents generating strict SQL or retrieving facts. Increase it up to 1.0 for agents tasked with writing emails, drafting copy, or open-ended brainstorming.
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-8 border-t border-gray-100">
        <Button 
          type="submit" 
          disabled={isLoading || !name || !roleDescription || (selectedDatasets.length === 0 && selectedDocuments.length === 0)} 
          className="w-full gap-2 font-bold text-base group h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
        >
          {isLoading ? (
            "Provisioning Agent..."
          ) : (
            <>
              <Sparkles className="h-5 w-5 fill-current group-hover:animate-pulse" />
              Deploy Specialized Copilot
            </>
          )}
        </Button>
        {(selectedDatasets.length === 0 && selectedDocuments.length === 0) && (
          <p className="text-center text-sm text-red-500 font-bold mt-4 bg-red-50 py-2 rounded-xl">
            ⚠️ Please select at least one connected data memory boundary to continue.
          </p>
        )}
      </div>
    </form>
  );
}