import React, { useState } from 'react';
import { Message } from '@/types/chat';
import { VegaChart } from './VegaChart';
import { Terminal, Database, Clock, AlertCircle } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isError = message.status === 'error' || message.status === 'execution_error';
  
  const [showSql, setShowSql] = useState(false);

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
        
        {/* 1. The Text Bubble */}
        <div className={`px-5 py-4 rounded-2xl max-w-2xl shadow-sm ${
          isUser 
            ? 'bg-blue-600 text-white rounded-br-none' 
            : isError 
              ? 'bg-red-50 border border-red-200 text-red-800 rounded-bl-none'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
        }`}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* 2. Execution Metadata & SQL Toggle (Agent Only) */}
        {!isUser && message.executionTimeMs && !isError && (
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 pl-2 font-medium">
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

        {/* 3. SQL Debug View */}
        {showSql && message.sql && (
          <div className="w-full mt-3 p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto shadow-inner border border-slate-800">
            <pre className="whitespace-pre-wrap leading-relaxed">{message.sql}</pre>
          </div>
        )}

        {/* 4. Data Visualization: Chart or Table */}
        {!isUser && message.data && message.data.length > 0 && !isError && (
          <div className="w-full mt-2">
            {message.chartSpec ? (
              <VegaChart spec={message.chartSpec} data={message.data} />
            ) : (
              <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm mt-4">
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
                    {/* Preview top 5 rows to prevent massive UI bloat on the DOM */}
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
      </div>
    </div>
  );
};