/**
 * @file lib/connection-service.ts
 * @description Manages external integration health checks, schema discovery, and real-time status 
 * updates via Server-Sent Events (SSE) with adaptive fallback to HTTP polling.
 * Enforces strict memory management (AbortControllers) to prevent React memory leaks.
 */

import type { 
  BackendPhaseKey, 
  DetectedTable, 
  ConnectionResult, 
  ConnectionError, 
  IntegrationType 
} from '@/types/integration'

// ═════════════════════════════════════════════════════════════════════════════
// INTERFACES & CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

export interface PollingCallbacks {
  onPhase: (phase: BackendPhaseKey) => void
  onTable: (table: DetectedTable) => void
  onComplete: (result: ConnectionResult) => void
  onError: (error: ConnectionError) => void
}

export interface ConnectionServiceConfig {
  /** Enables Server-Sent Events. Set to false to force HTTP Polling. */
  useSSE?: boolean
  /** Polling interval in milliseconds if SSE is disabled or fails. */
  pollingIntervalMs?: number
}

const DEFAULT_CONFIG: Required<ConnectionServiceConfig> = {
  useSSE: true,
  pollingIntervalMs: 800,
}

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════════════

export class ConnectionService {
  private abortController: AbortController | null = null
  private eventSource: EventSource | null = null
  private fallbackInterval: NodeJS.Timeout | null = null
  private config: Required<ConnectionServiceConfig>

  constructor(config?: ConnectionServiceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initiates the connection verification process.
   * Attempts SSE stream first (if configured), falling back to polling gracefully.
   */
  public async start(jobId: string, token: string, callbacks: PollingCallbacks): Promise<void> {
    this.stop() // Ensure clean state before starting
    this.abortController = new AbortController()

    if (this.config.useSSE && typeof EventSource !== 'undefined') {
      try { 
        await this.connectSSE(jobId, token, callbacks)
        return 
      } catch (error) { 
        console.warn('[ConnectionService] SSE connection failed, degrading to HTTP polling.', error)
        // Silently fallback to polling
      }
    }
    
    await this.startPolling(jobId, token, callbacks)
  }

  /**
   * Immediately terminates all active network requests, streams, and timers.
   * MUST be called on component unmount to prevent memory leaks.
   */
  public stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    if (this.fallbackInterval) {
      clearTimeout(this.fallbackInterval)
      this.fallbackInterval = null
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // INTERNAL NETWORKING LOGIC
  // ═════════════════════════════════════════════════════════════════════════════

  private async connectSSE(jobId: string, token: string, callbacks: PollingCallbacks): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/v1/integrations/test/stream', window.location.origin)
      url.searchParams.append('job_id', jobId)
      url.searchParams.append('token', token)

      const es = new EventSource(url.toString())
      this.eventSource = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleEvent(data, callbacks)
          
          if (data.phase === 'done' || data.phase === 'error') { 
            this.stop()
            resolve() 
          }
        } catch (err) {
          console.error('[ConnectionService] Failed to parse SSE payload:', err)
        }
      }

