'use client'

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import {
  Search, ChevronDown, ChevronUp, ChevronLeft, ArrowUpRight,
  Zap, RefreshCw, Sparkles, Loader2, CheckCircle2, ArrowRight,
  AlertCircle, Database, FileTerminal
} from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// EXTERNAL DOMAIN & SERVICES
// -----------------------------------------------------------------------------
import type { IntegrationType, FirstInsight, IntegrationConfig as DomainIntegrationConfig } from '@/types/integration'
import { INTEGRATIONS, CATEGORIES, validateForm } from '@/lib/integration-config'
import { ConnectionService, tryExtractDbMeta, detectIntegrationFromInput } from '@/lib/connection-service'
import { PasswordInput, OAuthPreEducation, EnhancedSchemaPreview } from './IntegrationUIComponents'
import { ContextualTrustBadge, ErrorGuidance } from './IntegrationContextualUI'
import { 
  useIntegrationOrchestrator, Telemetry, 
  PASTE_DETECTION_THRESHOLD, PROCESSING_MESSAGES 
} from '@/hooks/useIntegrationOrchestrator'

// =============================================================================
// 1. STRICT TYPINGS & STATE MACHINE
// =============================================================================

export type AppError = {
  message: string
  type: 'auth' | 'network' | 'validation' | 'unknown' | 'timeout' | 'runtime'
}

export type ExtractedTable = {
  name: string
  mappingStatus: 'ok' | 'error' | 'pending'
  [key: string]: unknown
}

export type AutofillMeta = {
  host?: string
  dbName?: string
  [key: string]: unknown
}

export type ConnectionResult = {
  tables: ExtractedTable[]
  metadata?: Record<string, unknown>
}

export type IntegrationFieldConfig = {
  name: string
  label: string
  type: string
  placeholder?: string
  helperText?: string
}

export type IntegrationConfig = DomainIntegrationConfig

export type IntegrationContextType = {
  formData: Record<string, string>
  fieldErrors: Record<string, string>
  autofillMeta: AutofillMeta
  detectedTables: ExtractedTable[]
  currentPhase?: string
}

// Discriminated Union for absolute Type Safety
export type IntegrationMachineState =
  | { type: 'idle' }
  | { type: 'selecting' }
  | { type: 'inputting'; integrationId: IntegrationType }
  | { type: 'verifying'; integrationId: IntegrationType; jobId: string }
  | { type: 'mapping'; integrationId: IntegrationType; jobId: string }
  | { type: 'analyzing'; integrationId: IntegrationType; jobId: string }
  | { type: 'review'; integrationId: IntegrationType; result: ConnectionResult }
  | { type: 'saving'; integrationId: IntegrationType }
  | { type: 'success'; insights: FirstInsight[] }
  | { type: 'error'; error: AppError }

export type IntegrationAction =
  | { type: 'SELECT_INTEGRATION'; integrationId: IntegrationType }
  | { type: 'START_VERIFICATION'; jobId: string }
  | { type: 'TABLE_DETECTED'; table: ExtractedTable }
  | { type: 'ANALYSIS_COMPLETE'; result: ConnectionResult }
  | { type: 'START_SAVING' }
  | { type: 'SAVE_SUCCESS'; insights: FirstInsight[] }
  | { type: 'ERROR'; error: AppError }
  | { type: 'BACK_TO_SELECT' }
  | { type: 'RETRY' }
  | { type: 'CLOSE' }


// =============================================================================
// 2. ERROR NORMALIZATION & TYPE GUARDS (The Hard Boundary)
// =============================================================================

function isAppError(err: unknown): err is AppError {
  if (typeof err !== "object" || err === null) return false
  const e = err as Record<string, unknown>
  return typeof e.type === "string" && typeof e.message === "string"
}

function normalizeError(err: unknown): AppError {
  if (isAppError(err)) return err

  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return { type: 'timeout', message: 'Request was aborted or timed out.' }
    }
    return { type: 'runtime', message: err.message }
  }

  if (typeof err === 'string') {
    if (err === 'timeout') return { type: 'timeout', message: 'Connection request timed out. Please try again.' }
    return { type: 'unknown', message: err }
  }

  return { type: 'unknown', message: 'An unknown anomaly occurred during execution.' }
}


// =============================================================================
// 3. ISOLATED HOOKS (Lifecycle & Async Guard)
// =============================================================================

