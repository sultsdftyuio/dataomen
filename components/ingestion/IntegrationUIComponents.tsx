'use client'

import React from 'react'
import {
  Database, ArrowRight, CheckCircle2, Loader2,
  ShieldCheck, Search, Lock, ShoppingBag, ExternalLink,
  CreditCard, Zap, Droplet, Server, Box, AlertCircle,
  RefreshCw, Info, Eye, EyeOff, Table2, Sparkles, AlertTriangle, 
  TrendingDown, DollarSign, Users, XCircle, CheckSquare, Shield, 
  KeyRound, Wifi, LineChart, Fingerprint, FileCheck, Ban, Brain, 
  Activity, Layers, Rocket, Terminal, Bug, ChevronUp, TrendingUp as TrendUp
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import type { 
  IntegrationConfig, DetectedTable, ConnectionError, FirstInsight, 
  BackendPhaseKey, ConfidenceLevel, ConnectionResult 
} from '@/types/integration'
import { PHASE_META } from '@/lib/integration-config'

// ═════════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES & SMALL COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

export function PasswordInput({ id, name, placeholder, disabled, onChange, value }: {
  id: string; name: string; placeholder?: string; disabled?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; value: string
}) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="relative">
      <Input id={id} name={name} type={show ? 'text' : 'password'} placeholder={placeholder} required disabled={disabled}
        className="h-12 bg-slate-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 font-mono text-sm shadow-inner rounded-xl pr-10 transition-all"
        onChange={onChange} value={value} />
      <button type="button" tabIndex={-1} disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
        onClick={() => setShow(s => !s)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function WhyTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="ml-1.5 text-slate-400 hover:text-blue-500 transition-colors inline-flex items-center">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[240px] text-xs leading-relaxed font-medium bg-slate-900 text-white border-slate-800 p-3">
        <span className="font-bold text-blue-300 block mb-1">Why we need this</span>
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

const CONFIDENCE_STYLES = { 
  high: 'bg-emerald-100 text-emerald-700 border-emerald-200', 
  medium: 'bg-amber-100 text-amber-700 border-amber-200', 
  low: 'bg-slate-100 text-slate-600 border-slate-200' 
}

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CONFIDENCE_STYLES[level]}`}>{level} confidence</span>
}

export function AutoDetectionToast({ integrationName, onAccept, onDismiss }: { integrationName: string; onAccept: () => void; onDismiss: () => void }) {
  return (
    <div className="absolute top-4 left-4 right-4 z-10 bg-slate-900 text-white rounded-xl p-3 flex items-center gap-3 shadow-xl animate-in slide-in-from-top-4 fade-in duration-300">
      <Sparkles className="h-4 w-4 text-blue-400" />
      <span className="text-sm">Detected <span className="font-bold">{integrationName}</span></span>
      <button onClick={onDismiss} className="ml-auto text-xs font-bold text-slate-400 hover:text-white px-2">No thanks</button>
      <button onClick={onAccept} className="text-xs font-bold bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors">Use This</button>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPLEX PANELS & INDICATORS
// ═════════════════════════════════════════════════════════════════════════════

export function GuidedStepIndicator({ steps, currentStep }: { steps: { id: string; label: string; icon: React.ElementType }[]; currentStep: string }) {
  const currentIndex = steps.findIndex(s => s.id === currentStep)
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, i) => {
        const Icon = step.icon
        const isActive = i === currentIndex
        const isComplete = i < currentIndex
        return (
          <React.Fragment key={step.id}>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 ${
              isActive ? 'bg-blue-50 border border-blue-200 shadow-sm' : isComplete ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'
            }`}>
              <div className={`p-1 rounded-lg ${isActive ? 'bg-blue-500 text-white' : isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className={`text-[10px] font-bold ${isActive ? 'text-blue-700' : isComplete ? 'text-emerald-700' : 'text-slate-400'}`}>{step.label}</span>
              {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            </div>
            {i < steps.length - 1 && <div className={`w-6 h-0.5 rounded-full ${isComplete ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function PhaseProgressPanel({ phase, detectedTables }: { phase: BackendPhaseKey; detectedTables: DetectedTable[] }) {
  const meta = PHASE_META[phase]
  if (!meta) {
    console.warn(`Unknown phase: ${phase}`)
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-600">Processing...</p>
      </div>
    )
  }
  
  const Icon = meta.icon
  const recentTables = React.useMemo(() => detectedTables.slice(-3), [detectedTables])

  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="p-5">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl bg-white shadow-sm ${meta.color}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">{meta.message}</p>
            <p className="text-xs text-slate-500 mt-0.5">{meta.subMessage}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-blue-600">{meta.progress}%</span>
          </div>
        </div>
        <div className="mt-4 h-2 bg-slate-200/50 rounded-full overflow-hidden">
          <div style={{ width: `${meta.progress}%` }}
            className={`h-full rounded-full transition-all duration-500 ease-out ${phase === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} />
        </div>
        {detectedTables.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-100/50 animate-in fade-in duration-300">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> Live Detection
            </p>
            <div className="space-y-1.5">
                {recentTables.map((table, i) => (
                  <div key={`${table.name}-${table.rowCount}`} style={{ animationDelay: `${i * 50}ms` }}
                    className="flex items-center justify-between text-xs py-1.5 px-2 bg-white/50 rounded-lg animate-in slide-in-from-left-2 fade-in duration-300 fill-mode-both">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-mono font-medium text-slate-700">{table.name}</span>
                    </div>
                    <span className="text-slate-400 font-medium">{table.rowCount} rows</span>
                  </div>
                ))}
              {detectedTables.length > 3 && (
                <p className="text-[10px] text-slate-400 pl-5.5">+{detectedTables.length - 3} more tables detected</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function OAuthPreEducation({ providerName, permissions }: { providerName: string; permissions: string[] }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 overflow-hidden mb-6 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
        <Shield className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-bold text-blue-800">What happens next</span>
      </div>
      <div className="p-4 space-y-3">
        {[
          { step: '1', text: `You'll be redirected to ${providerName} to authorize access` },
          { step: '2', text: 'We\'ll only request read access to:', isList: true },
          { step: '3', text: 'You\'ll return here automatically once authorized' },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="p-1.5 bg-white rounded-lg shadow-sm flex-shrink-0">
              <span className="text-xs font-bold text-blue-600">{item.step}</span>
            </div>
            <div>
              <p className="text-xs text-slate-600 leading-relaxed">{item.text}</p>
              {item.isList && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {permissions.map(p => (
                    <span key={p} className="text-[10px] font-bold px-2 py-0.5 bg-white border border-blue-100 text-blue-700 rounded-lg">{p}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-blue-100">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Lock className="h-3 w-3" />
            <span>Your credentials are never stored on our servers</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export interface SecurityConfig {
  encrypted?: boolean;
  readOnly?: boolean;
  tls?: boolean;
  noDataStored?: boolean;
  soc2?: boolean;
  revokable?: boolean;
}

const ALL_PROOFS = {
  encrypted: { icon: KeyRound, label: 'Credentials encrypted', detail: 'AES-256-GCM via HashiCorp Vault', badge: 'Enterprise-grade' },
  readOnly: { icon: Shield, label: 'Access scoped read-only', detail: 'No INSERT, UPDATE, or DELETE permissions', badge: 'Zero risk' },
  tls: { icon: Wifi, label: 'Connection via TLS 1.3', detail: 'End-to-end encryption enforced', badge: 'Secure' },
  noDataStored: { icon: Fingerprint, label: 'No data stored', detail: 'Only metadata & schema cached', badge: 'Privacy-first' },
  soc2: { icon: FileCheck, label: 'SOC 2 Type II Certified', detail: 'Annual security audits', badge: 'Compliant' },
  revokable: { icon: Ban, label: 'Revoke anytime', detail: 'One-click disconnect in settings', badge: 'You control' }
};

export function EnhancedSecurityProofPanel({ config = { encrypted: true, readOnly: true, tls: true, noDataStored: true, revokable: true } }: { config?: SecurityConfig }) {
  const activeProofs = Object.entries(config)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => ALL_PROOFS[key as keyof typeof ALL_PROOFS])
    .filter(Boolean);

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-bold text-slate-800">Security & Privacy</span>
      </div>
      <div className="divide-y divide-slate-100">
        {activeProofs.map(p => (
          <div key={p.label} className="flex items-center gap-3 px-4 py-3 group hover:bg-slate-50 transition-colors">
            <div className="p-1.5 bg-emerald-50 rounded-lg flex-shrink-0 group-hover:scale-110 transition-transform">
              <p.icon className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-slate-800">{p.label}</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{p.badge}</span>
              </div>
              <p className="text-[11px] text-slate-500">{p.detail}</p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

const ANALYSIS_QUALITY_COLORS = { 
  excellent: 'bg-emerald-100 text-emerald-600', 
  good: 'bg-blue-100 text-blue-600', 
  fair: 'bg-amber-100 text-amber-600', 
  poor: 'bg-red-100 text-red-600' 
}

export function AIAnalysisPanel({ analysis }: { analysis: NonNullable<ConnectionResult['aiAnalysis']> }) {
  return (
    <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/80 to-pink-50/80 overflow-hidden mb-6 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="px-4 py-3 border-b border-purple-100 flex items-center gap-2">
        <Brain className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-bold text-purple-800">AI-Powered Analysis</span>
        <Badge className="ml-auto text-[10px] bg-purple-100 text-purple-700 border-purple-200 font-bold">BETA</Badge>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${ANALYSIS_QUALITY_COLORS[analysis.dataQuality]}`}>
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-700">Data Quality</p>
            <p className="text-[10px] text-slate-500 capitalize">{analysis.dataQuality}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Detected Patterns</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.detectedPatterns.map(p => (
              <span key={p} className="text-[10px] font-bold px-2 py-1 bg-white border border-purple-100 text-purple-700 rounded-lg">{p}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Suggested Dashboards</p>
          <div className="space-y-1.5">
            {analysis.suggestedDashboards.map(d => (
              <div key={d.name} className="flex items-center gap-2 p-2 bg-white/50 rounded-lg border border-purple-50">
                <d.icon className="h-3.5 w-3.5 text-purple-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">{d.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{d.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const getStatusIcon = (s: DetectedTable['mappingStatus']) => {
  if (s === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
  if (s === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
  return <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
}

export function EnhancedSchemaPreview({ tables, integration }: { tables: DetectedTable[]; integration: IntegrationConfig }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 overflow-hidden mb-6 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
        <Table2 className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-bold text-emerald-800">Detected Tables</span>
        <Badge className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 font-bold animate-pulse">LIVE</Badge>
      </div>
      <div className="divide-y divide-emerald-100/70">
        {tables.map((t, index) => {
          const insight = integration.tableInsights?.[t.name]
          return (
            <div key={`${t.name}-${t.rowCount}`} style={{ animationDelay: `${index * 50}ms` }}
              className="px-4 py-3 group hover:bg-emerald-50/80 transition-colors animate-in slide-in-from-left-2 fade-in duration-300 fill-mode-both">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(t.mappingStatus)}
                  <span className="text-sm font-mono font-bold text-slate-700">{t.name}</span>
                  {t.mappingStatus === 'warning' && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">partial</span>
                  )}
                  <ConfidenceBadge level={t.confidence} />
                </div>
                <span className="text-xs text-slate-500 font-semibold">{t.rowCount} rows</span>
              </div>
              {insight && (
                <div className="mt-2 pl-6 space-y-1">
                  <p className="text-[11px] text-slate-600"><span className="font-semibold text-emerald-700">Used for:</span> {insight.purpose}</p>
                  <div className="flex flex-wrap gap-1">
                    {insight.dashboards.map(d => (
                      <span key={d} className="text-[9px] font-bold px-1.5 py-0.5 bg-white border border-emerald-100 text-emerald-600 rounded">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ActionableErrorPanel({ error, onRetry }: { error: ConnectionError; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 overflow-hidden mb-6 animate-in zoom-in-95 fade-in duration-300">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-100 rounded-xl flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800">{error.message}</p>
            {error.fix && <p className="text-xs text-red-600 mt-1 leading-relaxed">{error.fix}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <Button type="button" size="sm" onClick={onRetry} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try Again
              </Button>
              {error.actionHref ? (
                <a href={error.actionHref} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors">
                  {error.actionLabel} <ExternalLink className="h-3 w-3" />
                </a>
              ) : error.actionLabel ? (
                <span className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-100 rounded-lg">{error.actionLabel}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DebugPanel({ error, onClose }: { error: ConnectionError; onClose: () => void }) {
  if (!error.debugInfo) return null
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-900 overflow-hidden animate-in fade-in duration-300">
      <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-bold text-slate-300">Debug Information</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><ChevronUp className="h-4 w-4" /></button>
      </div>
      <div className="p-4 font-mono text-[11px] text-slate-400 space-y-2">
        <div className="flex justify-between"><span>Request ID:</span><span className="text-slate-300">{error.debugInfo.requestId}</span></div>
        <div className="flex justify-between"><span>Timestamp:</span><span className="text-slate-300">{error.debugInfo.timestamp}</span></div>
        <div className="mt-3">
          <span className="text-slate-500">Query Attempts:</span>
          {error.debugInfo.queryAttempts.map((q, i) => (
            <div key={i} className="mt-1 pl-3 border-l-2 border-slate-700">
              <div className="text-slate-500 truncate">{q.query}</div>
              <div className="flex gap-3 mt-0.5">
                <span className={q.error ? 'text-red-400' : 'text-emerald-400'}>{q.error ? '✗ Failed' : '✓ Success'} ({q.duration}ms)</span>
                {q.error && <span className="text-red-400">{q.error}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function FirstInsightCard({ insight }: { insight: FirstInsight }) {
  const Icon = insight.icon
  const isPositive = insight.change.direction === 'up' && insight.change.value > 0
  return (
    <div 
      className="animate-in zoom-in-95 fade-in duration-300 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${insight.color}`}><Icon className="h-5 w-5" /></div>
        <div className={`flex items-center gap-1 text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPositive ? <TrendUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {Math.abs(insight.change.value)}%
        </div>
      </div>
      <div className="text-2xl font-black text-slate-900">{insight.value}</div>
      <div className="text-sm font-medium text-slate-500">{insight.label}</div>
    </div>
  )
}

export function MomentumCTAPanel({ dashboards, onSelect }: { dashboards: { name: string; icon: React.ElementType; description: string; color: string }[]; onSelect: (name: string) => void }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="px-4 py-3 border-b border-blue-100">
        <p className="text-sm font-bold text-blue-800 flex items-center gap-2">
          <Rocket className="h-4 w-4" /> What would you like to explore?
        </p>
      </div>
      <div className="p-3 grid gap-2">
        {dashboards.map((d, i) => (
          <button key={d.name} style={{ animationDelay: `${i * 100}ms` }}
            onClick={() => onSelect(d.name)}
            className="flex items-center gap-3 p-3 bg-white hover:bg-blue-50 border border-blue-100 hover:border-blue-200 rounded-xl transition-all group text-left animate-in slide-in-from-left-2 fade-in duration-300 fill-mode-both">
            <div className={`p-2 rounded-lg ${d.color}`}><d.icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{d.name}</p>
              <p className="text-[11px] text-slate-500">{d.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
          </button>
        ))}
      </div>
    </div>
  )
}