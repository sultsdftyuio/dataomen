// components/ingestion/IntegrationConnectModal.tsx
'use client'

import React, { useState } from 'react'
import { 
  Database, 
  HardDrive, 
  FileSpreadsheet, 
  RefreshCw, 
  ArrowRight, 
  CheckCircle2,
  Loader2,
  ChevronLeft
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

// 1. Type Safety & Configuration
type IntegrationType = 'postgres' | 'stripe' | 's3' | 'duckdb'

interface IntegrationConfig {
  id: IntegrationType;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  fields: { name: string; label: string; type: string; placeholder: string }[];
}

// 2. Modular Integration Catalog
// Adding a new integration is as simple as adding an object to this array.
const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Connect your production or analytical database.',
    icon: Database,
    color: 'text-blue-500',
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'db.example.com' },
      { name: 'port', label: 'Port', type: 'text', placeholder: '5432' },
      { name: 'database', label: 'Database Name', type: 'text', placeholder: 'production_db' },
      { name: 'user', label: 'Username', type: 'text', placeholder: 'readonly_user' },
      { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ]
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Sync billing, subscriptions, and customer data.',
    icon: RefreshCw,
    color: 'text-indigo-500',
    fields: [
      { name: 'apiKey', label: 'Restricted API Key', type: 'password', placeholder: 'rk_live_...' },
    ]
  },
  {
    id: 's3',
    name: 'S3 Parquet',
    description: 'Attach a data lake bucket for vectorized querying.',
    icon: HardDrive,
    color: 'text-amber-500',
    fields: [
      { name: 'bucketUrl', label: 'S3 URI', type: 'text', placeholder: 's3://my-company-data/' },
      { name: 'accessKey', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      { name: 'secretKey', label: 'Secret Access Key', type: 'password', placeholder: '••••••••' },
    ]
  },
  {
    id: 'duckdb',
    name: 'Local File (DuckDB)',
    description: 'Upload CSV/Parquet for immediate in-memory analysis.',
    icon: FileSpreadsheet,
    color: 'text-yellow-500',
    fields: [
      { name: 'file', label: 'Upload File', type: 'file', placeholder: '' },
    ]
  }
]

interface IntegrationConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function IntegrationConnectModal({ isOpen, onClose, onSuccess }: IntegrationConnectModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationConfig | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})

  // Reset state when modal closes
  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setStep(1)
      setSelectedIntegration(null)
      setFormData({})
    }, 300) // wait for animation
  }

  const handleSelectIntegration = (integration: IntegrationConfig) => {
    setSelectedIntegration(integration)
    setStep(2)
  }

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsConnecting(true)
    
    // Simulate backend connection validation (Security by Design)
    // In production, this data is sent over HTTPS to your secure backend,
    // validated, and securely encrypted in your vault before saving the schema.
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    setIsConnecting(false)
    setStep(3) // Success step
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] overflow-hidden p-0 bg-background border-border">
        
        {/* Step 1: Select Integration */}
        {step === 1 && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-semibold">Connect Data Source</DialogTitle>
              <DialogDescription>
                Select a database, API, or file format to integrate into your workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {INTEGRATIONS.map((integration) => (
                <Card 
                  key={integration.id}
                  className="p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-all group border-border shadow-sm"
                  onClick={() => handleSelectIntegration(integration)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-md bg-muted group-hover:bg-background transition-colors ${integration.color}`}>
                      <integration.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground text-sm">{integration.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {integration.description}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Configure Credentials */}
        {step === 2 && selectedIntegration && (
          <form onSubmit={handleConnect} className="p-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <DialogHeader className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 -ml-2" 
                  onClick={() => setStep(1)}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className={`p-1.5 rounded-md bg-muted ${selectedIntegration.color}`}>
                  <selectedIntegration.icon className="h-4 w-4" />
                </div>
                <DialogTitle className="text-xl">Configure {selectedIntegration.name}</DialogTitle>
              </div>
              <DialogDescription>
                Enter your connection details. We highly recommend using a read-only user account for security.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {selectedIntegration.fields.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label htmlFor={field.name} className="text-foreground">{field.label}</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    required
                    className="bg-background border-border"
                    onChange={handleFieldChange}
                  />
                </div>
              ))}
            </div>

            <DialogFooter className="mt-8">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    Connect Source
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Step 3: Success State */}
        {step === 3 && (
          <div className="p-10 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Connection Successful</h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Your {selectedIntegration?.name} source has been verified and is currently syncing schemas to your workspace.
            </p>
            <Button 
              className="w-full sm:w-auto"
              onClick={() => {
                onSuccess?.();
                handleClose();
              }}
            >
              Return to Datasets
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}