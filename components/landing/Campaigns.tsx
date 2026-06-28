import React from 'react';
import { 
  Megaphone, 
  ShieldCheck, 
  Mail, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Lock,
  LineChart
} from 'lucide-react';

export default function Campaigns() {
  return (
    <section 
      id="campaigns" 
      className="py-24 relative overflow-hidden"
      style={{ 
        fontFamily: "var(--font-geist-sans), sans-serif",
        background: "linear-gradient(180deg, #FAFCFF 0%, #FFFFFF 100%)"
      }}
    >
      {/* Background Decorative Grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]" 
        style={{ backgroundImage: 'linear-gradient(#1B6EBF 1px, transparent 1px), linear-gradient(90deg, #1B6EBF 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-100 text-[#1B6EBF] text-xs font-bold tracking-[0.08em] uppercase mb-6">
            <Megaphone className="w-3.5 h-3.5" />
            Smart Recovery Campaigns
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4 tracking-tight">
            Rescue Customers. Protect Your Brand.
          </h2>
          <p className="text-slate-600 text-lg leading-relaxed">
            Arcli isn't a generic email blast tool. It’s a precise, automated safety net that recovers lost revenue while strictly protecting your customers from spam.
          </p>
        </div>

        {/* Main Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left: Non-Technical Feature Explanations */}
          <div className="space-y-10">
            
            {/* Feature 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-1">
                <div className="w-12 h-12 rounded-xl bg-white border flex items-center justify-center shadow-sm" style={{ borderColor: "rgba(27,110,191,0.16)" }}>
                  <Clock className="w-6 h-6 text-[#1B6EBF]" />
                </div>
              </div>
              <div>
                <h3 className="text-lg text-gray-900 font-semibold mb-2">Smart Contact Limits</h3>
                <p className="text-base text-slate-600 leading-relaxed">
                  Automatically pause outreach to avoid annoying your users. Arcli strictly follows 7, 14, or 30-day contact rules and instantly respects global unsubscribes before sending anything.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-1">
                <div className="w-12 h-12 rounded-xl bg-white border flex items-center justify-center shadow-sm" style={{ borderColor: "rgba(27,110,191,0.16)" }}>
                  <Lock className="w-6 h-6 text-[#1B6EBF]" />
                </div>
              </div>
              <div>
                <h3 className="text-lg text-gray-900 font-semibold mb-2">Failsafe Email Protection</h3>
                <p className="text-base text-slate-600 leading-relaxed">
                  Even if the internet glitches or systems crash, your reputation is safe. Built-in safeguards guarantee that a customer will never accidentally receive the same recovery email twice.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-1">
                <div className="w-12 h-12 rounded-xl bg-white border flex items-center justify-center shadow-sm" style={{ borderColor: "rgba(27,110,191,0.16)" }}>
                  <LineChart className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg text-gray-900 font-semibold mb-2">Crystal-Clear ROI Proof</h3>
                <p className="text-base text-slate-600 leading-relaxed">
                  No guessing games. Arcli draws a direct, unbroken line between the exact email we sent and the specific dollar amount recovered to your bottom line.
                </p>
              </div>
            </div>

          </div>

          {/* Right: The "Detect -> Recover -> Measure" Pipeline UI */}
          <div className="relative pl-4">
            {/* Visual connecting line */}
            <div className="absolute left-[43px] top-8 bottom-8 w-0.5 bg-slate-200 z-0" />

            <div className="space-y-6 relative z-10">
              
              {/* Step 1: Detect */}
              <div className="flex items-center gap-5 bg-white p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md" style={{ borderColor: "rgba(27,110,191,0.16)" }}>
                <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100 flex-shrink-0 z-10">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Step 1: Detect</div>
                  <div className="text-base font-semibold text-gray-900">Payment Failed</div>
                  <div className="text-sm text-slate-500 mt-0.5">Customer's card was declined.</div>
                </div>
              </div>

              {/* Step 2: Safety Check */}
              <div className="flex items-center gap-5 bg-white p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md" style={{ borderColor: "rgba(27,110,191,0.16)" }}>
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 flex-shrink-0 z-10">
                  <ShieldCheck className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Step 2: Verify</div>
                  <div className="text-base font-semibold text-gray-900">Safety Check Passed</div>
                  <div className="text-sm text-slate-500 mt-0.5">Customer hasn't been emailed in 14 days.</div>
                </div>
              </div>

              {/* Step 3: Recover */}
              <div className="flex items-center gap-5 bg-white p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md" style={{ borderColor: "rgba(27,110,191,0.16)" }}>
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100 flex-shrink-0 z-10">
                  <Mail className="w-5 h-5 text-[#1B6EBF]" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Step 3: Recover</div>
                  <div className="text-base font-semibold text-gray-900">Rescue Email Sent</div>
                  <div className="text-sm text-slate-500 mt-0.5">Friendly reminder securely delivered.</div>
                </div>
              </div>

              {/* Step 4: Measure */}
              <div className="flex items-center gap-5 bg-emerald-50/50 p-5 rounded-2xl border border-emerald-200 shadow-sm transition-all hover:shadow-md relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-300 flex-shrink-0 z-10">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Step 4: Measure</div>
                  <div className="text-base font-semibold text-emerald-950">Revenue Recovered</div>
                  <div className="text-sm font-medium text-emerald-700 mt-0.5">
                    Customer updated card. <span className="font-bold">+$49/mo saved.</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}