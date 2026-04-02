import React from 'react'
import { ShieldCheck, AlertCircle } from 'lucide-react'
import type { MachineState, ConnectionError } from '@/types/integration'

// ═════════════════════════════════════════════════════════════════════════════
// CONTEXTUAL TRUST BADGE
// ═════════════════════════════════════════════════════════════════════════════

interface TrustBadgeProps {
  phase: MachineState['type']
}

/**
 * Renders a highly contextual, structured trust indicator mapped directly 
 * to the active state machine phase to reassure users during credential operations.
 */
export const ContextualTrustBadge: React.FC<TrustBadgeProps> = ({ phase }) => {
  const messages: Record<string, string> = {
    inputting: "Credentials are AES-256 encrypted and never stored.",
    verifying: "Establishing secure, read-only temporary tunnel.",
    mapping: "Establishing secure, read-only temporary tunnel.",
    analyzing: "Processing data in an isolated, SOC 2 compliant environment.",
    success: "Data encrypted at rest. SOC 2 compliant environment.",
    review: "Data encrypted at rest. SOC 2 compliant environment."
  }
  
  const msg = messages[phase] || "AES-256 Encrypted · Read-Only Access · SOC 2 Type II"

  return (
    <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-slate-500 bg-slate-50/80 py-3 border-t border-slate-200/60">
      <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
      <span>{msg}</span>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTIONABLE ERROR GUIDANCE
// ═════════════════════════════════════════════════════════════════════════════

interface ErrorGuidanceProps {
  error: ConnectionError | any
}

/**
 * Intelligent error feedback component. Parses the raw error metadata 
 * and outputs structured, engineered steps for user remediation.
 * Uses layered slate tones rather than alarming solid reds for a technical feel.
 */
export const ErrorGuidance: React.FC<ErrorGuidanceProps> = ({ error }) => {
  const msg = error?.message?.toLowerCase() || ''
  const isAuth = msg.includes('auth') || msg.includes('password') || msg.includes('credentials') || error?.type === 'invalid_credentials'
  const isNetwork = msg.includes('timeout') || msg.includes('network') || msg.includes('host') || error?.type === 'ip_allowlist'

  return (
    <div className="bg-slate-50/50 rounded-xl border border-slate-200/80 p-5 mb-6 shadow-sm">
      <p className="text-[13px] font-bold text-slate-900 mb-3 tracking-tight flex items-center gap-1.5">
        <AlertCircle className="h-4 w-4 text-slate-400" />
        Recommended Fix:
      </p>
      
      <ul className="text-[13px] text-slate-600 space-y-2.5 font-medium">
        {isAuth ? (
          <>
            <li className="flex items-start gap-2.5">
              <span className="text-slate-400 font-bold">1.</span> 
              Verify your username and password.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-slate-400 font-bold">2.</span> 
              Ensure the database user has read-only access to the target schema.
            </li>
          </>
        ) : isNetwork ? (
          <>
            <li className="flex items-start gap-2.5">
              <span className="text-slate-400 font-bold">1.</span> 
              Check your database firewall or VPC settings.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-slate-400 font-bold">2.</span> 
              Whitelist Arcli IPs: <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px] shadow-sm">34.22.19.1</code>
            </li>
          </>
        ) : (
          <>
            <li className="flex items-start gap-2.5">
              <span className="text-slate-400 font-bold">1.</span> 
              Double-check your connection string and parameters.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-slate-400 font-bold">2.</span> 
              Contact <a href="mailto:support@arcli.tech" className="text-blue-600 font-bold hover:text-blue-700 hover:underline transition-colors">support@arcli.tech</a> for engineering assistance.
            </li>
          </>
        )}
      </ul>
    </div>
  )
}