// components/MessageBubble.tsx
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

const PROSE_CLASSNAME =
  'prose prose-slate prose-sm sm:prose-base max-w-none text-slate-700 leading-relaxed prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-900 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-slate-900 prose-code:rounded-md prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:px-4 prose-pre:py-3 prose-pre:text-slate-100 prose-pre:shadow-inner';

function formatMessageTime(message: Message): string {
  const raw = message.timestamp ?? message.createdAt;
  if (!raw) return 'Just now';

  const parsed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'Just now';

  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      <div className="mb-6 flex w-full justify-center">
        <div className="flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700 shadow-sm">
          <AlertCircle size={14} />
          {message.content}
        </div>
      </div>
    );
  }

  const timestampLabel = formatMessageTime(message);

  return (
    <div className={`mb-8 flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex w-full max-w-4xl ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex w-full max-w-3xl items-end gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div
            className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              isUser ? 'bg-slate-200 text-slate-500' : 'bg-[#11284b] text-white'
            }`}
            aria-hidden="true"
          >
            {isUser ? <UserRound size={15} /> : <Sparkles size={15} />}
          </div>

          <div className={`flex min-w-0 flex-col ${isUser ? 'items-end' : 'items-start'}`}>
            {/* 1. The Main Text Bubble (Narrative / User Input) */}
            <div
              className={`max-w-2xl rounded-2xl px-5 py-4 shadow-sm ${
                isUser
                  ? 'rounded-br-md bg-blue-50 text-slate-800'
                  : isError
                    ? 'rounded-bl-md bg-rose-50 text-rose-800'
                    : 'rounded-bl-md bg-white/90 text-slate-700'
              }`}
            >
              {message.content ? (
                <div className={`${PROSE_CLASSNAME} ${isUser ? 'prose-p:text-slate-800' : ''}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-[15px] leading-relaxed text-slate-400 italic">Thinking...</p>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-400">
              <span>{isUser ? 'You' : 'Arcli'}</span>
              <span>•</span>
              <span>{timestampLabel}</span>
              {!isUser && message.status && (
                <>
                  <span>•</span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                    {message.status}
                  </span>
                </>
              )}
            </div>

            {/* --- ASSISTANT ONLY: RICH EXECUTION PAYLOADS --- */}
            {!isUser && !isError && (
              <div className="mt-3 flex w-full max-w-3xl flex-col gap-2.5">
                {/* 2. Strategy & Intent Plan (Expandable) */}
                {message.plan && (
                  <div className="overflow-hidden rounded-xl bg-white/85 shadow-sm">
                    <button
                      onClick={() => setShowPlan(!showPlan)}
                      className="flex w-full items-center justify-between bg-slate-50/80 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100/80"
                    >
                      <span className="flex items-center gap-2 text-[#11284b]">
                        <BrainCircuit size={16} />
                        Execution Strategy ({message.plan.execution_intent || 'ANALYTICAL'})
                      </span>
                      {showPlan ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                    </button>
                    {showPlan && (
                      <div className="space-y-3 border-t border-slate-100 bg-white px-4 py-4 text-sm text-slate-600">
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
                  <div className="mt-1 rounded-xl bg-emerald-50/80 p-4 text-sm text-emerald-900 shadow-sm">
                    <h4 className="mb-2 flex items-center gap-2 font-semibold tracking-tight text-emerald-800">
                      <Lightbulb size={16} /> Data Engine Insights
                    </h4>
                    <p>{message.insights.summary || 'Statistical analysis completed.'}</p>
                  </div>
                )}

                {/* 4. Root Cause Diagnostics (Expandable if Anomalies found) */}
                {message.diagnostics && (
                  <div className="mt-1 overflow-hidden rounded-xl bg-amber-50/85 shadow-sm">
                    <button
                      onClick={() => setShowDiagnostics(!showDiagnostics)}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100/50"
                    >
                      <span className="flex items-center gap-2">
                        <Search size={16} />
                        Anomaly Detected: View Root Cause
                      </span>
                      {showDiagnostics ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {showDiagnostics && (
                      <div className="space-y-2 border-t border-amber-200/50 bg-amber-50/30 p-4 text-sm text-amber-900">
                        <p><strong>Analysis:</strong> {message.diagnostics.root_cause_analysis}</p>
                        {message.diagnostics.recommended_actions?.length > 0 && (
                          <ul className="mt-2 list-disc space-y-1 pl-5">
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
                  <div className="mt-1 w-full overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400 shadow-inner">
                    <pre className="whitespace-pre-wrap leading-relaxed">{message.sql}</pre>
                  </div>
                )}

                {/* 6. Data Visualization: Chart or Table */}
                {message.data && message.data.length > 0 && (
                  <div className="mt-2 w-full">
                    {message.chartSpec ? (
                      <VegaChart spec={message.chartSpec} data={message.data} />
                    ) : (
                      <div className="overflow-x-auto rounded-xl bg-white/90 shadow-sm">
                        <table className="w-full text-left text-sm text-slate-600">
                          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase text-slate-500">
                            <tr>
                              {Object.keys(message.data[0]).map((key) => (
                                <th key={key} className="whitespace-nowrap px-5 py-4 font-semibold tracking-wider">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {/* Preview top 5 rows to prevent massive UI bloat */}
                            {message.data.slice(0, 5).map((row, idx) => (
                              <tr key={idx} className="transition-colors hover:bg-slate-50/80">
                                {Object.values(row).map((val: any, i) => (
                                  <td key={i} className="whitespace-nowrap px-5 py-3">
                                    {val === null ? (
                                      <span className="italic text-slate-300">null</span>
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
                          <div className="w-full border-t border-slate-100 bg-slate-50 p-3 text-center text-xs font-medium text-slate-500">
                            Showing top 5 of {message.data.length} rows.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 7. Footer Execution Metadata */}
                {message.executionTimeMs && (
                  <div className="mt-1 flex items-center gap-4 pl-2 text-xs font-medium text-slate-400">
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
                        className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-[#11284b]"
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
      </div>
    </div>
  );
};