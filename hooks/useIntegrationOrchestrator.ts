/**
 * @file hooks/useIntegrationOrchestrator.ts
 * @description Centralized state orchestration for the integration connection flow.
 * Decouples the pure state machine logic and side-effect telemetry from the React presentation layer.
 */

import { useEffect, useCallback, useState, useMemo } from 'react'
import type { 
  MachineState, 
  MachineContext, 
  MachineAction 
} from '@/types/integration'
import { initialContext, machineReducer } from '@/lib/state-machine'

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS & HEURISTICS
// ═════════════════════════════════════════════════════════════════════════════

/** Minimum string length to trigger Regex pattern matching on paste events */
export const PASTE_DETECTION_THRESHOLD = 20

/** Sequenced feedback messages to display during asynchronous operations */
export const PROCESSING_MESSAGES: readonly string[] = [
  "Negotiating SSL handshake...",
  "Authenticating credentials...",
  "Analyzing schema architecture...",
  "Mapping primary keys & relations...",
  "Optimizing analytical indices..."
] as const

// ═════════════════════════════════════════════════════════════════════════════
// OBSERVABILITY & METRICS
// ═════════════════════════════════════════════════════════════════════════════

export const Telemetry = {
  /**
   * Tracks discrete user actions and system events.
   * @param event The event name (e.g., 'Modal Opened', 'State Transition')
   * @param meta Optional structured metadata for the event
   */
  track: (event: string, meta?: Record<string, unknown>): void => {
    // Note: In production, route this to Datadog, PostHog, or Segment.
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[Arcli Telemetry] ${event}`, meta || '')
    }
  },

  /**
   * Performance timer for critical execution paths.
   * @param label Identifier for the timed operation
   * @returns A closure to call when the operation completes
   */
  time: (label: string): (() => void) => {
    const start = performance.now()
    return () => {
      const duration = (performance.now() - start).toFixed(2)
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[Arcli Performance] ${label} took ${duration}ms`)
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION HOOK
// ═════════════════════════════════════════════════════════════════════════════

export interface UseIntegrationOrchestratorReturn {
  state: MachineState
  context: MachineContext
  dispatch: (action: MachineAction) => void
  updateContext: (updates: Partial<MachineContext>) => void
}

/**
 * Custom hook to manage the lifecycle, state transitions, and context of the integration modal.
 * @param isOpen Boolean indicating if the modal is currently visible to the user.
 */
export function useIntegrationOrchestrator(isOpen: boolean): UseIntegrationOrchestratorReturn {
  const [state, setState] = useState<MachineState>({ type: 'idle' })
  const [context, setContext] = useState<MachineContext>(initialContext)
  
  /**
   * Dispatcher for state transitions. Evaluates the action against the pure reducer.
   */
  const dispatch = useCallback((action: MachineAction) => {
    Telemetry.track(`State Transition: ${action.type}`, { from: state.type })
    
    setState(currentState => {
      const nextState = machineReducer(currentState, action, context)
      if (currentState.type !== nextState.type && process.env.NODE_ENV !== 'production') {
        console.debug(`[State Machine] ${currentState.type} → ${nextState.type}`)
      }
      return nextState
    })
  }, [context, state.type])

  /**
   * Mutator for isolated context updates (form data, errors, etc.) that don't trigger a phase transition.
   */
  const updateContext = useCallback((updates: Partial<MachineContext>) => {
    setContext(prev => ({ ...prev, ...updates }))
  }, [])

  /**
   * Hard reset trigger linked to the visual lifecycle of the modal.
   * Ensures no stale state leaks into subsequent connection attempts.
   */
  useEffect(() => {
    if (!isOpen) {
      setState({ type: 'idle' })
      setContext(initialContext)
    } else {
      Telemetry.track('Modal Opened')
    }
  }, [isOpen])

  // Memoize the return payload to prevent unnecessary re-renders in the view layer
  return useMemo(() => ({
    state,
    context,
    dispatch,
    updateContext
  }), [state, context, dispatch, updateContext])
}