      es.onerror = () => { 
        this.stop()
        reject(new Error('SSE Stream interrupted or failed to connect')) 
      }
    })
  }

  private async startPolling(jobId: string, token: string, callbacks: PollingCallbacks): Promise<void> {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/integrations/test/status?job_id=${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: this.abortController?.signal,
        })
        
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(errText || `HTTP ${res.status}`)
        }
        
        const data = await res.json()
        this.handleEvent(data, callbacks)
        
        // Schedule next poll if not in a terminal state
        if (data.phase !== 'done' && data.phase !== 'error') {
          this.fallbackInterval = setTimeout(poll, this.config.pollingIntervalMs)
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          callbacks.onError(this.parseError(err.message))
          this.stop() // Halt polling on hard error
        }
      }
    }
    
    poll() // Fire initial request
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // DATA TRANSFORMATION & ERROR ROUTING
  // ═════════════════════════════════════════════════════════════════════════════

  private handleEvent(data: any, callbacks: PollingCallbacks): void {
    if (data.phase) callbacks.onPhase(data.phase as BackendPhaseKey)
    if (data.detectedTable) callbacks.onTable(data.detectedTable as DetectedTable)
    if (data.phase === 'done' && data.result) callbacks.onComplete(data.result as ConnectionResult)
    if (data.phase === 'error') callbacks.onError(this.parseError(data.error || 'Unknown backend error occurred'))
  }

  private parseError(message: string): ConnectionError {
    const patterns: Array<{ pattern: RegExp; error: Omit<ConnectionError, 'message'> }> = [
      { 
        pattern: /connection.*refused|ECONNREFUSED/i, 
        error: { type: 'ip_allowlist', fix: 'Add Arcli IPs to your allowlist: 44.223.108.0/24', actionLabel: 'View all IPs', actionHref: '/docs/security/ip-allowlist' } 
      },
      { 
        pattern: /password.*authentication|invalid.*credential/i, 
        error: { type: 'invalid_credentials', fix: 'Verify your password and ensure the connection string is complete', actionLabel: 'Test credentials' } 
      },
      { 
        pattern: /timeout|ETIMEDOUT|sleeping/i, 
        error: { type: 'timeout', fix: 'Wake your database (Railway/Render free tier) or check network settings', actionLabel: 'How to wake', actionHref: '/docs/troubleshooting/database-sleep' } 
      },
      { 
        pattern: /ssl|certificate|TLS/i, 
        error: { type: 'ssl_error', fix: 'Ensure your database supports TLS 1.2+ and certificates are valid', actionLabel: 'SSL troubleshooting', actionHref: '/docs/troubleshooting/ssl' } 
      },
      { 
        pattern: /permission|access.*denied|insufficient.*privilege/i, 
        error: { type: 'permission_denied', fix: 'Grant SELECT permissions on the tables you want to analyze', actionLabel: 'Required permissions', actionHref: '/docs/security/required-permissions' } 
      },
    ]

    for (const { pattern, error } of patterns) {
      if (pattern.test(message)) {
        return { message, ...error }
      }
    }
    
    return { 
      message, 
      type: 'unknown', 
      fix: 'Please check your credentials and try again. If the issue persists, contact support@arcli.tech' 
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PURE UTILITY FUNCTIONS (Stateless Parsers)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Extracts database name and host from standard PostgreSQL URIs.
 * Optimized for smart auto-filling of UI fields.
 */
export function tryExtractDbMeta(uri: string): { dbName?: string; host?: string } {
  try {
    // Matches: postgresql://user:pass@host:port/dbname?params
    const match = uri.match(/^postgres(?:ql)?:\/\/[^@]+@([^/:]+)(?::\d+)?\/(.+)$/)
    if (match) {
      return { host: match[1], dbName: match[2].split('?')[0] }
    }
  } catch {
    // Fail silently, regex errors should not crash the form
  }
  return {}
}

/**
 * Identifies the specific SaaS/DB platform purely based on input string patterns.
 * Essential for the "magic paste" auto-detection UI logic.
 */
export function detectIntegrationFromInput(input: string): IntegrationType | null {
  const integrationSignatures: Array<{ pattern: RegExp; id: IntegrationType }> = [
    { pattern: /^postgres(ql)?:\/\/postgres\./, id: 'supabase' },
    { pattern: /^postgres(ql)?:\/\/default:/, id: 'vercel' },
    { pattern: /^(sk|rk)_(live|test)_/, id: 'stripe' },
    { pattern: /^eyJ/, id: 'lemonsqueezy' }, // Common JWT prefix used by LS
    { pattern: /\.myshopify\.com$/, id: 'shopify' },
  ]

  for (const { pattern, id } of integrationSignatures) {
    if (pattern.test(input)) return id
  }
  return null
}