/**
 * @file lib/state-machine.ts
 * @description Pure functional state machine reducer for the Arcli Integration workflow.
 * Enforces strict, predictable state transitions to prevent race conditions and invalid UI states.
 * * Architectural Rule: This module MUST remain 100% stateless and side-effect free.
 * All side-effects (API calls, SSE connections) must be handled by the orchestrator in response to these state shifts.
 */

import type { 
  MachineState, 
  MachineAction, 
  MachineContext 
} from '@/types/integration'

// ═════════════════════════════════════════════════════════════════════════════
// INITIAL CONTEXT SETUP
// ═════════════════════════════════════════════════════════════════════════════

export const initialContext: Readonly<MachineContext> = {
  formData: {},
  fieldErrors: {},
  detectedTables: [],
  currentPhase: 'connecting',
  autofillMeta: {},
}

// ═════════════════════════════════════════════════════════════════════════════
// PURE REDUCER LOGIC
// ═════════════════════════════════════════════════════════════════════════════

export function machineReducer(
  state: MachineState, 
  action: MachineAction, 
  context: MachineContext
): MachineState {
  switch (state.type) {
    
    // -- ENTRY STATES ---------------------------------------------------------
    case 'idle':
    case 'selecting':
      if (action.type === 'SELECT_INTEGRATION') {
        return { type: 'inputting', integrationId: action.integrationId }
      }
      return state
    
    // -- INPUT & CONFIGURATION ------------------------------------------------
    case 'inputting':
      switch (action.type) {
        case 'BACK_TO_SELECT': 
          return { type: 'selecting' }
        case 'START_VERIFICATION': 
          return { type: 'verifying', integrationId: state.integrationId, jobId: action.jobId }
        case 'START_OAUTH': 
          return { type: 'oauth_redirecting', integrationId: state.integrationId }
        case 'CLOSE': 
          return { type: 'idle' }
        default: 
          return state
      }
    
    // -- ASYNC PROCESSING STATES ----------------------------------------------
    case 'verifying':
      switch (action.type) {
        case 'TABLE_DETECTED': 
          // Transition to mapping while appending the newly detected table safely
          return { 
            type: 'mapping', 
            integrationId: state.integrationId, 
            tables: [...context.detectedTables, action.table] 
          }
        case 'MAPPING_COMPLETE': 
          return { type: 'analyzing', integrationId: state.integrationId, tables: action.tables }
        case 'ERROR': 
          return { type: 'error', integrationId: state.integrationId, error: action.error, showDebug: false }
        default: 
          return state
      }
    
    case 'mapping':
      switch (action.type) {
        case 'TABLE_DETECTED': 
          return { type: 'mapping', integrationId: state.integrationId, tables: [...state.tables, action.table] }
        case 'ANALYSIS_COMPLETE': 
          return { type: 'review', integrationId: state.integrationId, result: action.result }
        case 'ERROR': 
          return { type: 'error', integrationId: state.integrationId, error: action.error, showDebug: false }
        default: 
          return state
      }
    
    case 'analyzing':
      switch (action.type) {
        case 'ANALYSIS_COMPLETE': 
          return { type: 'review', integrationId: state.integrationId, result: action.result }
        case 'ERROR': 
          return { type: 'error', integrationId: state.integrationId, error: action.error, showDebug: false }
        default: 
          return state
      }
    
    // -- REVIEW & CONFIRMATION ------------------------------------------------
    case 'review':
      switch (action.type) {
        case 'START_SAVING': 
          return { type: 'saving', integrationId: state.integrationId }
        case 'BACK_TO_SELECT': 
          return { type: 'selecting' }
        case 'RETRY': 
          return { type: 'inputting', integrationId: state.integrationId }
        default: 
          return state
      }
    
    case 'saving':
      switch (action.type) {
        case 'SAVE_SUCCESS': 
          return { type: 'success', integrationId: state.integrationId, insights: action.insights }
        case 'ERROR': 
          return { type: 'error', integrationId: state.integrationId, error: action.error, showDebug: false }
        default: 
          return state
      }
    
    // -- TERMINAL & RESOLUTION STATES -----------------------------------------
    case 'success':
      if (action.type === 'CLOSE') {
        return { type: 'idle' }
      }
      return state
    
    case 'error':
      switch (action.type) {
        case 'RETRY': 
          return { type: 'inputting', integrationId: state.integrationId }
        case 'BACK_TO_SELECT': 
          return { type: 'selecting' }
        case 'TOGGLE_DEBUG': 
          return { ...state, showDebug: !state.showDebug }
        case 'CLOSE': 
          return { type: 'idle' }
        default: 
          return state
      }
    
    case 'oauth_redirecting': 
      // Handled externally. State machine locks until a hard refresh/redirect occurs.
      return state
      
    // -- SAFETY FALLBACK ------------------------------------------------------
    default: 
      return state
  }
}