import React from 'react'
import { z } from 'zod'

// ═════════════════════════════════════════════════════════════════════════════
// CORE DOMAIN TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type IntegrationType = 
  | 'supabase' 
  | 'vercel' 
  | 'railway' 
  | 'render' 
  | 'stripe' 
  | 'lemonsqueezy' 
  | 'postgres' 
  | 'shopify'

export type AuthParadigm = 'credentials' | 'oauth' | 'uri'

export type BackendPhaseKey = 
  | 'connecting' 
  | 'authenticating' 
  | 'validating_schema' 
  | 'mapping_tables' 
  | 'generating_insights' 
  | 'done' 
  | 'error'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

// ═════════════════════════════════════════════════════════════════════════════
// STATE MACHINE TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type MachineState =
  | { type: 'idle' }
  | { type: 'selecting' }
  | { type: 'inputting'; integrationId: IntegrationType }
  | { type: 'verifying'; integrationId: IntegrationType; jobId: string }
  | { type: 'mapping'; integrationId: IntegrationType; tables: DetectedTable[] }
  | { type: 'analyzing'; integrationId: IntegrationType; tables: DetectedTable[] }
  | { type: 'review'; integrationId: IntegrationType; result: ConnectionResult }
  | { type: 'saving'; integrationId: IntegrationType }
  | { type: 'success'; integrationId: IntegrationType; insights: FirstInsight[] }
  | { type: 'error'; integrationId: IntegrationType; error: ConnectionError; showDebug?: boolean }
  | { type: 'oauth_redirecting'; integrationId: IntegrationType }

export type MachineAction =
  | { type: 'SELECT_INTEGRATION'; integrationId: IntegrationType }
  | { type: 'BACK_TO_SELECT' }
  | { type: 'START_VERIFICATION'; jobId: string }
  | { type: 'TABLE_DETECTED'; table: DetectedTable }
  | { type: 'MAPPING_COMPLETE'; tables: DetectedTable[] }
  | { type: 'ANALYSIS_COMPLETE'; result: ConnectionResult }
  | { type: 'START_SAVING' }
  | { type: 'SAVE_SUCCESS'; insights: FirstInsight[] }
  | { type: 'ERROR'; error: ConnectionError }
  | { type: 'RETRY' }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'CLOSE' }
  | { type: 'START_OAUTH' }

export interface MachineContext {
  formData: Record<string, string>
  fieldErrors: Record<string, string>
  detectedTables: DetectedTable[]
  currentPhase: BackendPhaseKey
  autofillMeta: { dbName?: string; host?: string }
}

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION & DEBUGGING INTERFACES
// ═════════════════════════════════════════════════════════════════════════════

export interface ConnectionError {
  message: string
  type: 'ip_allowlist' | 'invalid_credentials' | 'timeout' | 'ssl_error' | 'permission_denied' | 'unknown'
  fix?: string
  actionLabel?: string
  actionHref?: string
  debugInfo?: DebugInfo
}

export interface DebugInfo {
  timestamp: string
  requestId: string
  queryAttempts: { query: string; duration: number; error?: string }[]
  connectionDetails: { host?: string; port?: number; ssl?: boolean; version?: string }
}

export interface FirstInsight {
  label: string
  value: string
  change: { value: number; direction: 'up' | 'down' }
  icon: React.ElementType
  color: string
}

export interface DetectedTable {
  name: string
  rowCount: string
  mappingStatus: 'ok' | 'warning' | 'error'
  confidence: ConfidenceLevel
  purpose?: string
  suggestedDashboards?: string[]
}

export interface ConnectionResult {
  success: boolean
  partialSuccess?: boolean
  tables: DetectedTable[]
  unmappedTables?: string[]
  partialReason?: string
  aiAnalysis?: {
    detectedPatterns: string[]
    suggestedDashboards: { name: string; icon: React.ElementType; description: string }[]
    dataQuality: 'excellent' | 'good' | 'fair' | 'poor'
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION INTERFACES
// ═════════════════════════════════════════════════════════════════════════════

export interface IntegrationConfig {
  id: IntegrationType
  name: string
  category: 'Database' | 'Payment Provider' | 'E-commerce'
  authType: AuthParadigm
  description: string
  icon: React.ElementType
  color: string
  isPopular?: boolean
  fields: IntegrationField[]
  validationSchema: z.ZodObject<any>
  tableInsights?: Record<string, TableInsight>
  insights?: InsightPreview[]
}

export interface TableInsight {
  purpose: string
  dashboards: string[]
  confidence: ConfidenceLevel
}

export interface InsightPreview {
  label: string
  icon: React.ElementType
  color: string
  description?: string
}

export interface IntegrationField {
  name: string
  label: string
  type: 'text' | 'password' | 'select'
  placeholder?: string
  helperText?: string
  whyWeNeedThis?: string
  options?: { label: string; value: string }[]
  validationHint?: string
  autofillSource?: boolean
  autoDetectPattern?: RegExp
}

export interface PhaseMeta {
  label: string
  message: string
  subMessage: string
  icon: React.ElementType
  color: string
  progress: number
}