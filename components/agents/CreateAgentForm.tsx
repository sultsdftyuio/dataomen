"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { 
  Bot, 
  Database, 
  Sparkles, 
  BrainCircuit, 
  FileText, 
  ShieldCheck, 
  Settings2,
  CheckCircle2
} from "lucide-react";

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------
export interface AgentCreatePayload {
  name: string;
  description: string;
  role_description: string; // The system prompt / instructions
  dataset_ids: string[];    // Structured Data Access
  document_ids: string[];   // Unstructured Data Access
  temperature: number;      // Creativity vs. Determinism
}

interface MockAsset {
  id: string;
  name: string;
  type: 'dataset' | 'document';
}

interface CreateAgentFormProps {
  onSubmit: (payload: AgentCreatePayload) => Promise<void>;
  isLoading?: boolean;
  // In a real app, pass these down from your useDatasets() hook
  availableAssets?: MockAsset[]; 
}

// Fallback mock data if not provided by parent
const MOCK_ASSETS: MockAsset[] = [
  { id: 'ds_stripe_prod', name: 'Stripe Transactions (Prod)', type: 'dataset' },
  { id: 'ds_hubspot_crm', name: 'HubSpot CRM Contacts', type: 'dataset' },
  { id: 'doc_hr_policy', name: 'Employee_Handbook_2024.pdf', type: 'document' },
  { id: 'doc_sec_audit', name: 'SOC2_Compliance_Audit.pdf', type: 'document' },
];

export function CreateAgentForm({ 
  onSubmit, 
  isLoading = false,
  availableAssets = MOCK_ASSETS 
}: CreateAgentFormProps) {
  
  // 1. Identity
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  
  // 2. Instructions (System Prompt)
  const [roleDescription, setRoleDescription] = useState("");

  // 3. Knowledge Base (RAG & SQL Context)
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  // 4. Engine Behavior
  const [temperature, setTemperature] = useState<number[]>([0.0]); // Default: 0 (Deterministic)

  const toggleDataset = (id: string) => {
    setSelectedDatasets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleDocument = (id: string) => {
    setSelectedDocuments(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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

    // Reset form upon successful creation
    setName("");
    setDescription("");
    setRoleDescription("");
    setSelectedDatasets([]);
    setSelectedDocuments([]);
    setTemperature([0.0]);
  };

  const getTempLabel = (val: number) => {
    if (val === 0.0) return "Strictly Deterministic (Math/SQL focus)";
    if (val <= 0.4) return "Balanced (Good for Summaries)";
    return "Creative (Brainstorming/Drafting)";
  };

  const datasets = availableAssets.filter(a => a.type === 'dataset');
  const documents = availableAssets.filter(a => a.type === 'document');

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm max-w-4xl mx-auto">
      
      <div className="border-b border-gray-100 pb-5">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <div className="p-2 bg-blue-100 rounded-xl">
            <Bot className="w-6 h-6 text-blue-600" />
          </div>
          Create AI Copilot
        </h2>
        <p className="text-sm text-gray-500 mt-2 font-medium">
          Deploy a specialized AI agent with custom instructions and restricted access to specific data sources.
        </p>
      </div>
      
      {/* SECTION 1: Identity */}
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-purple-500" />
          <h3 className="text-sm font-bold tracking-wider uppercase text-gray-400">1. Persona</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700 font-semibold">Agent Name</Label>
            <Input 
              id="name" 
              placeholder="e.g., Financial Controller Bot" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              required 
              className="bg-gray-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl py-5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc" className="text-gray-700 font-semibold">Short Description</Label>
            <Input 
              id="desc" 
              placeholder="e.g., Answers questions about Q3 revenue." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              required 
              className="bg-gray-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl py-5"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructions" className="text-gray-700 font-semibold">Custom Instructions (System Prompt)</Label>
          <Textarea 
            id="instructions" 
            placeholder="e.g., You are an expert financial analyst. Only answer using the provided Stripe data. Never guess numbers." 
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
            disabled={isLoading}
            required 
            rows={3}
            className="bg-gray-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl resize-none"
          />
        </div>
      </div>

      {/* SECTION 2: Knowledge Base Access */}
      <div className="space-y-5 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <h3 className="text-sm font-bold tracking-wider uppercase text-gray-400">2. Knowledge Access</h3>
          </div>
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
            Tenant Isolated
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Structured Datasets */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-gray-700 font-semibold">
              <Database className="w-4 h-4 text-blue-500" /> Structured Datasets
            </Label>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 space-y-1 max-h-[180px] overflow-y-auto custom-scrollbar">
              {datasets.length === 0 && <p className="text-xs text-gray-400 p-2 italic">No datasets available.</p>}
              {datasets.map(ds => (
                <div 
                  key={ds.id}
                  onClick={() => toggleDataset(ds.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                    selectedDatasets.includes(ds.id) 
                      ? 'bg-blue-50 border-blue-200 text-blue-900' 
                      : 'bg-white border-transparent hover:border-gray-200 text-gray-600'
                  }`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center border ${selectedDatasets.includes(ds.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {selectedDatasets.includes(ds.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm font-medium truncate">{ds.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Unstructured Documents */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-gray-700 font-semibold">
              <FileText className="w-4 h-4 text-purple-500" /> Unstructured Documents
            </Label>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 space-y-1 max-h-[180px] overflow-y-auto custom-scrollbar">
              {documents.length === 0 && <p className="text-xs text-gray-400 p-2 italic">No documents available.</p>}
              {documents.map(doc => (
                <div 
                  key={doc.id}
                  onClick={() => toggleDocument(doc.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                    selectedDocuments.includes(doc.id) 
                      ? 'bg-purple-50 border-purple-200 text-purple-900' 
                      : 'bg-white border-transparent hover:border-gray-200 text-gray-600'
                  }`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center border ${selectedDocuments.includes(doc.id) ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}`}>
                    {selectedDocuments.includes(doc.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm font-medium truncate">{doc.name}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* SECTION 3: Engine Behavior */}
      <div className="space-y-5 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-gray-500" />
          <h3 className="text-sm font-bold tracking-wider uppercase text-gray-400">3. Engine Settings</h3>
        </div>

        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 space-y-4">
          <div className="flex justify-between items-end">
            <Label className="font-semibold text-gray-700">Model Temperature</Label>
            <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-md">
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
            className="py-2"
          />
          <p className="text-xs text-gray-500 font-medium leading-relaxed">
            Keep temperature at 0.0 for agents generating SQL or retrieving strict facts from PDFs. Increase it for agents writing emails or brainstorming.
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-6 border-t border-gray-100">
        <Button 
          type="submit" 
          disabled={isLoading || !name || !roleDescription || (selectedDatasets.length === 0 && selectedDocuments.length === 0)} 
          className="w-full gap-2 font-semibold text-[15px] group h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm hover:shadow-blue-500/20 transition-all"
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
          <p className="text-center text-xs text-red-500 font-medium mt-3">
            Please select at least one data source or document for the agent to access.
          </p>
        )}
      </div>
    </form>
  );
}