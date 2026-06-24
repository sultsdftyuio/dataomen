"use client";

import React, { useState } from "react";
import { 
  Terminal, 
  Copy, 
  CheckCircle2, 
  ShieldAlert, 
  Server, 
  Code2,
  Lock,
  RefreshCw,
  Send,
  Check,
  Activity
} from "lucide-react";

type LangTab = "curl" | "node" | "python";

export function IntegrationGuide() {
  const [activeTab, setActiveTab] = useState<LangTab>("curl");
  const [copied, setCopied] = useState(false);
  
  // Test Connection State
  const [testUserId, setTestUserId] = useState("usr_12345");
  const [testEvent, setTestEvent] = useState("payment_failed");
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  const handleTestEvent = () => {
    setIsTesting(true);
    setTestSuccess(false);
    // Mock network request
    setTimeout(() => {
      setIsTesting(false);
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 3000);
    }, 800);
  };

  const snippets = {
    curl: `curl -X POST https://api.arcli.tech/api/v1/track \\
  -H "Authorization: Bearer arcli_live_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_name": "payment_failed",
    "user_id": "usr_98765",
    "idempotency_key": "evt_550e8400-e29b-41d4-a716-446655440000",
    "properties": { 
      "plan_tier": "pro_monthly",
      "metadata": { "amount": 4900 }
    }
  }'`,
    node: `// Native fetch (Node.js 18+)
const response = await fetch('https://api.arcli.tech/api/v1/track', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer arcli_live_your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    event_name: 'payment_failed',
    user_id: 'usr_98765',
    idempotency_key: crypto.randomUUID(),
    properties: { 
      plan_tier: 'pro_monthly', 
      metadata: { amount: 4900 } 
    }
  })
});

const data = await response.json();`,
    python: `import requests
import uuid

url = "https://api.arcli.tech/api/v1/track"
headers = {
    "Authorization": "Bearer arcli_live_your_api_key_here",
    "Content-Type": "application/json"
}
payload = {
    "event_name": "payment_failed",
    "user_id": "usr_98765",
    "idempotency_key": str(uuid.uuid4()),
    "properties": { 
        "plan_tier": "pro_monthly", 
        "metadata": { "amount": 4900 } 
    }
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-300 pb-12">
      
      {/* ── 1. Header & Security Callout ── */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
              <Terminal className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#0A192F]">Developer Integration</h3>
              <p className="text-sm text-slate-500 mt-0.5">Push custom churn signals securely from your backend to Arcli.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-red-50/80 border border-red-200 rounded-lg">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-900 mb-1">Server-Side Execution Only</p>
              <p className="text-[13px] text-red-800/90 leading-relaxed">
                Your API keys carry full write privileges to your workspace. <strong>Never</strong> embed them in frontend client code (React, Vue, iOS). Always route requests through your own secure backend infrastructure.
              </p>
            </div>
          </div>
        </div>

        {/* ── 2. Endpoint Summary & Auth ── */}
        <div className="p-6 sm:p-8 bg-slate-50/50 border-b border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Endpoint</span>
              <div className="flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">POST</span>
                <code className="text-sm font-mono text-[#0A192F] font-semibold">/api/v1/track</code>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Authentication</span>
              <div className="text-sm font-mono text-slate-700">Bearer Token</div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Content-Type</span>
              <div className="text-sm font-mono text-slate-700">application/json</div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Rate Limit</span>
              <div className="text-sm font-mono text-slate-700">100 req / sec</div>
            </div>
          </div>
        </div>

        {/* ── 3. Code Example & Response ── */}
        <div>
          {/* Tabs */}
          <div className="flex bg-slate-50 border-b border-slate-200 px-4 pt-2">
            {[
              { id: "curl", label: "cURL", icon: Terminal },
              { id: "node", label: "Node.js", icon: Server },
              { id: "python", label: "Python", icon: Code2 }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as LangTab)}
                  className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all duration-200 ease-in-out border-t-2 border-x border-x-transparent -mb-px ${
                    isActive 
                      ? "bg-white text-[#0A192F] border-t-blue-500 border-x-slate-200 border-b-white rounded-t-lg z-10" 
                      : "text-slate-500 hover:text-slate-700 border-t-transparent hover:bg-slate-100/50 rounded-t-lg"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* Request Block */}
          <div className="relative bg-[#0A192F] p-6 overflow-hidden">
            <button 
              onClick={handleCopy}
              className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-md text-white text-xs font-medium transition-colors"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} 
              {copied ? "Copied" : "Copy"}
            </button>
            {/* Animated Tab Content */}
            <div className="relative">
              {Object.entries(snippets).map(([key, code]) => (
                <pre 
                  key={key} 
                  className={`font-mono text-[13px] leading-relaxed text-slate-300 overflow-x-auto transition-all duration-300 absolute inset-0 ${
                    activeTab === key ? "opacity-100 translate-y-0 relative" : "opacity-0 translate-y-2 pointer-events-none"
                  }`}
                >
                  <code>{code}</code>
                </pre>
              ))}
            </div>
          </div>

          {/* Response Block */}
          <div className="bg-slate-900 border-t border-slate-800 p-4 px-6 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            <div className="shrink-0 pt-1">
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                202 Accepted
              </span>
            </div>
            <pre className="font-mono text-[12px] leading-relaxed text-slate-400 overflow-x-auto">
              <code>{`{
  "status": "accepted",
  "idempotency_key": "evt_550e8400-e29b-41d4-a716-446655440000",
  "anomalies": null
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── 4. Schema & Catalog ── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Schema Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h4 className="text-sm font-bold text-[#0A192F]">Request Schema</h4>
          </div>
          <div className="p-0 overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-sm">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-mono text-blue-600 font-medium">event_name</td>
                  <td className="p-4"><span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">REQUIRED</span></td>
                  <td className="p-4 text-slate-500 text-xs">String identifier of the action.</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-mono text-slate-600">user_id</td>
                  <td className="p-4"><span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">RECOMMENDED</span></td>
                  <td className="p-4 text-slate-500 text-xs">Your system's unique user identifier. Crucial for active user distinct counts.</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-mono text-slate-600">idempotency_key</td>
                  <td className="p-4"><span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">OPTIONAL</span></td>
                  <td className="p-4 text-slate-500 text-xs">UUID for retry-safety. Auto-generated if omitted.</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-mono text-slate-600">properties</td>
                  <td className="p-4"><span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">OPTIONAL</span></td>
                  <td className="p-4 text-slate-500 text-xs">Event properties (e.g., plan_tier, reason, rating) and nested metadata object.</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-slate-600">timestamp</td>
                  <td className="p-4"><span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">OPTIONAL</span></td>
                  <td className="p-4 text-slate-500 text-xs">ISO-8601 timestamp (defaults to now).</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Event Catalog */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h4 className="text-sm font-bold text-[#0A192F]">Standard Event Catalog</h4>
          </div>
          <div className="p-6 space-y-4 flex-1 overflow-y-auto">
            <p className="text-xs text-slate-500 leading-relaxed mb-2">
              To leverage Arcli's deterministic churn scoring, map your events to these standard identifiers:
            </p>
            <div className="space-y-3">
              {[
                { name: "payment_failed", desc: "Invoice or subscription charge failed." },
                { name: "subscription_cancelled", desc: "User explicitly requested cancellation." },
                { name: "trial_expired", desc: "User failed to convert at trial end." },
                { name: "downgrade_requested", desc: "User moved to a lower-tier plan." },
                { name: "feedback_submitted", desc: "Requires 'reason', 'feedback_text', or 'rating' inside properties." },
              ].map((ev) => (
                <div key={ev.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <code className="text-xs font-mono font-semibold text-[#0A192F]">{ev.name}</code>
                  <span className="text-[11px] text-slate-500">{ev.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>

      {/* ── 5. Operational Guidelines ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm flex items-start gap-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#0A192F] mb-1">Idempotency & Retries</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Events are deduplicated automatically via the <code>idempotency_key</code>. If you encounter a <strong className="font-mono bg-slate-100 px-1 rounded text-slate-700">500</strong> or <strong className="font-mono bg-slate-100 px-1 rounded text-slate-700">503</strong> response, or a network timeout, it is perfectly safe to retry the request using exponential backoff.
            </p>
          </div>
        </div>
        
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm flex items-start gap-4">
          <div className="p-2 bg-slate-100 text-slate-600 rounded-lg shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#0A192F] mb-1">Security Bearer Scheme</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ensure your integration explicitly sets the header as <code>Authorization: Bearer arcli_live_***</code>. Requests missing the <code>Bearer</code> prefix or proper token signature will be rejected with a 401 Unauthorized status.
            </p>
          </div>
        </div>
      </section>

      {/* ── 6. Test Integration Playground ── */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#0A192F]" />
          <h4 className="text-sm font-bold text-[#0A192F]">Test Integration</h4>
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-sm text-slate-500 mb-6">
            Send a sample event payload to your Arcli workspace to verify your configuration and observe the payload structure in real-time.
          </p>
          
          <div className="flex flex-col md:flex-row items-end gap-4">
            <div className="w-full md:w-1/3 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Customer ID</label>
              <input 
                type="text" 
                value={testUserId}
                onChange={(e) => setTestUserId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
            
            <div className="w-full md:w-1/3 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Event Name</label>
              <select 
                value={testEvent}
                onChange={(e) => setTestEvent(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
              >
                <option value="payment_failed">payment_failed</option>
                <option value="subscription_cancelled">subscription_cancelled</option>
                <option value="trial_expired">trial_expired</option>
                <option value="feedback_submitted">feedback_submitted</option>
                <option value="custom_event">custom_event</option>
              </select>
            </div>

            <div className="w-full md:w-1/3 flex items-center gap-3">
              <button 
                onClick={handleTestEvent}
                disabled={isTesting}
                className="flex-1 bg-[#0A192F] hover:bg-slate-800 text-white shadow-sm h-[38px] rounded-md px-5 text-sm font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-80"
              >
                {isTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isTesting ? "Sending..." : "Send Test Event"}
              </button>

              {/* Success Feedback Indicator */}
              <div className={`flex items-center gap-2 transition-all duration-300 ${testSuccess ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"}`}>
                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Check className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-emerald-600 hidden lg:block whitespace-nowrap">
                  Delivered
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}