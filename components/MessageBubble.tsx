// components/MessageBubble.tsx
import React, { useState } from 'react';
import { Message } from '@/types/chat';
import { VegaChart } from './VegaChart';
import { 
  Terminal, 
  Database, 
  Clock, 
  AlertCircle, 
  BrainCircuit, 
  ChevronDown, 
  ChevronRight,
  Lightbulb,
  Search
} from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isError = message.status === 'error' || message.status === 'execution_error';
  const requestedMetrics = message.plan?.requested_governed_metrics ?? [];
  
  // UI State for expandable "Chain of Thought" sections
  const [showSql, setShowSql] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // System messages (like connection errors) get a special centered layout
  if (isSystem) {
    return (
      <div className="flex w-full justify-center mb-6">
        <div className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-medium flex items-center gap-2 shadow-sm">
          <AlertCircle size={14} />
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-8`}>
      <div className={`max-w-4xl w-full flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* 1. The Main Text Bubble (Narrative / User Input) */}
        <div className={`px-5 py-4 rounded-2xl max-w-2xl shadow-sm ${
          isUser 
            ? 'bg-blue-600 text-white rounded-br-none' 
            : isError 
              ? 'bg-red-50 border border-red-200 text-red-800 rounded-bl-none'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
        }`}>
          {message.content ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
             <p className="text-[15px] leading-relaxed text-gray-400 italic">Thinking...</p>
          )}
        </div>

        {/* --- ASSISTANT ONLY: RICH EXECUTION PAYLOADS --- */}
        {!isUser && !isError && (
          <div className="flex flex-col gap-2 mt-3 w-full max-w-3xl">
            
            {/* 2. Strategy & Intent Plan (Expandable) */}
            {message.plan && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <button 
                  onClick={() => setShowPlan(!showPlan)}
                  className="w-full px-4 py-2.5 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors text-sm font-medium text-gray-700"
                >
                  <span className="flex items-center gap-2 text-indigo-600">
                    <BrainCircuit size={16} /> 
                    Execution Strategy ({message.plan.execution_intent || 'ANALYTICAL'})
                  </span>
                  {showPlan ? <ChevronDown size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}
                </button>
                {showPlan && (
                  <div className="p-4 text-sm text-gray-600 border-t border-gray-100 bg-white space-y-3">
                    <p><strong>Intent:</strong> {message.plan.intent_summary}</p>
                    <p><strong>Strategy:</strong> {message.plan.analytical_strategy}</p>
                    {requestedMetrics.length > 0 && (
                      <p><strong>Metrics Injected:</strong> {requestedMetrics.join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. Mathematical Insights (Auto-rendered if present) */}
            {message.insights && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 shadow-sm text-sm text-emerald-900 mt-1">
                <h4 className="flex items-center gap-2 font-semibold text-emerald-800 mb-2">
                  <Lightbulb size={16} /> Data Engine Insights
                </h4>
                <p>{message.insights.summary || 'Statistical analysis completed.'}</p>
              </div>
            )}

            {/* 4. Root Cause Diagnostics (Expandable if Anomalies found) */}
            {message.diagnostics && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden shadow-sm mt-1">
                <button 
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="w-full px-4 py-2.5 hover:bg-amber-100/50 flex items-center justify-between transition-colors text-sm font-medium text-amber-800"
                >
                  <span className="flex items-center gap-2">
                    <Search size={16} /> 
                    Anomaly Detected: View Root Cause
                  </span>
                  {showDiagnostics ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {showDiagnostics && (
                  <div className="p-4 text-sm text-amber-900 border-t border-amber-200/50 bg-amber-50/30 space-y-2">
                    <p><strong>Analysis:</strong> {message.diagnostics.root_cause_analysis}</p>
                    {message.diagnostics.recommended_actions?.length > 0 && (
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        {message.diagnostics.recommended_actions.map((act: string, i: number) => (
                          <li key={i}>{act}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 5. SQL Debug View */}
            {showSql && message.sql && (
              <div className="w-full mt-1 p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto shadow-inner border border-slate-800">
                <pre className="whitespace-pre-wrap leading-relaxed">{message.sql}</pre>
              </div>
            )}

            {/* 6. Data Visualization: Chart or Table */}
            {message.data && message.data.length > 0 && (
              <div className="w-full mt-2">
                {message.chartSpec ? (
                  <VegaChart spec={message.chartSpec} data={message.data} />
                ) : (
                  <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
                    <table className="w-full text-sm text-left text-gray-600">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50/80 border-b border-gray-200">
                        <tr>
                          {Object.keys(message.data[0]).map((key) => (
                            <th key={key} className="px-5 py-4 font-semibold tracking-wider whitespace-nowrap">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {/* Preview top 5 rows to prevent massive UI bloat */}
                        {message.data.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                            {Object.values(row).map((val: any, i) => (
                              <td key={i} className="px-5 py-3 whitespace-nowrap">
                                {val === null ? (
                                  <span className="text-gray-300 italic">null</span>
                                ) : typeof val === 'object' ? (
                                  JSON.stringify(val)
                                ) : (
                                  String(val)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {message.data.length > 5 && (
                      <div className="w-full text-center p-3 text-xs text-gray-500 bg-gray-50 border-t border-gray-100 font-medium">
                        Showing top 5 of {message.data.length} rows.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 7. Footer Execution Metadata */}
            {message.executionTimeMs && (
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-400 pl-2 font-medium">
                <span className="flex items-center gap-1.5" title="Execution Time">
                  <Clock size={14} /> {message.executionTimeMs}ms
                </span>
                {message.data && (
                  <span className="flex items-center gap-1.5" title="Rows Returned">
                    <Database size={14} /> {message.data.length} rows
                  </span>
                )}
                {message.sql && (
                  <button 
                    onClick={() => setShowSql(!showSql)} 
                    className="flex items-center gap-1.5 hover:text-blue-500 transition-colors cursor-pointer"
                  >
                    <Terminal size={14} /> {showSql ? 'Hide SQL' : 'View SQL'}
                  </button>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};