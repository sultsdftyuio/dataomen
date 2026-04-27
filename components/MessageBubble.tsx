// components/MessageBubble.tsx
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/chat';
import { VegaChart } from './VegaChart';
import { DashboardCard } from './chat/DashboardCard';
import { cn } from '@/lib/utils';
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
  Copy,
  Check,
} from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
  isGroupedWithPrevious?: boolean;
}

const PROSE_CLASSNAME =
  'prose prose-slate dark:prose-invert max-w-none text-[15px] leading-7 sm:text-base prose-p:my-2 prose-p:leading-7 prose-headings:mb-1.5 prose-headings:mt-4 prose-headings:font-semibold prose-headings:leading-tight prose-headings:tracking-tight prose-headings:text-slate-900 dark:prose-headings:text-slate-50 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-slate-900 dark:prose-strong:text-slate-50 prose-code:rounded-md prose-code:bg-slate-100/90 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:text-slate-700 dark:prose-code:bg-slate-800 dark:prose-code:text-slate-200 prose-code:before:content-none prose-code:after:content-none prose-table:my-4 prose-table:w-full prose-th:bg-slate-50/70 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:text-[11px] prose-th:font-semibold prose-th:uppercase prose-th:tracking-wider prose-th:text-slate-500 prose-td:px-4 prose-td:py-2 prose-td:text-slate-700 dark:prose-td:text-slate-200';

