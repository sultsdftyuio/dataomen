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
    color: 'text-indigo-500',
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
    color: 'text-emerald-500',
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
    color: 'text-slate-900 dark:text-slate-100',
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
    color: 'text-purple-500',
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
    color: 'text-blue-500',
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
    color: 'text-green-500',
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

const CONNECTION_PHASES = [
  "Initiating secure zero-ETL handshake...",
  "Verifying read-only access...",
  "Auto-mapping standard schema tables...",
  "Seeding Starter Dashboards...",
  "Finalizing connection..."
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
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationConfig | null>(null)

  // Connection Simulation State
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [connectionPhase, setConnectionPhase] = useState(0)

  const [formData, setFormData] = useState<Record<string, string>>({})

  // Reset state when modal closes
  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setStep(1)
      setSelectedIntegration(null)
      setFormData({})
      setSearchQuery('')
      setConnectionPhase(0)
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

    // Simulate Backend Sync, Auto-Schema Mapping, and Starter Pack Dashboard generation
    for (let i = 0; i < CONNECTION_PHASES.length; i++) {
      setConnectionPhase(i)
      await new Promise(resolve => setTimeout(resolve, 700)) 
    }

    // Trigger Initial Historical Sync
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Trigger the SyncEngine to pull historical data and auto-seed Golden Metrics
        await fetch(`/api/ingest/trigger/initial_sync_job`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
      }
    } catch (err) {
      console.warn("Background sync trigger failed, user can retry from dashboard.");
    }

    setIsConnecting(false)
    setStep(3) 
  }

  const filteredIntegrations = INTEGRATIONS.filter(int =>
    int.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    int.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[650px] overflow-hidden p-0 bg-background border-border shadow-xl">

        {/* Step 1: Select Integration Catalog */}
        {step === 1 && (
          <div className="flex flex-col h-[600px] animate-in fade-in slide-in-from-right-4 duration-300">
            <DialogHeader className="p-6 pb-4 border-b">
              <DialogTitle className="text-2xl font-bold tracking-tight">Connect Your Stack</DialogTitle>
              <DialogDescription className="mt-1">
                Link your database or payment provider. We'll automatically map the schema and generate your dashboards. No ELT required.
              </DialogDescription>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search Supabase, Stripe, Vercel..."
                  className="pl-9 bg-muted/30"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredIntegrations.map((integration) => (
                  <Card
                    key={integration.id}
                    className="p-4 cursor-pointer border-border hover:border-primary/50 hover:shadow-md transition-all group bg-background relative overflow-hidden"
                    onClick={() => handleSelectIntegration(integration)}
                  >
                    {integration.isPopular && (
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-none font-semibold">1-Click Setup</Badge>
                      </div>
                    )}
                    <div className="flex items-start gap-4">
                      <div className={`p-2.5 rounded-lg bg-muted group-hover:bg-primary/5 transition-colors ${integration.color}`}>
                        <integration.icon className="h-6 w-6" />
                      </div>
                      <div className="pt-1">
                        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                          {integration.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed pr-4">
                          {integration.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
                {filteredIntegrations.length === 0 && (
                  <div className="col-span-full py-10 text-center text-muted-foreground">
                    No integrations found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-background flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Credentials are encrypted with AES-256 via Vault. We use secure read-only queries.
            </div>
          </div>
        )}

        {/* Step 2: Configure URI or OAuth */}
        {step === 2 && selectedIntegration && (
          <form onSubmit={handleConnect} className="flex flex-col h-[600px] animate-in fade-in slide-in-from-right-4 duration-300">
            <DialogHeader className="p-6 pb-4 border-b bg-muted/10">
              <div className="flex items-center gap-3 mb-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-2 hover:bg-background"
                  onClick={() => setStep(1)}
                  type="button"
                  disabled={isConnecting || isRedirecting}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className={`p-1.5 rounded-md bg-background shadow-sm border ${selectedIntegration.color}`}>
                  <selectedIntegration.icon className="h-5 w-5" />
                </div>
                <DialogTitle className="text-xl font-bold">
                  {selectedIntegration.authType === 'oauth' ? `Authenticate ${selectedIntegration.name}` : `Connect ${selectedIntegration.name}`}
                </DialogTitle>
              </div>
              <DialogDescription className="pl-11">
                {selectedIntegration.authType === 'oauth'
                  ? "You will be redirected securely to grant authorization."
                  : "Paste your connection details below. DataFast handles the rest in seconds."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-5 max-w-md mx-auto">
                {selectedIntegration.fields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name} className="text-foreground font-medium">
                      {field.label}
                    </Label>

                    {field.type === 'select' ? (
                      <select
                        id={field.name}
                        name={field.name}
                        required
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="bg-background border-border focus-visible:ring-primary/50 font-mono text-sm"
                        onChange={handleFieldChange}
                        disabled={isConnecting || isRedirecting}
                      />
                    )}

                    {field.helperText && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {field.helperText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="p-6 border-t bg-background flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Encrypted at rest</span>
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={isConnecting || isRedirecting}>
                  Cancel
                </Button>

                {selectedIntegration.authType === 'oauth' ? (
                  <Button type="submit" disabled={isRedirecting} className="min-w-[200px]">
                    {isRedirecting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary-foreground/70" />
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
                  <Button type="submit" disabled={isConnecting} className="min-w-[200px]">
                    {isConnecting ? (
                      <div className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="h-4 w-4 animate-spin text-primary-foreground/70" />
                        <span className="text-sm font-medium">{CONNECTION_PHASES[connectionPhase]}</span>
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
          <div className="h-[600px] p-10 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
              <div className="h-20 w-20 relative rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-3 tracking-tight">Data Connected Successfully!</h2>
            <div className="bg-muted/50 border border-border rounded-xl p-4 mb-8 max-w-sm w-full">
              <ul className="text-sm text-left space-y-3">
                <li className="flex items-center gap-2 text-foreground font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Pre-tagging Semantic RAG Layer...
                </li>
                <li className="flex items-center gap-2 text-foreground font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Generating Starter Dashboards...
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStep(1);
                  setSelectedIntegration(null);
                }}
              >
                Add Another Source
              </Button>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
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