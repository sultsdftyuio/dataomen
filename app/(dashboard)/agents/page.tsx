'use client'

import React, { useState, useMemo } from 'react'
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
  Settings2
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
  system_prompt: string;
  dataset_ids: string[];
  created_at: string;
  status: 'Active' | 'Paused' | 'Deploying';
  themeColor: string;
}

const MOCK_DATASETS = [
  { id: "ds_stripe_prod", name: "Stripe Production", type: "PostgreSQL" },
  { id: "ds_hubspot_crm", name: "HubSpot CRM", type: "API Sync" },
  { id: "ds_app_telemetry", name: "App Telemetry", type: "Parquet" },
];

const THEME_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-cyan-500']

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
  { id: "mkt_4", category: "Marketing", name: "Cohort Analysis Agent", desc: "Tracks customer retention, revenue patterns, and behavior trends over time", prompt: "Generate cohort retention matrices. Analyze how user behavior and LTV evolve based on their acquisition month and first-action triggers." },
  { id: "mkt_5", category: "Marketing", name: "Email Performance Agent", desc: "Analyzes email campaign metrics, engagement patterns, and subscriber trends", prompt: "Analyze open rates, click-through rates, and unsubscribe patterns across email campaigns. Correlate subject line strategies with conversion spikes." },
  { id: "mkt_6", category: "Marketing", name: "A/B Test Analysis Agent", desc: "Analyzes experiment results and determines statistical significance", prompt: "You are an Experimentation Data Scientist. Evaluate A/B test variants. Calculate p-values, confidence intervals, and declare definitive winners." },
  { id: "mkt_7", category: "Marketing", name: "Marketing Mix Modeling Agent", desc: "Measures marketing channel impact and forecasts performance", prompt: "Use regression models to measure the incremental impact of various marketing channels on total sales, accounting for seasonality and external factors." },
  { id: "mkt_8", category: "Marketing", name: "Marketing Attribution Agent", desc: "Attributes conversions across marketing touchpoints to measure contribution", prompt: "Apply multi-touch attribution models (first-touch, last-touch, linear, time-decay) to accurately distribute credit for user conversions." },
  { id: "mkt_9", category: "Marketing", name: "Content Performance Agent", desc: "Analyze which content drives engagement, conversions, and ROI", prompt: "Evaluate blog, video, and social content performance. Correlate content topics and formats with downstream user acquisition and retention." },

  // FINANCE
  { id: "fin_1", category: "Finance", name: "Expense Category Analysis Agent", desc: "Automatically categorize and analyze company spending patterns efficiently", prompt: "You are a Corporate Controller. Categorize line-item expenses, identify anomalous spending, and track departmental burn rates against historical averages." },
  { id: "fin_2", category: "Finance", name: "Financial Statement Agent", desc: "Analyze income statements, balance sheets, and cash flow instantly", prompt: "Analyze core financial statements. Calculate gross margin, EBITDA, and working capital ratios. Flag liquidity risks." },
  { id: "fin_3", category: "Finance", name: "Cash Flow Agent", desc: "Predict future cash positions and identify potential shortfalls", prompt: "Forecast 30, 60, and 90-day cash flow based on historical receivables, payables, and recurring revenue schedules." },
  { id: "fin_4", category: "Finance", name: "Budget vs Actual Agent", desc: "Track spending against budgets and identify variances automatically", prompt: "Compare actual ledger expenses against projected departmental budgets. Highlight significant positive and negative variances." },

  // PRODUCT
  { id: "prd_1", category: "Product", name: "Product Engagement Agent", desc: "Measure user engagement patterns and identify drivers of active usage", prompt: "You are a Product Manager. Analyze event telemetry to determine Daily Active Users (DAU) / Monthly Active Users (MAU) ratios and core loop completion." },
  { id: "prd_2", category: "Product", name: "User Retention Agent", desc: "Analyze retention curves and identify what keeps users coming back", prompt: "Plot user retention curves. Identify the specific feature interactions in a user's first 7 days that correlate most strongly with long-term retention." },
  { id: "prd_3", category: "Product", name: "Churn Analysis Agent", desc: "Identify churn patterns and predict at-risk users before they leave", prompt: "Analyze trailing indicators of churn. Identify drop-offs in usage frequency and predict which current users are highly likely to cancel their subscriptions." },
  { id: "prd_4", category: "Product", name: "Feature Adoption Agent", desc: "Track feature usage and identify adoption barriers across user base", prompt: "Measure feature discoverability and time-to-first-use. Identify which segments of users are ignoring new feature releases." },

  // DATA
  { id: "dat_1", category: "Data", name: "Trend Analysis Agent", desc: "Identify trends, growth patterns, and seasonality in your metrics", prompt: "You are a Data Scientist. Perform time-series decomposition. Extract underlying trends, cyclical seasonality, and irregular noise from core business metrics." },
  { id: "dat_2", category: "Data", name: "Data Exploration Agent", desc: "Automatically profile and explore datasets with comprehensive statistical analysis", prompt: "Perform exploratory data analysis (EDA). Generate distribution shapes, missing value counts, and correlation matrices for all numerical columns." },
  { id: "dat_3", category: "Data", name: "Model Performance Agent", desc: "Track ML model metrics, drift, and performance over time", prompt: "Monitor model endpoints. Calculate precision, recall, F1-score, and identify conceptual or data drift in incoming inference requests." },
  { id: "dat_4", category: "Data", name: "Summary Statistics Agent", desc: "Generate comprehensive statistical summaries and data profiles instantly", prompt: "Calculate mean, median, mode, standard deviation, variance, and interquartile ranges for all quantitative fields in the dataset." },
  { id: "dat_5", category: "Data", name: "Comparison Agent", desc: "Compare datasets, metrics, and segments to identify key differences", prompt: "Run cross-sectional analysis between two distinct user groups or time periods. Highlight the statistically significant differences." },
  { id: "dat_6", category: "Data", name: "Data Quality Agent", desc: "Monitor data quality issues and identify anomalies automatically", prompt: "You are a Data Steward. Scan databases for nulls, duplicate primary keys, schema violations, and anomalous outliers." },

  // REVOPS
  { id: "rev_1", category: "RevOps", name: "Sales Territory Agent", desc: "Compare territories and identify top performers across regions", prompt: "You are a RevOps Leader. Analyze sales performance across geographic territories. Calculate average deal size, win rate, and sales cycle length per region." },
  { id: "rev_2", category: "RevOps", name: "Win/Loss Analysis Agent", desc: "Uncover why deals are won or lost systematically", prompt: "Analyze CRM opportunity data. Identify the primary objection categories for lost deals and the key feature drivers for won deals." },
  { id: "rev_3", category: "RevOps", name: "Rep Productivity Agent", desc: "Analyze rep performance and identify productivity drivers", prompt: "Track sales rep activity metrics (calls, emails, meetings) against pipeline generated and revenue closed. Identify efficiency bottlenecks." },
  { id: "rev_4", category: "RevOps", name: "Sales Forecasting Agent", desc: "Predict revenue and identify forecast risks with data-driven projections", prompt: "Use historical win rates and current pipeline stages to generate a probabilistic revenue forecast for the current quarter." },
  { id: "rev_5", category: "RevOps", name: "Sales Pipeline Health Agent", desc: "Diagnose pipeline bottlenecks and forecast deal closure", prompt: "Evaluate pipeline coverage ratios, stage-to-stage conversion rates, and stagnant deals that have exceeded average time-in-stage." },
  { id: "rev_6", category: "RevOps", name: "Lead Scoring and Qualification Agent", desc: "Prioritize leads based on conversion likelihood and value", prompt: "Develop a dynamic lead scoring model based on firmographics and behavioral intent signals to route high-propensity leads to sales." },

  // MORE
  { id: "mor_1", category: "More", name: "Meta Ads Expert", desc: "Analyzes Meta campaigns, identifies optimization opportunities, and scales profitable ads", prompt: "You are a Meta Ads Media Buyer. Analyze ROAS, CPM, and creative fatigue across Facebook/Instagram campaigns. Recommend scaling or cutting ad sets." },
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
  const [agents, setAgents] = useState<UIAgent[]>([])
  
  // Tab/Filtering State
  const [activeCategory, setActiveCategory] = useState<Category>('Marketing')
  
  // Modal State
  const [isDeployOpen, setIsDeployOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set())

  const templatesInCategory = useMemo(() => TEMPLATES.filter(t => t.category === activeCategory), [activeCategory]);

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
    setSelectedDatasets(new Set());
    setIsDeployOpen(true);
  }

  const toggleDataset = (id: string) => {
    const next = new Set(selectedDatasets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDatasets(next);
  }

  const handleDeployAgent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newPrompt.trim()) return

    const randomColor = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)]

    const newAgent: UIAgent = {
      id: `agent_${Date.now()}`,
      name: newName.trim(),
      description: newDescription.trim() || "Custom AI Agent",
      system_prompt: newPrompt.trim(),
      dataset_ids: Array.from(selectedDatasets),
      created_at: new Date().toISOString(),
      status: 'Deploying', 
      themeColor: randomColor,
    }

    setAgents(prev => [newAgent, ...prev])
    setIsDeployOpen(false)

    // Simulate deployment completion
    setTimeout(() => {
      setAgents(prev => prev.map(a => a.id === newAgent.id ? { ...a, status: 'Active' } : a))
    }, 2500)
  }

  const toggleAgentStatus = (id: string, currentStatus: string) => {
    if (currentStatus === 'Deploying') return; 
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
  }

  const deleteAgent = (id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="flex flex-col gap-10 h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            Build agents tailored to your team
          </h1>
          <p className="text-muted-foreground mt-2 text-base max-w-2xl">
            Arcli Agents can be customized to your data structure and the way you do analysis. 
            Select a template below or start from scratch.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer px-3 py-1 text-sm font-medium transition-colors">
            Customize templates with Enterprise
          </Badge>
          <Button onClick={() => openDeployModal()} className="rounded-full shadow-sm px-6">
            <Settings2 className="w-4 h-4 mr-2" /> Create Custom
          </Button>
        </div>
      </div>

      {/* ── SECTION 1: YOUR WORKSPACE ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Your Agents</h2>
        
        {agents.length === 0 ? (
          <div className="w-full border border-dashed border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center bg-muted/10">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <Bot className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">Your custom agents will appear here.</p>
            <p className="text-sm text-muted-foreground/70 mt-1 mb-6">Create your first agent from the templates below to get started.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/30 border-b border-border">
                <TableRow className="border-none">
                  <TableHead className="w-[300px] text-xs font-bold uppercase tracking-widest text-muted-foreground">Identity</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Memory / Context</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {agents.map((agent) => (
                  <TableRow key={agent.id} className="hover:bg-muted/50 transition-colors border-border/60 group">
                    <TableCell className="py-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-2 h-2 rounded-full shadow-sm ${agent.themeColor}`} />
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{agent.name}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[250px] mt-1">{agent.description}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={agent.status === 'Active'} 
                          disabled={agent.status === 'Deploying'}
                          onCheckedChange={() => toggleAgentStatus(agent.id, agent.status)}
                          className="data-[state=checked]:bg-primary scale-90 shadow-sm"
                        />
                        {agent.status === 'Active' ? <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-none">Active</Badge> : 
                         agent.status === 'Paused' ? <Badge variant="secondary" className="shadow-none">Paused</Badge> : 
                         <Badge variant="outline" className="text-amber-600 border-amber-500/20 bg-amber-500/10 shadow-none"><Cpu className="w-3 h-3 mr-1.5 animate-pulse" /> Deploying</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{agent.dataset_ids.length} Datasets</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] bg-popover border-border rounded-xl shadow-xl">
                          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Controls</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer focus:bg-destructive/10 text-destructive" onClick={() => deleteAgent(agent.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Agent
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
      <section className="space-y-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Templates</h2>
        
        {/* Category Tabs (Pills) */}
        <div className="flex flex-wrap gap-2">
          {(['Marketing', 'Finance', 'Product', 'Data', 'RevOps', 'More'] as Category[]).map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-all duration-200 border ${
                activeCategory === category 
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                  : 'bg-background text-foreground border-border hover:bg-muted'
              }`}
            >
              {CATEGORY_ICONS[category]}
              {category}
            </button>
          ))}
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templatesInCategory.map(template => (
            <div 
              key={template.id} 
              onClick={() => openDeployModal(template)}
              className="group flex flex-col p-5 rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all cursor-pointer shadow-sm hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  {CATEGORY_ICONS[template.category]}
                </div>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-3 rounded-full bg-background border shadow-sm">
                  Use Template
                </Button>
              </div>
              <h3 className="font-bold text-base text-foreground mb-1">{template.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{template.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DEPLOYMENT MODAL ── */}
      <Dialog open={isDeployOpen} onOpenChange={setIsDeployOpen}>
        <DialogContent className="sm:max-w-[650px] bg-background border-border text-foreground p-0 overflow-hidden shadow-2xl">
          <div className="bg-muted/30 px-6 py-4 border-b border-border flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Configure Agent</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">Define persona, strict directives, and data memory.</DialogDescription>
            </div>
          </div>

          <form onSubmit={handleDeployAgent} className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Agent Name</Label>
                <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} required className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Short Description</Label>
                <Input id="desc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="bg-background" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt" className="flex items-center gap-2">
                  <SquareTerminal className="w-4 h-4 text-primary" /> System Prompt (Directives)
                </Label>
                <Badge variant="secondary" className="text-[10px] font-mono">LLM Persona</Badge>
              </div>
              <Textarea 
                id="prompt" 
                className="resize-none h-32 text-sm bg-background/50 font-mono leading-relaxed focus-visible:ring-primary/50"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                required
              />
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <FileBox className="w-4 h-4 text-muted-foreground" /> Memory Boundaries (Datasets)
              </Label>
              <div className="grid gap-2 border border-border p-2 rounded-xl bg-muted/20 max-h-40 overflow-y-auto">
                {MOCK_DATASETS.map(ds => (
                  <div key={ds.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{ds.name}</span>
                        <span className="text-[10px] text-muted-foreground">{ds.type}</span>
                      </div>
                    </div>
                    <Switch checked={selectedDatasets.has(ds.id)} onCheckedChange={() => toggleDataset(ds.id)} className="data-[state=checked]:bg-primary" />
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-8 pt-4 border-t border-border flex items-center justify-between w-full">
              <Button type="button" variant="ghost" onClick={() => setIsDeployOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!newName.trim() || !newPrompt.trim()} className="rounded-full px-8">Deploy Agent</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}