function getCodeLanguage(className?: string): string {
  if (!className) return 'code';
  const langMatch = className.match(/language-([\w-]+)/);
  return langMatch?.[1] || 'code';
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="group/code my-4 overflow-hidden rounded-xl bg-slate-950/95 shadow-[0_18px_46px_-34px_rgba(15,23,42,0.8),inset_0_0_0_1px_rgba(148,163,184,0.2)]">
      <div className="flex items-center justify-between bg-slate-900/80 px-3 py-1.5 shadow-[inset_0_-1px_0_rgba(148,163,184,0.25)]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{language}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-slate-300 opacity-0 transition-opacity hover:bg-slate-800/70 group-hover/code:opacity-100"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-4 py-3 text-[13px] leading-6 text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function formatMessageTime(message: Message): string {
  const raw = message.timestamp ?? message.createdAt;
  if (!raw) return 'Just now';

  const parsed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'Just now';

  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  showAvatar = true,
  isGroupedWithPrevious = false,
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isError = message.status === 'error' || message.status === 'execution_error';
  const requestedMetrics = message.plan?.requested_governed_metrics ?? [];

  // UI State for expandable "Chain of Thought" sections
  const [showSql, setShowSql] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const markdownClassName = useMemo(
    () =>
      cn(PROSE_CLASSNAME, {
        'prose-p:text-slate-700 dark:prose-p:text-slate-50': !isUser,
        'prose-p:text-slate-900 dark:prose-p:text-slate-100': isUser,
      }),
    [isUser],
  );

  // System messages (like connection errors) get a special centered layout
  if (isSystem) {
    return (
      <div className="my-2 flex w-full justify-center">
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-medium text-slate-600 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35),inset_0_0_0_1px_rgba(148,163,184,0.2)]">
          <AlertCircle size={14} />
          {message.content}
        </div>
      </div>
    );
  }

  const timestampLabel = formatMessageTime(message);

  return (
    <article className="w-full">
      <div className={cn('flex w-full gap-4', isUser ? 'justify-end' : 'items-start')}>
        {!isUser && (
          <div className="w-8 shrink-0 pt-0.5">
            {showAvatar ? (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100/80 text-slate-700 dark:bg-slate-800/70 dark:text-slate-200" aria-hidden="true">
                <Sparkles size={14} />
              </span>
            ) : (
              <span className="inline-flex h-8 w-8" aria-hidden="true" />
            )}
          </div>
        )}

        <div className={cn('min-w-0', isUser ? 'w-full max-w-[46rem]' : 'flex-1')}>
          {showAvatar && (
            <div className={cn('mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider', isUser ? 'justify-end text-slate-600' : 'justify-start text-slate-400')}>
              <span>{isUser ? 'You' : 'Arcli'}</span>
              {isUser && <UserRound size={13} className="text-slate-400" aria-hidden="true" />}
            </div>
          )}

          <div className={cn('flex min-w-0 flex-col', isGroupedWithPrevious ? 'gap-2' : 'gap-2.5')}>
            <div className={cn('min-w-0', isUser ? 'ml-auto max-w-[42rem] rounded-2xl bg-gradient-to-b from-slate-100/75 to-slate-50/65 px-5 py-3.5 text-slate-900 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.35),inset_0_0_0_1px_rgba(148,163,184,0.2)] dark:from-slate-800/55 dark:to-slate-800/35' : 'w-full')}>
              {message.content ? (
                <div className={markdownClassName}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const rawCode = String(children).replace(/\n$/, '');
                        const isInline = !className;
                        if (isInline) {
                          return (
                            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.85em] text-slate-700 dark:bg-slate-800 dark:text-slate-200" {...props}>
                              {children}
                            </code>
                          );
                        }

                        return <CodeBlock code={rawCode} language={getCodeLanguage(className)} />;
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-[15px] italic leading-[1.75] text-slate-400">Thinking...</p>
              )}
            </div>

            <div className={cn('mt-0.5 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-slate-400', isUser ? 'justify-end' : 'justify-start')}>
              <span>{timestampLabel}</span>
              {!isUser && message.status && (
                <>
                  <span>•</span>
                  <span className="rounded-full bg-slate-100/80 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                    {message.status}
                  </span>
                </>
              )}
            </div>

            {!isUser && !isError && (
              <div className="mt-2 flex w-full flex-col gap-2">
              {message.plan && (
                <div className="overflow-hidden rounded-2xl bg-white/62 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38),inset_0_0_0_1px_rgba(148,163,184,0.2)] dark:bg-slate-900/40">
                  <button
                    onClick={() => setShowPlan(!showPlan)}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100/50 dark:text-slate-300 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex items-center gap-2">
                      <BrainCircuit size={16} />
                      Execution Strategy ({message.plan.execution_intent || 'ANALYTICAL'})
                    </span>
                    {showPlan ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </button>
                  {showPlan && (
                    <div className="space-y-3 px-4 py-4 text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(148,163,184,0.22)] dark:text-slate-300">
                      <p><strong>Intent:</strong> {toDisplayText(message.plan.intent_summary)}</p>
                      <p><strong>Strategy:</strong> {toDisplayText(message.plan.analytical_strategy)}</p>
                      {requestedMetrics.length > 0 && (
                        <p><strong>Metrics Injected:</strong> {requestedMetrics.join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {message.insights && (
                <div className="rounded-2xl bg-white/62 p-4 text-sm text-slate-700 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38),inset_0_0_0_1px_rgba(148,163,184,0.2)] dark:bg-slate-900/40 dark:text-slate-200">
                  <h4 className="mb-2 flex items-center gap-2 font-semibold tracking-tight text-slate-600 dark:text-slate-300">
                    <Lightbulb size={16} /> Data Engine Insights
                  </h4>
                  <p>{message.insights.summary || 'Statistical analysis completed.'}</p>
                </div>
              )}

              {message.diagnostics && (
                <div className="overflow-hidden rounded-2xl bg-white/62 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38),inset_0_0_0_1px_rgba(148,163,184,0.2)] dark:bg-slate-900/40">
                  <button
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100/50 dark:text-slate-300 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex items-center gap-2">
                      <Search size={16} />
                      Diagnostic details
                    </span>
                    {showDiagnostics ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {showDiagnostics && (
                    <div className="space-y-2 p-4 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(148,163,184,0.22)] dark:text-slate-200">
                      <p><strong>Analysis:</strong> {toDisplayText(message.diagnostics.root_cause_analysis)}</p>
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

              {showSql && message.sql && (
                <CodeBlock code={message.sql} language="sql" />
              )}

              {message.data && message.data.length > 0 && (
                <div className="w-full">
                  {message.chartSpec ? (
                    <div className="overflow-hidden rounded-2xl shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38),inset_0_0_0_1px_rgba(148,163,184,0.2)]">
                      <VegaChart spec={message.chartSpec} data={message.data} />
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl bg-white/62 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38),inset_0_0_0_1px_rgba(148,163,184,0.2)] dark:bg-slate-900/35">
                      <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500 shadow-[inset_0_-1px_0_rgba(148,163,184,0.24)]">
                          <tr>
                            {Object.keys(message.data[0]).map((key) => (
                              <th key={key} className="whitespace-nowrap px-4 py-2 font-semibold">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {message.data.slice(0, 5).map((row, idx) => (
                            <tr key={idx} className="transition-colors hover:bg-slate-50/60 shadow-[inset_0_-1px_0_rgba(148,163,184,0.18)]">
                              {Object.values(row).map((val: any, i) => (
                                <td key={i} className="whitespace-nowrap px-4 py-2">
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
                        <div className="w-full bg-slate-50/60 p-3 text-center text-xs font-medium text-slate-500 shadow-[inset_0_1px_0_rgba(148,163,184,0.2)]">
                          Showing top 5 of {message.data.length} rows.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {message.executionTimeMs && (
                <div className="mt-0.5 flex flex-wrap items-center gap-4 pl-1 text-xs font-medium text-slate-400">
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
                      className="flex cursor-pointer items-center gap-1.5 text-slate-500 transition-colors hover:text-blue-600"
                    >
                      <Terminal size={14} /> {showSql ? 'Hide SQL' : 'View SQL'}
                    </button>
                  )}
                </div>
              )}

              {/* Phase 3.2: Spatial Bridge — DashboardCard Handoff */}
              {message.metadata?.dashboard_workspace_id && (
                <DashboardCard
                  workspaceId={String(message.metadata.dashboard_workspace_id)}
                  summary={message.metadata?.workspace_summary as string | undefined}
                  vizType={message.chartSpec ? 'chart' : 'table'}
                  rowCount={message.data?.length}
                  sqlPreview={message.sql}
                />
              )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};