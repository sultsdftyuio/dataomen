// components/MessageBubble.tsx
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/chat';
import { VegaChart } from './VegaChart';
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
  'prose prose-slate dark:prose-invert prose-sm sm:prose-base max-w-none leading-7 text-slate-900 dark:text-slate-50 prose-p:my-2 prose-p:leading-7 prose-headings:mb-2 prose-headings:mt-5 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-900 dark:prose-headings:text-slate-50 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-slate-900 dark:prose-strong:text-slate-50 prose-code:rounded-md prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:text-slate-700 dark:prose-code:bg-slate-800 dark:prose-code:text-slate-200 prose-code:before:content-none prose-code:after:content-none prose-table:my-4 prose-table:w-full prose-thead:border-b prose-thead:border-slate-200/60 prose-th:bg-slate-50/70 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:text-[11px] prose-th:font-semibold prose-th:uppercase prose-th:tracking-wider prose-th:text-slate-500 prose-td:border-b prose-td:border-slate-200/40 prose-td:px-4 prose-td:py-2 prose-td:text-slate-700 dark:prose-td:text-slate-200';

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
    <div className="group/code my-4 overflow-hidden rounded-xl bg-slate-950/95 ring-1 ring-slate-200/20 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-700/50 bg-slate-900/80 px-3 py-1.5">
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
        'prose-p:text-slate-900 dark:prose-p:text-slate-50': !isUser,
        'prose-p:text-slate-800 dark:prose-p:text-slate-100': isUser,
      }),
    [isUser],
  );

  // System messages (like connection errors) get a special centered layout
  if (isSystem) {
    return (
      <div className="my-2 flex w-full justify-center">
        <div className="flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/80 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm">
          <AlertCircle size={14} />
          {message.content}
        </div>
      </div>
    );
  }

  const timestampLabel = formatMessageTime(message);

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('w-full', isUser ? 'max-w-[92%] sm:max-w-[84%]' : 'max-w-full')}>
        {showAvatar && (
          <div className={cn('mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400', isUser ? 'justify-end' : 'justify-start')}>
            {!isUser && (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/60 bg-white shadow-sm" aria-hidden="true">
                <Sparkles size={14} className="text-slate-700" />
              </span>
            )}
            <span>{isUser ? 'You' : 'Arcli'}</span>
            {isUser && (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/60 bg-white shadow-sm" aria-hidden="true">
                <UserRound size={14} className="text-slate-600" />
              </span>
            )}
          </div>
        )}

        <div className={cn('flex min-w-0 flex-col gap-2', isGroupedWithPrevious ? 'pt-0' : 'pt-0', isUser ? 'items-end' : 'items-start')}>
          <div className={cn('w-full', isUser ? 'rounded-xl bg-slate-50/50 px-4 py-3 dark:bg-slate-800/30' : 'bg-transparent')}>
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
              <p className="text-[15px] italic leading-7 text-slate-400">Thinking...</p>
            )}
          </div>

          <div className={cn('mt-0.5 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-slate-400', isUser ? 'justify-end' : 'justify-start')}>
            <span>{timestampLabel}</span>
            {!isUser && message.status && (
              <>
                <span>•</span>
                <span className="rounded-full border border-slate-200/60 bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {message.status}
                </span>
              </>
            )}
          </div>

          {!isUser && !isError && (
            <div className="mt-2 flex w-full flex-col gap-2">
              {message.plan && (
                <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white/80 shadow-sm">
                  <button
                    onClick={() => setShowPlan(!showPlan)}
                    className="flex w-full items-center justify-between bg-slate-50/70 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100/70"
                  >
                    <span className="flex items-center gap-2 text-slate-700">
                      <BrainCircuit size={16} />
                      Execution Strategy ({message.plan.execution_intent || 'ANALYTICAL'})
                    </span>
                    {showPlan ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </button>
                  {showPlan && (
                    <div className="space-y-3 border-t border-slate-200/60 bg-white px-4 py-4 text-sm text-slate-600">
                      <p><strong>Intent:</strong> {message.plan.intent_summary}</p>
                      <p><strong>Strategy:</strong> {message.plan.analytical_strategy}</p>
                      {requestedMetrics.length > 0 && (
                        <p><strong>Metrics Injected:</strong> {requestedMetrics.join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {message.insights && (
                <div className="rounded-xl border border-slate-200/60 bg-white/80 p-4 text-sm text-slate-700 shadow-sm">
                  <h4 className="mb-2 flex items-center gap-2 font-semibold tracking-tight text-slate-700">
                    <Lightbulb size={16} /> Data Engine Insights
                  </h4>
                  <p>{message.insights.summary || 'Statistical analysis completed.'}</p>
                </div>
              )}

              {message.diagnostics && (
                <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white/80 shadow-sm">
                  <button
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100/70"
                  >
                    <span className="flex items-center gap-2">
                      <Search size={16} />
                      Diagnostic details
                    </span>
                    {showDiagnostics ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {showDiagnostics && (
                    <div className="space-y-2 border-t border-slate-200/60 bg-white p-4 text-sm text-slate-700">
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

              {showSql && message.sql && (
                <CodeBlock code={message.sql} language="sql" />
              )}

              {message.data && message.data.length > 0 && (
                <div className="w-full">
                  {message.chartSpec ? (
                    <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200/50 shadow-sm">
                      <VegaChart spec={message.chartSpec} data={message.data} />
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl bg-white/80 ring-1 ring-slate-200/50 shadow-sm">
                      <table className="w-full text-left text-sm text-slate-600">
                        <thead className="border-b border-slate-200/60 bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            {Object.keys(message.data[0]).map((key) => (
                              <th key={key} className="whitespace-nowrap px-4 py-2 font-semibold">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/40">
                          {message.data.slice(0, 5).map((row, idx) => (
                            <tr key={idx} className="transition-colors hover:bg-slate-50/60">
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
                        <div className="w-full border-t border-slate-200/40 bg-slate-50/60 p-3 text-center text-xs font-medium text-slate-500">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};