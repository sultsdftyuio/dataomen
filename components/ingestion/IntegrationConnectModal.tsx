'use client'

import React, { useState } from 'react'
import {
  Database,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ShieldCheck,
  Search,
  Lock,
  ShoppingBag,
  ExternalLink,
  CreditCard,
  Zap,        // For Vercel
  Droplet,    // For Lemon Squeezy
  Server,     // For Render/Railway
  Box         // For Supabase
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createClient } from '@/utils/supabase/client' 
import { useToast } from '@/components/ui/use-toast'

// -----------------------------------------------------------------------------
// Type Safety & Configuration
// -----------------------------------------------------------------------------
type IntegrationType = 'supabase' | 'vercel' | 'railway' | 'render' | 'stripe' | 'lemonsqueezy' | 'postgres' | 'shopify'
type AuthParadigm = 'credentials' | 'oauth' | 'uri'

interface SelectOption {
  label: string;
  value: string;
}

interface IntegrationField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  helperText?: string;
  options?: SelectOption[]; 
}

interface IntegrationConfig {
  id: IntegrationType;
  name: string;
  category: 'Database' | 'Payment Provider' | 'E-commerce';
  authType: AuthParadigm;
  description: string;
  icon: React.ElementType;
  color: string;
  isPopular?: boolean;
  fields: IntegrationField[];
}

