'use client'

import React, { useState, useEffect } from 'react'
import { 
  Database, 
  HardDrive, 
  FileSpreadsheet, 
  RefreshCw, 
  ArrowRight, 
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ShieldCheck,
  Snowflake,
  Search,
  Lock,
  ShoppingBag,
  Cloud,
  ExternalLink
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

// -----------------------------------------------------------------------------
// Type Safety & Configuration
// -----------------------------------------------------------------------------
type IntegrationType = 'postgres' | 'snowflake' | 'stripe' | 's3' | 'duckdb' | 'shopify' | 'salesforce'
type AuthParadigm = 'credentials' | 'oauth' | 'file'

interface SelectOption {
  label: string;
  value: string;
}

interface IntegrationField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'file' | 'select';
  placeholder?: string;
  helperText?: string;
  options?: SelectOption[]; // For dynamic dropdowns
}

interface IntegrationConfig {
  id: IntegrationType;
  name: string;
  category: 'Database' | 'SaaS API' | 'Data Lake' | 'Local';
  authType: AuthParadigm;
  description: string;
  icon: React.ElementType;
  color: string;
  isPopular?: boolean;
  fields: IntegrationField[];
}

// -----------------------------------------------------------------------------
// Modular Integration Catalog
// -----------------------------------------------------------------------------
const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: 'snowflake',
    name: 'Snowflake',
    category: 'Database',
    authType: 'credentials',
    description: 'Connect your enterprise cloud data warehouse natively.',
    icon: Snowflake,
    color: 'text-sky-400',
    isPopular: true,
    fields: [
      { name: 'account', label: 'Account Identifier', type: 'text', placeholder: 'xy12345.us-east-1' },
      { name: 'warehouse', label: 'Warehouse', type: 'text', placeholder: 'COMPUTE_WH' },
      { name: 'database', label: 'Database', type: 'text', placeholder: 'ANALYTICS_DB' },
      { name: 'user', label: 'Username', type: 'text', placeholder: 'dataomen_role' },
      { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ]
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'SaaS API',
    authType: 'oauth',
    description: 'Sync high-frequency e-commerce orders and customers.',
    icon: ShoppingBag,
    color: 'text-green-500',
    isPopular: true,
    fields: [
      { name: 'shop_url', label: 'Shop Domain', type: 'text', placeholder: 'my-store.myshopify.com', helperText: 'Enter your exact myshopify.com domain to initiate the secure OAuth flow.' },
    ]
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    category: 'SaaS API',
    authType: 'oauth',
    description: 'Map dynamic custom CRM objects and pipelines.',
    icon: Cloud,
    color: 'text-blue-500',
    fields: [
      { 
        name: 'environment', 
        label: 'Environment', 
        type: 'select', 
        options: [
          { label: 'Production (login.salesforce.com)', value: 'login' },
          { label: 'Sandbox (test.salesforce.com)', value: 'test' }
        ],
        helperText: 'Select the target environment for the Connected App.' 
      },
    ]
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'Database',
    authType: 'credentials',
    description: 'Connect your production or analytical replica.',
    icon: Database,
    color: 'text-blue-600',
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'db.example.com' },
      { name: 'port', label: 'Port', type: 'text', placeholder: '5432' },
      { name: 'database', label: 'Database Name', type: 'text', placeholder: 'production_db' },
      { name: 'user', label: 'Username', type: 'text', placeholder: 'readonly_user', helperText: 'We strongly recommend creating a dedicated read-only user.' },
      { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ]
  },
  {
    id: 's3',
    name: 'S3 Parquet',
    category: 'Data Lake',
    authType: 'credentials',
    description: 'Attach an AWS S3 bucket for vectorized querying.',
    icon: HardDrive,
    color: 'text-amber-500',
    fields: [
      { name: 'bucketUrl', label: 'S3 URI', type: 'text', placeholder: 's3://my-company-data/' },
      { name: 'accessKey', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      { name: 'secretKey', label: 'Secret Access Key', type: 'password', placeholder: '••••••••' },
    ]
  }
]

const CONNECTION_PHASES = [
  "Initiating secure handshake...",
  "Verifying credentials...",
  "Scanning schema metadata...",
  "Encrypting vault storage...",
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
    // Pre-fill default selects
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
      // Simulate API call to get the OAuth URL, then redirecting the browser window
      await new Promise(resolve => setTimeout(resolve, 1500))
      // In production: window.location.href = data.oauthUrl;
      setStep(3) 
      return;
    }

    // Route: Direct Database / Credential flow
    setIsConnecting(true)
    for (let i = 0; i < CONNECTION_PHASES.length; i++) {
      setConnectionPhase(i)
      await new Promise(resolve => setTimeout(resolve, 600)) // 600ms per phase
    }
    
    setIsConnecting(false)
    setStep(3) // Move to Success step
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
              <DialogTitle className="text-2xl font-bold">Connect Data Source</DialogTitle>
              <DialogDescription className="mt-1">
                Select a database, API, or data lake to sync into your analytical workspace.
              </DialogDescription>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search integrations (e.g., Snowflake, Shopify)..." 
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
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-none">Popular</Badge>
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
              Your data never leaves your infrastructure. We only sync structural metadata.
            </div>
          </div>
        )}

        {/* Step 2: Configure Credentials or OAuth */}
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
                  {selectedIntegration.authType === 'oauth' ? `Authenticate ${selectedIntegration.name}` : `Configure ${selectedIntegration.name}`}
                </DialogTitle>
              </div>
              <DialogDescription className="pl-11">
                {selectedIntegration.authType === 'oauth' 
                  ? "You will be redirected securely to grant authorization."
                  : "Enter your connection details. All credentials are encrypted in Vault prior to storage."}
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
                        className="bg-background border-border focus-visible:ring-primary/50"
                        onChange={handleFieldChange}
                        disabled={isConnecting || isRedirecting}
                      />
                    )}
                    
                    {field.helperText && (
                      <p className="text-[11px] text-muted-foreground mt-1">
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
                <span>AES-256 Encryption at rest</span>
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
                        Test & Save Connection
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        )}

        {/* Step 3: Success State */}
        {step === 3 && (
          <div className="h-[600px] p-10 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
              <div className="h-20 w-20 relative rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold mb-3 tracking-tight">Connection Established</h2>
            <p className="text-muted-foreground mb-8 max-w-md leading-relaxed">
              Your <strong className="text-foreground">{selectedIntegration?.name}</strong> source has been securely verified. The semantic routing engine is extracting metadata in the background.
            </p>
            
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
                Return to Datasets
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}