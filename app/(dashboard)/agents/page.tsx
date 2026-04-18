'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { 
  Bot, 
  Search, 
  Plus, 
  Activity, 
  Play, 
  Square,
  Database,
  Trash2,
  Sparkles,
  MoreHorizontal,
  Cpu,
  SquareTerminal,
  FileBox,
  Megaphone,
  Briefcase,
  Box,
  LineChart,
  Target,
  Layers,
  Settings2,
  CheckCircle2,
  ArrowRight
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { createClient } from "@/utils/supabase/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// -----------------------------------------------------------------------------
// Core Schema & State Types
// -----------------------------------------------------------------------------

interface UIAgent {
  id: string;
  name: string;
  description: string;
  role_description: string;
  dataset_id?: string | null;
  document_id?: string | null;
  created_at: string;
  is_active: boolean;
}

interface DatasetAsset {
  id: string;
  name: string;
  status: string;
}

const THEME_COLORS = ['bg-blue-500', 'bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-rose-500', 'bg-violet-500']

const getThemeColor = (id: string) => {
  const charCode = id.charCodeAt(id.length - 1) || 0;
  return THEME_COLORS[charCode % THEME_COLORS.length];
};

// -----------------------------------------------------------------------------
// Massive Template Library
// -----------------------------------------------------------------------------
type Category = 'Marketing' | 'Finance' | 'Product' | 'Data' | 'RevOps' | 'More';

interface Template {
  id: string;
  name: string;
  desc: string;
  category: Category;
  prompt: string;
}