// -----------------------------------------------------------------------------
// Phase 1: The "Indie Stack" Integration Catalog
// Frictionless URI & OAuth connections for solo founders.
// -----------------------------------------------------------------------------
const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Payment Provider',
    authType: 'credentials',
    description: '1-click connect for MRR, churn, and subscription RAG dashboards.',
    icon: CreditCard,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    isPopular: true,
    fields: [
      {
        name: 'api_key',
        label: 'Restricted API Key',
        type: 'password',
        placeholder: 'rk_live_...',
        helperText: 'Create a restricted key in Stripe with read-only access to Customers and Subscriptions.'
      },
    ]
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'Database',
    authType: 'uri',
    description: 'Instantly connect your production Supabase PostgreSQL database.',
    icon: Box,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    isPopular: true,
    fields: [
      { 
        name: 'connection_string', 
        label: 'Connection String (URI)', 
        type: 'password', 
        placeholder: 'postgresql://postgres.[ref]:[password]@aws-0-region.pooler.supabase.com:6543/postgres',
        helperText: 'Paste your direct or pooled connection string from Supabase Database settings.' 
      },
    ]
  },
  {
    id: 'vercel',
    name: 'Vercel Postgres',
    category: 'Database',
    authType: 'uri',
    description: 'Sync users and events directly from your Vercel-hosted DB.',
    icon: Zap,
    color: 'text-slate-900 bg-slate-100 border-slate-200',
    isPopular: true,
    fields: [
      { 
        name: 'connection_string', 
        label: 'POSTGRES_URL', 
        type: 'password', 
        placeholder: 'postgres://default:***@ep-mute-***.us-east-1.aws.neon.tech:5432/verceldb',
        helperText: 'Copy the POSTGRES_URL from your Vercel project storage settings.' 
      },
    ]
  },
  {
    id: 'lemonsqueezy',
    name: 'Lemon Squeezy',
    category: 'Payment Provider',
    authType: 'credentials',
    description: 'Sync software sales, licenses, and affiliate data.',
    icon: Droplet,
    color: 'text-purple-600 bg-purple-50 border-purple-100',
    fields: [
      { 
        name: 'api_key', 
        label: 'API Key', 
        type: 'password', 
        placeholder: 'eyJ0eXAiOiJKV1QiLCJhbG...',
        helperText: 'Generate an API key from your Lemon Squeezy Settings > API.' 
      },
    ]
  },
  {
    id: 'railway',
    name: 'Railway / Render',
    category: 'Database',
    authType: 'uri',
    description: 'Connect standard managed PostgreSQL databases instantly.',
    icon: Server,
    color: 'text-blue-600 bg-blue-50 border-blue-100',
    fields: [
      { 
        name: 'connection_string', 
        label: 'External Database URL', 
        type: 'password', 
        placeholder: 'postgresql://user:pass@host:port/db',
        helperText: 'Paste your full external database URL. Ensure Arcli IPs are allowed.' 
      },
    ]
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'E-commerce',
    authType: 'oauth',
    description: 'Sync high-frequency e-commerce orders and customers.',
    icon: ShoppingBag,
    color: 'text-green-600 bg-green-50 border-green-100',
    fields: [
      { 
        name: 'shop_url', 
        label: 'Shop Domain', 
        type: 'text', 
        placeholder: 'my-store.myshopify.com', 
        helperText: 'Enter your exact myshopify.com domain to initiate the secure OAuth flow.' 
      },
    ]
  }
]

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
interface IntegrationConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function IntegrationConnectModal({ isOpen, onClose, onSuccess }: IntegrationConnectModalProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationConfig | null>(null)

  // Connection State
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)

  const [formData, setFormData] = useState<Record<string, string>>({})

  // Reset state when modal closes
  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setStep(1)
      setSelectedIntegration(null)
      setFormData({})
      setSearchQuery('')
      setIsConnecting(false)
      setIsRedirecting(false)
    }, 300)
  }

  const handleSelectIntegration = (integration: IntegrationConfig) => {
    setSelectedIntegration(integration)
    const defaults: Record<string, string> = {}
    integration.fields.forEach(f => {
      if (f.type === 'select' && f.options?.length) {
        defaults[f.name] = f.options[0].value
      }
    })
    setFormData(defaults)
    setStep(2)
  }

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedIntegration) return;

    // Route: OAuth App flow
    if (selectedIntegration.authType === 'oauth') {
      setIsRedirecting(true)
      await new Promise(resolve => setTimeout(resolve, 1500))
      // In production: window.location.href = data.oauthUrl;
      setStep(3)
      return;
    }

    // Route: Direct Database / URI flow
    setIsConnecting(true)

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) throw new Error("Authentication required");

      // 1. Send encrypted credentials to the actual backend
      const response = await fetch('/api/v1/integrations/connect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connector_id: selectedIntegration.id,
          credentials: formData
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to connect to data source");
      }

      // 2. Trigger Initial Historical Sync
      await fetch(`/api/ingest/trigger/initial_sync_job`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      setStep(3); // Move to success state
    } catch (err: any) {
      console.error("Connection failed:", err);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: err.message || "Could not securely connect to the integration. Please check your credentials.",
      });
    } finally {
      setIsConnecting(false)
    }
  }

  const filteredIntegrations = INTEGRATIONS.filter(int =>
    int.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    int.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[650px] overflow-hidden p-0 bg-white border-gray-200/80 shadow-2xl rounded-3xl">

        {/* Step 1: Select Integration Catalog */}
        {step === 1 && (
          <div className="flex flex-col h-[600px] animate-in fade-in slide-in-from-right-4 duration-300">
            <DialogHeader className="p-6 pb-5 border-b border-gray-100 bg-slate-50/50">
              <DialogTitle className="text-2xl font-extrabold tracking-tight text-slate-900">Connect Your Stack</DialogTitle>
              <DialogDescription className="mt-1 font-medium text-slate-500">
                Link your database or payment provider. We'll automatically map the schema and generate your dashboards. No ELT required.
              </DialogDescription>
              <div className="relative mt-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search Supabase, Stripe, Vercel..."
                  className="pl-9 bg-white border-gray-200 focus-visible:ring-blue-500/20 shadow-inner rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredIntegrations.map((integration) => (
                  <Card
                    key={integration.id}
                    className="p-5 cursor-pointer border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group bg-white shadow-sm relative overflow-hidden rounded-2xl"
                    onClick={() => handleSelectIntegration(integration)}
                  >
                    {integration.isPopular && (
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-bold shadow-sm uppercase tracking-wider">1-Click Setup</Badge>
                      </div>
                    )}
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl border group-hover:scale-105 transition-transform shadow-sm ${integration.color}`}>
                        <integration.icon className="h-6 w-6" />
                      </div>
                      <div className="pt-1.5">
                        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                          {integration.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed pr-4">
                          {integration.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
                {filteredIntegrations.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-gray-200 rounded-2xl font-medium">
                    No integrations found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-white flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              Credentials are encrypted with AES-256 via Vault. We use secure read-only queries.
            </div>
          </div>
        )}

        {/* Step 2: Configure URI or OAuth */}
        {step === 2 && selectedIntegration && (
          <form onSubmit={handleConnect} className="flex flex-col h-[600px] animate-in fade-in slide-in-from-right-4 duration-300">
            <DialogHeader className="p-6 pb-5 border-b border-gray-100 bg-slate-50/50">
              <div className="flex items-center gap-3 mb-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 -ml-2 hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm transition-all rounded-xl"
                  onClick={() => setStep(1)}
                  type="button"
                  disabled={isConnecting || isRedirecting}
                >
                  <ChevronLeft className="h-5 w-5 text-slate-600" />
                </Button>
                <div className={`p-2 rounded-xl border shadow-sm ${selectedIntegration.color}`}>
                  <selectedIntegration.icon className="h-5 w-5" />
                </div>
                <DialogTitle className="text-xl font-extrabold text-slate-900">
                  {selectedIntegration.authType === 'oauth' ? `Authenticate ${selectedIntegration.name}` : `Connect ${selectedIntegration.name}`}
                </DialogTitle>
              </div>
              <DialogDescription className="pl-14 font-medium text-slate-500">
                {selectedIntegration.authType === 'oauth'
                  ? "You will be redirected securely to grant authorization."
                  : "Paste your connection details below. Arcli handles the rest in seconds."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 bg-white">
              <div className="space-y-6 max-w-md mx-auto">
                {selectedIntegration.fields.map((field) => (
                  <div key={field.name} className="space-y-2.5">
                    <Label htmlFor={field.name} className="text-slate-700 font-bold">
                      {field.label}
                    </Label>

                    {field.type === 'select' ? (
                      <select
                        id={field.name}
                        name={field.name}
                        required
                        className="flex h-11 w-full rounded-xl border border-gray-200 bg-slate-50 px-3 py-2 text-sm font-medium shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={handleFieldChange}
                        disabled={isConnecting || isRedirecting}
                        value={formData[field.name] || ''}
                      >
                        {field.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={field.name}
                        name={field.name}
                        type={field.type}
                        placeholder={field.placeholder}
                        required
                        className="h-11 bg-slate-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 font-mono text-sm shadow-inner rounded-xl"
                        onChange={handleFieldChange}
                        disabled={isConnecting || isRedirecting}
                      />
                    )}

                    {field.helperText && (
                      <p className="text-[11px] font-medium text-slate-400 mt-1.5 leading-relaxed">
                        {field.helperText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="p-6 border-t border-gray-100 bg-slate-50/50 flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Encrypted at rest</span>
              </div>

              <div className="flex gap-3 w-full sm:w-auto">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={isConnecting || isRedirecting} className="font-bold text-slate-600 hover:text-slate-900 rounded-xl">
                  Cancel
                </Button>

                {selectedIntegration.authType === 'oauth' ? (
                  <Button type="submit" disabled={isRedirecting} className="min-w-[200px] rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20">
                    {isRedirecting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                        Redirecting...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        Connect {selectedIntegration.name}
                        <ExternalLink className="h-4 w-4" />
                      </div>
                    )}
                  </Button>
                ) : (
                  <Button type="submit" disabled={isConnecting} className="min-w-[200px] rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20">
                    {isConnecting ? (
                      <div className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                        <span className="text-sm font-bold">Securing connection...</span>
                      </div>
                    ) : (
                      <>
                        Test & Connect
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        )}

        {/* Step 3: Success State & Auto-Seeding Message */}
        {step === 3 && (
          <div className="h-[600px] p-10 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500 bg-white">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-emerald-400/20 rounded-full blur-2xl animate-pulse" />
              <div className="h-24 w-24 relative rounded-full bg-emerald-50 border border-emerald-100 shadow-sm flex items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold mb-3 tracking-tight text-slate-900">Data Connected Successfully!</h2>
            <div className="bg-slate-50 border border-gray-200 rounded-2xl p-5 mb-10 max-w-sm w-full shadow-inner">
              <ul className="text-sm text-left space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-bold">
                  <div className="p-1 bg-emerald-100 rounded-full"><CheckCircle2 className="h-3 w-3 text-emerald-600" /></div>
                  Pre-tagging Semantic RAG Layer...
                </li>
                <li className="flex items-center gap-3 text-slate-700 font-bold">
                  <div className="p-1 bg-emerald-100 rounded-full"><CheckCircle2 className="h-3 w-3 text-emerald-600" /></div>
                  Generating Starter Dashboards...
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button
                variant="outline"
                className="w-full rounded-xl font-bold border-gray-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm"
                onClick={() => {
                  setStep(1);
                  setSelectedIntegration(null);
                }}
              >
                Add Another Source
              </Button>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20"
                onClick={() => {
                  onSuccess?.();
                  handleClose();
                }}
              >
                View Your Dashboard
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}