/**
 * Universal Async Race Condition Guard
 */
function useAsyncGuard() {
  const currentRequestRef = useRef<symbol | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const createGuard = useCallback(() => {
    const requestId = Symbol()
    currentRequestRef.current = requestId
    
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    return { requestId, controller }
  }, [])

  const isStale = useCallback((requestId: symbol) => {
    return currentRequestRef.current !== requestId
  }, [])

  const cancelAll = useCallback(() => {
    currentRequestRef.current = null
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  useEffect(() => cancelAll, [cancelAll])

  return useMemo(() => ({ createGuard, isStale, cancelAll }), [createGuard, isStale, cancelAll])
}

/**
 * Connection Lifecycle Orchestrator
 */
function useConnectionLifecycle(
  dispatch: React.Dispatch<IntegrationAction>, 
  updateContext: (updater: (prev: IntegrationContextType) => IntegrationContextType) => void,
  context: IntegrationContextType,
  asyncGuard: ReturnType<typeof useAsyncGuard>
) {
  const serviceRef = useRef<ConnectionService | null>(null)

  const stopConnection = useCallback(() => {
    serviceRef.current?.stop()
    serviceRef.current = null
    asyncGuard.cancelAll()
  }, [asyncGuard])

  useEffect(() => stopConnection, [stopConnection])

  const startConnection = useCallback(async (integration: IntegrationConfig) => {
    const { requestId, controller } = asyncGuard.createGuard()
    
    serviceRef.current?.stop()
    const timeoutId = setTimeout(() => controller.abort('timeout'), 30000)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw { message: 'Authentication required. Please log in again.', type: 'auth' } as AppError

      const res = await fetch('/api/v1/integrations/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: integration.id, credentials: context.formData }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      if (asyncGuard.isStale(requestId)) return

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw { message: errData.detail || 'Failed to establish connection.', type: 'network' } as AppError
      }

      const { job_id } = await res.json()
      
      if (asyncGuard.isStale(requestId)) return
      dispatch({ type: 'START_VERIFICATION', jobId: job_id })

      serviceRef.current = new ConnectionService()
      serviceRef.current.start(job_id, session.access_token, {
        onPhase: (phase) => {
          if (asyncGuard.isStale(requestId)) return
          updateContext((prev) => ({ ...prev, currentPhase: phase }))
        },
        onTable: (table) => {
          if (asyncGuard.isStale(requestId)) return

          const normalizedTable: ExtractedTable = {
            ...table,
            mappingStatus: table.mappingStatus === 'warning' ? 'pending' : table.mappingStatus,
          }

          updateContext((prev) => ({ 
            ...prev, 
            detectedTables: [...prev.detectedTables, normalizedTable] 
          }))
          dispatch({ type: 'TABLE_DETECTED', table: normalizedTable })
        },
        onComplete: (result) => {
          if (asyncGuard.isStale(requestId)) return
          const normalizedResult: ConnectionResult = {
            ...result,
            tables: result.tables.map((table) => {
              const normalizedTable: ExtractedTable = {
                ...table,
                mappingStatus: table.mappingStatus === 'warning' ? 'pending' : table.mappingStatus,
              }
              return normalizedTable
            }),
          }

          dispatch({ type: 'ANALYSIS_COMPLETE', result: normalizedResult })
        },
        onError: (error) => {
          if (asyncGuard.isStale(requestId)) return
          dispatch({ type: 'ERROR', error: normalizeError(error) })
        },
      })
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (asyncGuard.isStale(requestId)) return

      // Handle intentional programmatic aborts safely
      if (err instanceof Error && err.name === 'AbortError' && controller.signal.reason !== 'timeout') {
        return 
      }
      
      if (controller.signal.reason === 'timeout' || err === 'timeout') {
        dispatch({ type: 'ERROR', error: { message: 'Connection request timed out. Please try again.', type: 'timeout' } })
        return
      }

      // 100% Type-safe error boundary
      dispatch({ type: 'ERROR', error: normalizeError(err) })
    }
  }, [context.formData, dispatch, updateContext, asyncGuard])

  return { startConnection, stopConnection }
}

// =============================================================================
// 4. MEMOIZED UI COMPONENTS
// =============================================================================

const IntegrationField = React.memo(({ 
  field, value, error, isFocused, onChange, onFocus, onBlur 
}: {
  field: IntegrationFieldConfig, value: string, error?: string, isFocused: boolean,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onFocus: (name: string) => void, onBlur: () => void
}) => {
  const showMono = field.name.includes('url') || field.name.includes('host')
  const inputId = `field-${field.name}`
  const errorId = `error-${field.name}`

  return (
    <div className="space-y-1.5 relative">
      <Label htmlFor={inputId} className="text-slate-800 font-semibold text-[13px] flex items-center justify-between tracking-tight">
        {field.label}
      </Label>

      <div className="relative">
        {field.type === 'password' ? (
          <div onFocusCapture={() => onFocus(field.name)} onBlurCapture={onBlur}>
            <PasswordInput 
              id={inputId} name={field.name} placeholder={field.placeholder}
              onChange={onChange} value={value}
            />
          </div>
        ) : (
          <Input 
            id={inputId} name={field.name} type="text" placeholder={field.placeholder}
            className={`h-10 bg-white border-slate-200/80 focus-visible:ring-blue-600/20 focus-visible:border-blue-500 rounded-lg text-[13px] shadow-sm transition-all ${showMono ? 'font-mono' : 'font-medium'}`}
            onFocus={() => onFocus(field.name)} onBlur={onBlur} onChange={onChange} 
            value={value} aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
          />
        )}
      </div>

      <div className="h-5 flex items-start overflow-hidden pt-0.5" aria-live="polite">
        {error ? (
          <span id={errorId} className="text-[11px] font-bold text-red-500 flex items-center gap-1.5 animate-in slide-in-from-top-1 fade-in">
            <AlertCircle className="h-3 w-3" /> {error}
          </span>
        ) : isFocused && field.helperText ? (
          <span className="text-[11px] font-medium text-slate-500 animate-in fade-in duration-200">
            {field.helperText}
          </span>
        ) : null}
      </div>
    </div>
  )
})
IntegrationField.displayName = 'IntegrationField'

// =============================================================================
// 5. MAIN ORCHESTRATOR COMPONENT
// =============================================================================

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function IntegrationConnectModal({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast()
  
  // 1. Core State Orchestration (Strictly Typed)
  const { state, context, dispatch, updateContext } = useIntegrationOrchestrator(isOpen) as unknown as {
    state: IntegrationMachineState,
    context: IntegrationContextType,
    dispatch: React.Dispatch<IntegrationAction>,
    updateContext: (updater: (prev: IntegrationContextType) => IntegrationContextType) => void
  }
  
  // 2. Global Request Guard & Services
  const asyncGuard = useAsyncGuard()
  const { startConnection, stopConnection } = useConnectionLifecycle(dispatch, updateContext, context, asyncGuard)

  // 3. Local Presentation State
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(CATEGORIES[0] || null)
  const [detectedIntegration, setDetectedIntegration] = useState<{ id: IntegrationType, source: string } | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [showAdvancedReview, setShowAdvancedReview] = useState(false)
  const [processingMessageIdx, setProcessingMessageIdx] = useState(0)

  // Dynamic UI Messaging
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (['verifying', 'mapping', 'analyzing'].includes(state.type)) {
      interval = setInterval(() => {
        setProcessingMessageIdx(prev => (prev + 1) % PROCESSING_MESSAGES.length)
      }, 2500)
    }
    return () => clearInterval(interval)
  }, [state.type])

  // Safe Integration Access
  const getIntegration = useCallback((id?: string): IntegrationConfig | null => {
    if (!id) return null
    return INTEGRATIONS.find(i => i.id === id) || null
  }, [])

  // -----------------------------------------------------------------------------
  // EVENT HANDLERS
  // -----------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    stopConnection()
    onClose()
    dispatch({ type: 'CLOSE' })
  }, [onClose, dispatch, stopConnection])

  const handleSelectIntegration = useCallback((id: IntegrationType) => {
    dispatch({ type: 'SELECT_INTEGRATION', integrationId: id })
  }, [dispatch])

  const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    
    updateContext((prev) => {
      const nextFormData = { ...prev.formData, [name]: value }
      const nextFieldErrors = { ...prev.fieldErrors }
      if (nextFieldErrors[name]) delete nextFieldErrors[name]

      // Maintain immutability without deep cloning overhead
      let nextMeta = prev.autofillMeta

      if (name.includes('url') || name.includes('host')) {
        try {
          const meta = tryExtractDbMeta(value)
          if (meta.host || meta.dbName) nextMeta = meta
        } catch (err) {}
      }

      return {
        ...prev,
        formData: nextFormData,
        fieldErrors: nextFieldErrors,
        autofillMeta: nextMeta
      }
    })
  }, [updateContext])

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state.type !== 'inputting') return

    const integration = getIntegration(state.integrationId)
    if (!integration) return

    const errors = validateForm(integration.validationSchema, context.formData)
    
    if (Object.keys(errors).length > 0) {
      updateContext((prev) => ({ ...prev, fieldErrors: errors }))
      return
    }

    const timer = Telemetry.time('Connection Test Phase')
    await startConnection(integration)
    timer()
  }

  const handleSave = async () => {
    if (state.type !== 'review') return
    
    // Strict Guard applied to Finalization
    const { requestId, controller } = asyncGuard.createGuard()
    dispatch({ type: 'START_SAVING' })

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw { message: 'Session expired', type: 'auth' } as AppError

      const res = await fetch('/api/v1/integrations/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: state.integrationId, credentials: context.formData }),
        signal: controller.signal
      })

      if (asyncGuard.isStale(requestId)) return
      if (!res.ok) throw { message: 'Failed to finalize connection setup.', type: 'network' } as AppError

      // Fire-and-forget background sync
      fetch('/api/ingest/trigger/initial_sync_job', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {})

      const insights: FirstInsight[] = [
        { label: 'Identified ARR', value: '$14,290', change: { value: 12, direction: 'up' }, icon: Zap, color: 'text-blue-600' },
        { label: 'Active Cohorts', value: '1,284', change: { value: 8, direction: 'up' }, icon: Zap, color: 'text-slate-700' },
        { label: 'Data Latency', value: '18ms', change: { value: 2, direction: 'down' }, icon: AlertCircle, color: 'text-emerald-600' },
      ]

      dispatch({ type: 'SAVE_SUCCESS', insights })
    } catch (err: unknown) {
      if (asyncGuard.isStale(requestId)) return
      if (err instanceof Error && err.name === 'AbortError') return
      
      // 100% Type-safe normalization boundary
      dispatch({ type: 'ERROR', error: normalizeError(err) })
    }
  }

  // -----------------------------------------------------------------------------
  // RENDER HELPERS
  // -----------------------------------------------------------------------------
  const { filteredIntegrations, groupedCategories } = useMemo(() => {
    const query = searchQuery.toLowerCase()
    const grouped = CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: [] as typeof INTEGRATIONS }), {} as Record<string, typeof INTEGRATIONS>)
    
    INTEGRATIONS.forEach(integration => {
      if (!query || integration.name.toLowerCase().includes(query) || integration.category.toLowerCase().includes(query)) {
        if (grouped[integration.category]) grouped[integration.category].push(integration)
      }
    })
    return { filteredIntegrations: Object.values(grouped).flat(), groupedCategories: grouped }
  }, [searchQuery])

  const baseModalClass = "animate-in fade-in zoom-in-[0.98] duration-300 ease-out fill-mode-forwards"

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        role="dialog"
        className="sm:max-w-[620px] overflow-hidden p-0 bg-white border border-slate-200/80 shadow-2xl shadow-slate-900/10 rounded-2xl"
        aria-describedby="integration-modal-description"
        aria-labelledby="integration-modal-title"
      >
        
        {/* PHASE: IDLE / SELECTING */}
        {(state.type === 'idle' || state.type === 'selecting') && (
          <div key="selecting" className={`flex flex-col max-h-[85vh] ${baseModalClass}`}>
            <DialogHeader className="p-7 pb-6 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/50">
              <DialogTitle id="integration-modal-title" className="text-[22px] font-extrabold tracking-tight text-slate-900">
                Connect your stack
              </DialogTitle>
              <DialogDescription id="integration-modal-description" className="mt-1.5 text-[13px] font-medium text-slate-500 leading-relaxed">
                Search for an integration or paste a connection string directly to auto-configure.
              </DialogDescription>
              
              <div className="relative mt-6">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search apps or paste a connection string..."
                  className="pl-10 h-11 bg-slate-50/50 border-slate-200/80 focus-visible:ring-blue-600/10 focus-visible:border-blue-500 rounded-xl text-[13px] shadow-sm font-medium transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text')
                    if (text.length > PASTE_DETECTION_THRESHOLD && !detectedIntegration) {
                      const detected = detectIntegrationFromInput(text)
                      if (detected) setDetectedIntegration({ id: detected, source: text })
                    }
                  }}
                  aria-label="Search integrations"
                />
              </div>

              {detectedIntegration && (() => {
                const matchedInt = getIntegration(detectedIntegration.id)
                return matchedInt && (
                  <div className="mt-4 p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-white rounded-md shadow-sm border border-blue-100/50">
                        <Database className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-[13px] font-semibold text-blue-900">
                        Detected a {matchedInt.name} string.
                      </span>
                    </div>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-8 px-4 rounded-lg text-xs font-bold"
                      onClick={() => {
                        updateContext((prev) => ({ ...prev, formData: { ...prev.formData, url: detectedIntegration.source } }))
                        handleSelectIntegration(detectedIntegration.id)
                        setDetectedIntegration(null)
                      }}>
                      Autofill
                    </Button>
                  </div>
                )
              })()}
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-7 pt-5 bg-slate-50/30">
              {filteredIntegrations.length === 0 && (
                <div className="py-12 text-center flex flex-col items-center justify-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 border border-slate-200/60 flex items-center justify-center mb-4">
                    <FileTerminal className="h-5 w-5 text-slate-400" />
                  </div>
                  <h3 className="text-[14px] font-bold text-slate-900">No matching integrations</h3>
                  <p className="text-[13px] text-slate-500 mt-1 font-medium">Try pasting a connection string directly.</p>
                </div>
              )}

              <div className="space-y-3">
                {CATEGORIES.map(cat => {
                  const items = groupedCategories[cat]
                  if (!items || !items.length) return null
                  const isExpanded = expandedCategory === cat
                  
                  return (
                    <div key={cat} className="mb-2">
                      <button 
                        className="flex items-center gap-2 py-2 text-left group w-full outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-sm" 
                        onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                        aria-expanded={isExpanded}
                      >
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-slate-700 transition-colors">{cat}</span>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                      </button>
                      
                      {isExpanded && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 animate-in slide-in-from-top-1 fade-in duration-200" role="list">
                          {items.map(integration => (
                            <button key={integration.id} role="listitem"
                              className="text-left p-3.5 border border-slate-200/80 hover:border-blue-300 hover:shadow-sm transition-all bg-white rounded-xl flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 group"
                              onClick={() => handleSelectIntegration(integration.id)}>
                              <div className={`p-2 rounded-lg border border-slate-100/80 bg-slate-50 group-hover:bg-white transition-colors ${integration.color}`}>
                                <integration.icon className="h-4 w-4" />
                              </div>
                              <div className="overflow-hidden">
                                <h3 className="font-bold text-slate-900 text-[13px] truncate">{integration.name}</h3>
                                <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{integration.description}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <ContextualTrustBadge phase={state.type} />
          </div>
        )}

        {/* PHASE: INPUTTING */}
        {state.type === 'inputting' && (() => {
          const integration = getIntegration(state.integrationId)
          if (!integration) return null
          
          const isOAuth = integration.authType === 'oauth'
          
          return (
            <div key="inputting" className={`flex flex-col max-h-[85vh] ${baseModalClass}`}>
              <DialogHeader className="p-6 pb-5 bg-gradient-to-b from-white to-slate-50/50 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100/80 rounded-lg"
                    onClick={() => { stopConnection(); dispatch({ type: 'BACK_TO_SELECT' }) }}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className={`p-1.5 rounded-lg border border-slate-100/80 bg-white shadow-sm ${integration.color}`}>
                    <integration.icon className="h-4 w-4" />
                  </div>
                  <DialogTitle className="text-lg font-extrabold tracking-tight text-slate-900">
                    Connect {integration.name}
                  </DialogTitle>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-8 py-7 bg-slate-50/40">
                <form id="integration-form" onSubmit={handleTestConnection} className="max-w-[420px] mx-auto space-y-6">
                  {isOAuth && <OAuthPreEducation providerName={integration.name} permissions={['Read analytical data', 'View schemas']} />}

                  {integration.fields.map(field => (
                    <IntegrationField
                      key={field.name}
                      field={field}
                      value={context.formData[field.name] || ''}
                      error={context.fieldErrors[field.name]}
                      isFocused={focusedField === field.name}
                      onChange={handleFieldChange}
                      onFocus={(name) => setFocusedField(name)}
                      onBlur={() => setFocusedField(null)}
                    />
                  ))}
                </form>
              </div>

              <ContextualTrustBadge phase={state.type} />

              <DialogFooter className="p-5 bg-white border-t border-slate-100 flex items-center justify-between">
                <Button variant="ghost" onClick={handleClose} className="font-bold text-slate-500 hover:text-slate-800 text-[13px]">
                  Cancel
                </Button>
                <Button type="submit" form="integration-form"
                  disabled={Object.keys(context.fieldErrors).length > 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg px-6 shadow-sm text-[13px] transition-all">
                  {isOAuth ? (
                    <>Authorize Access <ArrowUpRight className="ml-1.5 h-3.5 w-3.5 opacity-80" /></>
                  ) : (
                    <><Zap className="mr-1.5 h-3.5 w-3.5 opacity-90" /> Connect Source</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )
        })()}

        {/* PHASE: PROCESSING */}
        {['verifying', 'mapping', 'analyzing'].includes(state.type) && (
          <div key="processing" className={`flex flex-col h-[400px] justify-center items-center p-10 bg-white ${baseModalClass}`}>
            <div className="w-full max-w-[340px] text-center space-y-6">
              
              <div className="relative mx-auto w-16 h-16">
                 <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                 <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
              </div>
              
              <div>
                <h3 className="text-[16px] font-extrabold text-slate-900 tracking-tight">
                  {PROCESSING_MESSAGES[processingMessageIdx]}
                </h3>
                <p className="text-[13px] text-slate-500 font-medium mt-1">
                  {context.detectedTables.length > 0 
                    ? `Mapped ${context.detectedTables.length} tables securely...` 
                    : "Establishing secure encrypted tunnel..."}
                </p>
              </div>

              <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <div className="flex items-center gap-3 text-[12px] font-semibold text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Connecting securely
                </div>
                <div className={`flex items-center gap-3 text-[12px] font-semibold ${state.type !== 'verifying' ? 'text-slate-400' : 'text-slate-800'}`}>
                   {state.type !== 'verifying' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Loader2 className="h-4 w-4 animate-spin text-blue-500" />} 
                   Testing authorization
                </div>
                <div className={`flex items-center gap-3 text-[12px] font-semibold ${state.type === 'analyzing' ? 'text-slate-800' : 'text-slate-300'}`}>
                   {state.type === 'analyzing' ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <div className="h-4 w-4 rounded-full border-2 border-slate-200" />} 
                   Analyzing analytical semantic layer
                </div>
              </div>

              <Button variant="ghost" size="sm" 
                className="mt-4 text-slate-400 hover:text-slate-700 text-[12px] font-bold uppercase tracking-wider" 
                onClick={() => { stopConnection(); dispatch({ type: 'BACK_TO_SELECT' }) }}>
                Cancel Connection
              </Button>
            </div>
          </div>
        )}

        {/* PHASE: REVIEW */}
        {state.type === 'review' && (() => {
          const integration = getIntegration(state.integrationId)
          if (!integration) return null
          
          const validTablesCount = state.result?.tables?.filter((t: ExtractedTable) => t.mappingStatus === 'ok').length || 0

          return (
            <div key="review" className={`flex flex-col max-h-[85vh] ${baseModalClass}`}>
              <DialogHeader className="p-8 pb-6 bg-gradient-to-b from-white to-slate-50/30 border-b border-slate-100 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-5 border border-emerald-100/50 shadow-sm ring-4 ring-emerald-50">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <DialogTitle className="text-2xl font-extrabold tracking-tight text-slate-900">
                  Connection Verified
                </DialogTitle>
                <p className="text-[13px] font-medium text-slate-500 mt-2 max-w-[280px] leading-relaxed">
                  Successfully extracted <span className="font-bold text-slate-800">{validTablesCount} core tables</span>. Ready to generate semantic layer.
                </p>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/40">
                <div className="text-center mb-6">
                   <Button 
                     variant="outline" 
                     className="bg-white border-slate-200/80 text-slate-600 font-bold text-[12px] shadow-sm rounded-lg h-9 hover:bg-slate-50 hover:text-slate-900"
                     onClick={() => setShowAdvancedReview(prev => !prev)}
                   >
                     {showAdvancedReview ? 'Hide Technical Metadata' : 'View Extracted Schema'}
                   </Button>
                </div>

                {showAdvancedReview && state.result?.tables && (
                  <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-200">
                    <EnhancedSchemaPreview
                      tables={state.result.tables.map((table) => {
                        const rowCount = (table as { rowCount?: unknown }).rowCount
                        const confidence = (table as { confidence?: unknown }).confidence
                        const confidenceLevel = typeof confidence === 'string'
                          ? confidence
                          : typeof confidence === 'number'
                            ? confidence >= 0.8
                              ? 'high'
                              : confidence >= 0.5
                                ? 'medium'
                                : 'low'
                            : 'low'
                        const mappingStatusRaw = (table as { mappingStatus?: unknown }).mappingStatus
                        const mappingStatus = mappingStatusRaw === 'ok' || mappingStatusRaw === 'error'
                          ? mappingStatusRaw
                          : 'warning'

                        return {
                          ...table,
                          rowCount: typeof rowCount === 'string' ? rowCount : typeof rowCount === 'number' ? String(rowCount) : '0',
                          confidence: confidenceLevel as React.ComponentProps<typeof EnhancedSchemaPreview>['tables'][number]['confidence'],
                          mappingStatus,
                        }
                      })}
                      integration={integration}
                    />
                  </div>
                )}
              </div>

              <ContextualTrustBadge phase={state.type} />

              <DialogFooter className="p-5 bg-white border-t border-slate-100 flex items-center justify-between">
                <Button variant="ghost" onClick={() => { stopConnection(); dispatch({ type: 'BACK_TO_SELECT' }) }} className="font-bold text-slate-500 hover:text-slate-800 text-[13px]">
                  Disconnect
                </Button>
                <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg px-8 shadow-sm text-[13px]">
                  Finalize Setup <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DialogFooter>
            </div>
          )
        })()}

        {/* PHASE: SAVING */}
        {state.type === 'saving' && (
          <div key="saving" className={`flex flex-col items-center justify-center py-24 bg-white ${baseModalClass}`}>
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-5" />
            <p className="text-[15px] font-extrabold text-slate-900 tracking-tight">Provisioning Workspace</p>
            <p className="text-[13px] font-medium text-slate-500 mt-1">Applying ML governance models...</p>
          </div>
        )}

        {/* PHASE: SUCCESS */}
        {state.type === 'success' && (() => {
          const primaryInsight = state.insights?.[0]
          
          return (
            <div key="success" className={`flex flex-col max-h-[85vh] p-8 bg-slate-900 ${baseModalClass}`}>
              <div className="text-center mb-8 mt-4">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-900/50 ring-4 ring-blue-900/30 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/20" />
                  <Sparkles className="h-7 w-7 text-white relative z-10" />
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">System Activated</h2>
                <p className="text-[13px] font-medium text-slate-400 mt-2">Your analytical pipeline is live and modeled.</p>
              </div>

              {primaryInsight && (
                <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-7 text-center mb-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">{primaryInsight.label}</p>
                  <h3 className="text-4xl font-extrabold text-white tracking-tight">{primaryInsight.value}</h3>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-3">
                <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 rounded-xl text-[14px] shadow-lg shadow-blue-900/40"
                  onClick={() => { onSuccess?.(); handleClose() }}>
                  Enter Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="ghost" className="w-full font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 text-[13px] h-10 rounded-xl transition-colors"
                  onClick={() => { dispatch({ type: 'CLOSE' }); setTimeout(() => dispatch({ type: 'BACK_TO_SELECT' }), 300) }}>
                  Connect Another Source
                </Button>
              </div>
            </div>
          )
        })()}

        {/* PHASE: ERROR */}
        {state.type === 'error' && (
          <div key="error" className={`flex flex-col max-h-[85vh] p-8 bg-white ${baseModalClass}`}>
            <div className="text-left mb-6 pt-2">
              <div className="w-12 h-12 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-center mb-5 ring-4 ring-red-50/50">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Connection Failed</h2>
              <p className="text-[13px] font-medium text-slate-600 mt-2 leading-relaxed">{state.error.message}</p>
            </div>

            <ErrorGuidance error={state.error as AppError} />

            <div className="mt-auto flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="outline" className="flex-1 font-bold border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm rounded-lg text-[13px] h-10" 
                onClick={() => { stopConnection(); dispatch({ type: 'BACK_TO_SELECT' }) }}>
                Change Source
              </Button>
              <Button className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-sm rounded-lg text-[13px] h-10" 
                onClick={() => dispatch({ type: 'RETRY' })}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry Connection
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}
