import React, { ReactNode } from 'react'
import { ShieldCheck, AlertCircle, RefreshCw, Zap, Lock } from 'lucide-react'
import type { MachineState, ConnectionError } from '@/types/integration'

// ═════════════════════════════════════════════════════════════════════════════
// CONTEXTUAL TRUST BADGE
// ═════════════════════════════════════════════════════════════════════════════

interface TrustBadgeProps {
  phase: MachineState['type']
}

type PhaseConfig = { intent: string; text: string }

/**
 * Phase-based trust indicator. Rotates security focus per phase to avoid noise,
 * and uses real-time state intents instead of deterministic "Step X" counters.
 */
export const ContextualTrustBadge: React.FC<TrustBadgeProps> = ({ phase }) => {
  const phases: Partial<Record<MachineState['type'], PhaseConfig>> = {
    inputting: { intent: "Awaiting credentials...", text: "AES-256 encrypted. Never stored." },
    verifying: { intent: "Establishing secure handshake...", text: "Traffic routed via TLS 1.3 tunnel." },
    mapping: { intent: "Reading schema topology...", text: "Strict read-only permissions enforced." },
    analyzing: { intent: "Executing analytical query...", text: "Processing in isolated ephemeral container." },
    success: { intent: "Connection established.", text: "SOC 2 Type II compliant environment." },
    review: { intent: "Ready for review.", text: "SOC 2 Type II compliant environment." }
  }
  
  const config = phases[phase] || { intent: "Processing...", text: "Encrypted · Read-Only · SOC 2 Type II" }

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 bg-slate-50/80 py-4 border-t border-slate-200/50">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
        <span>{config.text}</span>
      </div>
      <div className="text-[10px] font-semibold text-slate-400 tracking-wide uppercase">
        {config.intent}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTIONABLE ERROR GUIDANCE
// ═════════════════════════════════════════════════════════════════════════════

interface ErrorGuidanceProps {
  error?: ConnectionError
  onRetry?: () => void
}

const Step = ({ index, isPrimary, children }: { index: number; isPrimary?: boolean; children: ReactNode }) => (
  <li className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all ${
    isPrimary 
      ? 'bg-blue-50/80 border-blue-200 shadow-sm' 
      : 'bg-transparent border-transparent opacity-80 hover:opacity-100'
  }`}>
    <div className={`flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold shrink-0 mt-0.5 ${
      isPrimary ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-200 text-slate-500'
    }`}>
      {index}
    </div>
    <div className="flex flex-col gap-1">
      {isPrimary && (
        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
          <Zap className="h-3 w-3 fill-current" /> Do this first
        </span>
      )}
      <span className={`text-sm ${isPrimary ? 'text-slate-900 font-semibold' : 'text-slate-600 font-medium'}`}>
        {children}
      </span>
    </div>
  </li>
)

/**
 * Intelligent error feedback component. 
 * Provides human-readable outcomes, qualitative confidence, and contextual recovery paths.
 */
export const ErrorGuidance: React.FC<ErrorGuidanceProps> = ({ error, onRetry }) => {
  if (!error) return null

  const msg = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  
  const AUTH_KEYWORDS = ['auth', 'password', 'credentials', 'denied']
  const NETWORK_KEYWORDS = ['timeout', 'network', 'host', 'connection refused']

  const isAuth = AUTH_KEYWORDS.some(k => msg.includes(k)) || error.type === 'invalid_credentials'
  const isNetwork = NETWORK_KEYWORDS.some(k => msg.includes(k)) || error.type === 'ip_allowlist'

  // Diagnostic context mapping
  let diagnostic = {
    title: "Connection failed.",
    cause: "This may be due to an invalid connection string format or an unsupported database version.",
    confidence: "Diagnostic complete",
    retryText: "Retry connection",
    steps: [
      { text: "Double-check your connection string and parameters.", isPrimary: true },
      { text: <>Contact <a href="mailto:support@arcli.tech" className="text-blue-600 font-bold hover:underline">support@arcli.tech</a> for engineering assistance.</>, isPrimary: false }
    ]
  }

  if (isAuth) {
    diagnostic = {
      title: "Authentication failed.",
      cause: "The username, password, or permissions don't match the database configuration.",
      confidence: "Most likely cause: Authentication mismatch",
      retryText: "Retry authentication",
      steps: [
        { text: "Re-check your username and password for typos.", isPrimary: true },
        { text: "Ensure the database user has explicit read-only access to the target schema.", isPrimary: false }
      ]
    }
  } else if (isNetwork) {
    diagnostic = {
      title: "Database unreachable.",
      cause: "Firewall, VPC, or network restrictions are blocking external connections.",
      confidence: "High confidence: Network or Firewall block",
      retryText: "Test connection again",
      steps: [
        { text: <>Whitelist Arcli’s connection IP: <code className="bg-white text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 font-mono text-xs shadow-sm">34.22.19.1</code></>, isPrimary: true },
        { text: "Check your database firewall or AWS/GCP VPC security group settings.", isPrimary: false }
      ]
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-6">
      {/* What & Why Header */}
      <div className="p-5 bg-slate-50/50 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-slate-900 mb-1">{diagnostic.title}</h4>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">{diagnostic.cause}</p>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200/50">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-slate-200/60 text-[11px] font-semibold text-slate-500 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                {diagnostic.confidence}
              </div>
              
              {/* Trust Reinforcement */}
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <Lock className="h-3 w-3" />
                Your data remains secure and unchanged.
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Actionable Steps */}
      <div className="p-4 pl-[42px]">
        <ul className="space-y-1">
          {diagnostic.steps.map((step, idx) => (
            <Step key={idx} index={idx + 1} isPrimary={step.isPrimary}>
              {step.text}
            </Step>
          ))}
        </ul>
      </div>

      {/* Resolution Loop Closure */}
      {onRetry && (
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">Updated your settings?</span>
          <button 
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-md shadow-sm transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {diagnostic.retryText}
          </button>
        </div>
      )}
    </div>
  )
}