const TEMPLATES: Template[] = [
  // MARKETING
  { id: "mkt_1", category: "Marketing", name: "Customer Segmentation Agent", desc: "Analyzes customer segments and marketing performance across demographics", prompt: "You are an elite Marketing Analyst. Segment customers based on purchasing behavior, demographics, and engagement metrics to identify high-value cohorts." },
  { id: "mkt_2", category: "Marketing", name: "Marketing Budget Optimizing Agent", desc: "Optimizes marketing budget allocation across channels for maximum ROI", prompt: "You are a Growth Marketer. Analyze spend vs. return across all acquisition channels. Recommend budget reallocations to maximize overall ROI." },
  { id: "mkt_3", category: "Marketing", name: "Google Ads Expert", desc: "Expert AI analyst specializing in Google Ads campaign analysis and optimization", prompt: "You are a Google Ads Expert. Analyze CPC, CTR, and conversion rates. Provide data-driven recommendations for keyword bidding and ad copy optimization." },
  // FINANCE
  { id: "fin_1", category: "Finance", name: "Expense Category Analysis Agent", desc: "Automatically categorize and analyze company spending patterns efficiently", prompt: "You are a Corporate Controller. Categorize line-item expenses, identify anomalous spending, and track departmental burn rates against historical averages." },
  { id: "fin_2", category: "Finance", name: "Financial Statement Agent", desc: "Analyze income statements, balance sheets, and cash flow instantly", prompt: "Analyze core financial statements. Calculate gross margin, EBITDA, and working capital ratios. Flag liquidity risks." },
  // PRODUCT
  { id: "prd_1", category: "Product", name: "Product Engagement Agent", desc: "Measure user engagement patterns and identify drivers of active usage", prompt: "You are a Product Manager. Analyze event telemetry to determine Daily Active Users (DAU) / Monthly Active Users (MAU) ratios and core loop completion." },
  // DATA
  { id: "dat_1", category: "Data", name: "Trend Analysis Agent", desc: "Identify trends, growth patterns, and seasonality in your metrics", prompt: "You are a Data Scientist. Perform time-series decomposition. Extract underlying trends, cyclical seasonality, and irregular noise from core business metrics." },
  // REVOPS
  { id: "rev_1", category: "RevOps", name: "Sales Territory Agent", desc: "Compare territories and identify top performers across regions", prompt: "You are a RevOps Leader. Analyze sales performance across geographic territories. Calculate average deal size, win rate, and sales cycle length per region." },
  // MORE
  { id: "mor_2", category: "More", name: "Synthetic Dataset Agent", desc: "Creates synthetic datasets based on your use case / analysis you want to do", prompt: "You are a Data Engineer. Generate realistic, schema-compliant synthetic mock data that preserves the statistical distributions of the original dataset while ensuring PII privacy." },
];

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  Marketing: <Megaphone className="w-4 h-4" />,
  Finance: <Briefcase className="w-4 h-4" />,
  Product: <Box className="w-4 h-4" />,
  Data: <Database className="w-4 h-4" />,
  RevOps: <Target className="w-4 h-4" />,
  More: <Layers className="w-4 h-4" />
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function AgentsPage() {
  const { toast } = useToast()
  const supabase = createClient()
  
  // Real Backend State
  const [agents, setAgents] = useState<UIAgent[]>([])
  const [availableDatasets, setAvailableDatasets] = useState<DatasetAsset[]>([])
  const [isInitializing, setIsInitializing] = useState(true)
  const [isDeploying, setIsDeploying] = useState(false)
  
  // Tab/Filtering State
  const [activeCategory, setActiveCategory] = useState<Category>('Marketing')
  
  // Modal State
  const [isDeployOpen, setIsDeployOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  
  // Phase 1: Mutually Exclusive Selection (1-to-1)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)

  const templatesInCategory = useMemo(() => TEMPLATES.filter(t => t.category === activeCategory), [activeCategory]);

  // Phase 2: Live Connector Hydration with Supabase Auth
  useEffect(() => {
    async function hydrateDashboard() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit | undefined = session ? { 'Authorization': `Bearer ${session.access_token}` } : undefined

        const [agentsRes, datasetsRes] = await Promise.all([
          fetch('/api/agents/', { headers }),
          fetch('/api/datasets/', { headers })
        ]);
        
        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (datasetsRes.ok) setAvailableDatasets(await datasetsRes.json());
      } catch (err) {
        toast({
          title: "Connection Error",
          description: "Failed to connect to the intelligence engine.",
          variant: "destructive"
        })
      } finally {
        setIsInitializing(false);
      }
    }
    hydrateDashboard();
  }, [supabase.auth, toast]);

  const openDeployModal = (template?: Template) => {
    if (template) {
      setNewName(template.name);
      setNewDescription(template.desc);
      setNewPrompt(template.prompt);
    } else {
      setNewName("");
      setNewDescription("");
      setNewPrompt("");
    }
    setSelectedDatasetId(null);
    setIsDeployOpen(true);
  }

  // Enforces 1-to-1 rule visually in the modal
  const toggleDataset = (id: string) => {
    setSelectedDatasetId(prev => prev === id ? null : id);
  }

  // Phase 2: Real Deployment Wiring with Secure Auth Headers
  const handleDeployAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newPrompt.trim() || !selectedDatasetId) return

    setIsDeploying(true)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      const payload = {
        name: newName.trim(),
        description: newDescription.trim() || "Custom AI Agent",
        role_description: newPrompt.trim(),
        dataset_id: selectedDatasetId,
        temperature: 0.0 // Strict logic preferred for datasets
      }

      const res = await fetch('/api/agents/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(session && { 'Authorization': `Bearer ${session.access_token}` })
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error(await res.text())
      
      const newlyDeployedAgent = await res.json()
      
      // Optimistic Update
      setAgents(prev => [newlyDeployedAgent, ...prev])
      setIsDeployOpen(false)
      
      toast({
        title: "Agent Deployed",
        description: `${newlyDeployedAgent.name} is now online and secured to its memory boundary.`
      })
    } catch (err: any) {
      toast({
        title: "Deployment Failed",
        description: err.message || "An error occurred during provisioning.",
        variant: "destructive"
      })
    } finally {
      setIsDeploying(false)
    }
  }

  const toggleAgentStatus = async (id: string, currentStatus: boolean) => {
    // Optimistic UI toggle
    setAgents(prev => prev.map(a => a.id === id ? { ...a, is_active: !currentStatus } : a))
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(session && { 'Authorization': `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({ is_active: !currentStatus })
      })
      
      if (!res.ok) throw new Error("Failed to update status")
    } catch (err) {
      // Revert on failure
      setAgents(prev => prev.map(a => a.id === id ? { ...a, is_active: currentStatus } : a))
      toast({ title: "Update failed", variant: "destructive" })
    }
  }

  const deleteAgent = async (id: string) => {
    // Optimistic UI deletion
    const previousAgents = [...agents]
    setAgents(prev => prev.filter(a => a.id !== id))
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/agents/${id}`, { 
        method: 'DELETE',
        headers: { ...(session && { 'Authorization': `Bearer ${session.access_token}` }) }
      })
      if (!res.ok) throw new Error("Failed to delete")
      toast({ title: "Agent Terminated" })
    } catch (err) {
      setAgents(previousAgents) // Revert
      toast({ title: "Deletion failed", variant: "destructive" })
    }
  }

  return (
    <div className="flex flex-col gap-10 h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500 bg-[#fafafa] min-h-screen">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-gray-200/60">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            Build agents tailored to your team
          </h1>
          <p className="text-slate-500 mt-2 text-base max-w-2xl font-medium">
            Arcli Agents can be customized to your data structure and the way you do analysis. 
            Select a template below or start from scratch.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-blue-50/50 text-blue-700 border-blue-200/60 hover:bg-blue-100 cursor-pointer px-3 py-1.5 text-sm font-bold transition-colors shadow-sm">
            Customize templates with Enterprise
          </Badge>
          <Button onClick={() => openDeployModal()} className="rounded-xl shadow-md px-6 bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-all">
            <Settings2 className="w-4 h-4 mr-2" /> Create Custom
          </Button>
        </div>
      </div>

      {/* ── SECTION 1: YOUR WORKSPACE ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Your Agents</h2>
        
        {isInitializing ? (
          <div className="w-full h-32 rounded-2xl border border-gray-200/60 bg-gray-50/50 animate-pulse shadow-sm" />
        ) : agents.length === 0 ? (
          <div className="w-full border border-dashed border-gray-300 rounded-3xl p-12 flex flex-col items-center justify-center text-center bg-white shadow-sm">
            <div className="w-14 h-14 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <Bot className="w-7 h-7 text-blue-600" />
            </div>
            <p className="text-slate-900 font-extrabold text-lg">Your custom agents will appear here.</p>
            <p className="text-sm text-slate-500 font-medium mt-1 mb-6 max-w-sm leading-relaxed">
              Create your first specialized agent from the templates below to start unlocking insights.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200/80 bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-slate-50/50 border-b border-gray-200/80">
                <TableRow className="border-none">
                  <TableHead className="w-[300px] text-[11px] font-bold uppercase tracking-widest text-slate-500 py-4">Identity</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-widest text-slate-500 py-4">Status</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-widest text-slate-500 py-4">Memory Boundary</TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-widest text-slate-500 py-4">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100">
                {agents.map((agent) => (
                  <TableRow key={agent.id} className="hover:bg-blue-50/30 transition-colors border-gray-100 group">
                    <TableCell className="py-4 pl-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shadow-sm ${getThemeColor(agent.id)}`} />
                        <div className="flex flex-col">
                          <Link href={`/agents/${agent.id}`} className="font-bold text-slate-900 hover:text-blue-600 transition-colors">
                            {agent.name}
                          </Link>
                          <span className="text-xs font-medium text-slate-500 truncate max-w-[280px] mt-0.5">{agent.description}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={agent.is_active} 
                          onCheckedChange={() => toggleAgentStatus(agent.id, agent.is_active)}
                          className="data-[state=checked]:bg-emerald-500 scale-90 shadow-sm"
                        />
                        {agent.is_active ? 
                          <Badge variant="default" className="bg-emerald-50 text-emerald-700 border-emerald-200 shadow-none font-bold text-[11px]">Active</Badge> : 
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-gray-200 shadow-none font-bold text-[11px]">Paused</Badge> 
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg w-fit">
                        <Database className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-bold">
                          {agent.dataset_id 
                            ? availableDatasets.find(d => d.id === agent.dataset_id)?.name || 'Linked Dataset' 
                            : 'Unrestricted'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-gray-100 rounded-lg">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] bg-white border-gray-200 rounded-xl shadow-lg">
                          <DropdownMenuLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Controls</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-gray-100" />
                          <DropdownMenuItem className="cursor-pointer focus:bg-red-50 text-red-600 font-medium rounded-lg" onClick={() => deleteAgent(agent.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Terminate Agent
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── SECTION 2: TEMPLATE LIBRARY ── */}
      <section className="space-y-6 pt-4 border-t border-gray-200/60">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Templates</h2>
        
        {/* Category Tabs (Pills) */}
        <div className="flex flex-wrap gap-2.5">
          {(['Marketing', 'Finance', 'Product', 'Data', 'RevOps', 'More'] as Category[]).map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 border ${
                activeCategory === category 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                  : 'bg-white text-slate-600 border-gray-200 hover:bg-gray-50 hover:text-slate-900 shadow-sm'
              }`}
            >
              {CATEGORY_ICONS[category]}
              {category}
            </button>
          ))}
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {templatesInCategory.map(template => (
            <div 
              key={template.id} 
              onClick={() => openDeployModal(template)}
              className="group flex flex-col p-6 rounded-2xl border border-gray-200/80 bg-white hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 group-hover:scale-110 group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white transition-all duration-300 shadow-sm">
                  {CATEGORY_ICONS[template.category]}
                </div>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-8 px-4 rounded-xl bg-white border border-gray-200 shadow-sm font-bold text-slate-700 hover:text-blue-700">
                  Use Template
                </Button>
              </div>
              <h3 className="font-extrabold text-base text-slate-900 mb-1.5">{template.name}</h3>
              <p className="text-sm font-medium text-slate-500 line-clamp-2 leading-relaxed">{template.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DEPLOYMENT MODAL ── */}
      <Dialog open={isDeployOpen} onOpenChange={setIsDeployOpen}>
        <DialogContent className="sm:max-w-[650px] bg-white border-gray-200 text-slate-900 p-0 overflow-hidden shadow-2xl rounded-3xl">
          <div className="bg-slate-50 px-6 py-5 border-b border-gray-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 shadow-md shadow-blue-500/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-extrabold text-slate-900">Deploy New Agent</DialogTitle>
              <DialogDescription className="text-sm font-medium text-slate-500 mt-0.5">Define persona, directives, and assign a single 1-to-1 memory boundary.</DialogDescription>
            </div>
          </div>

          <form onSubmit={handleDeployAgent} className="p-6 space-y-7 bg-white">
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2.5">
                <Label htmlFor="name" className="font-bold text-slate-700">Agent Name</Label>
                <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={isDeploying} required className="bg-slate-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl shadow-inner font-medium" />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="desc" className="font-bold text-slate-700">Short Description</Label>
                <Input id="desc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} disabled={isDeploying} className="bg-slate-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl shadow-inner font-medium" />
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt" className="flex items-center gap-2 font-bold text-slate-700">
                  <SquareTerminal className="w-4 h-4 text-blue-600" /> System Prompt (Directives)
                </Label>
                <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">LLM Persona</Badge>
              </div>
              <Textarea 
                id="prompt" 
                className="resize-none h-32 text-sm bg-slate-50 border-gray-200 font-medium leading-relaxed focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl shadow-inner"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                disabled={isDeploying}
                required
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 font-bold text-slate-700">
                  <FileBox className="w-4 h-4 text-blue-600" /> Memory Boundary (Dataset)
                </Label>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 uppercase tracking-wider shadow-sm">
                  Strict 1-to-1 Target
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
                {availableDatasets.length === 0 ? (
                  <div className="col-span-2 flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-dashed border-gray-300 text-center">
                    <Database className="w-8 h-8 text-slate-300 mb-3" />
                    <p className="text-base text-slate-900 font-bold">No active integrations found</p>
                    <p className="text-sm text-slate-500 font-medium mb-4 max-w-[250px]">You need to connect a data source before an agent can analyze it.</p>
                    <Link href="/datasets">
                      <Button variant="outline" size="sm" className="rounded-xl font-bold bg-white shadow-sm border-gray-200 hover:bg-slate-50 hover:text-blue-600 group">
                        Go to Datasets <ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  availableDatasets.map(ds => {
                    const isSelected = selectedDatasetId === ds.id;
                    return (
                      <div 
                        key={ds.id} 
                        onClick={() => !isDeploying && toggleDataset(ds.id)}
                        className={`cursor-pointer flex flex-col p-3.5 rounded-xl border-2 transition-all duration-200 
                          ${isSelected ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'}`}
                      >
                        <div className="flex items-start justify-between">
                          <Database className={`w-4.5 h-4.5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                          <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-200'}`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <span className={`text-sm font-bold mt-2.5 truncate ${isSelected ? 'text-blue-950' : 'text-slate-700'}`}>{ds.name}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <DialogFooter className="mt-8 pt-5 border-t border-gray-100 flex items-center justify-between w-full">
              <div className="flex-1">
                {/* QoL validation warning if fields are filled but dataset is missing */}
                {!selectedDatasetId && newName.trim() && availableDatasets.length > 0 && (
                  <span className="text-xs text-rose-500 font-bold flex items-center gap-1.5 animate-in fade-in">
                    ⚠️ Select a memory boundary to continue
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsDeployOpen(false)} disabled={isDeploying} className="font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl">
                  Cancel
                </Button>
                {/* STRICT 1-TO-1 VALIDATION APPLIED HERE */}
                <Button 
                  type="submit" 
                  disabled={isDeploying || !newName.trim() || !newPrompt.trim() || !selectedDatasetId} 
                  className="rounded-xl px-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all"
                >
                  {isDeploying ? <Cpu className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isDeploying ? "Deploying..." : "Deploy Agent"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}