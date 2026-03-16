// components/dashboard/OnboardingFlow.tsx
"use client";

import { useState } from "react";
import { 
  Store, 
  CreditCard, 
  TrendingUp, 
  Users, 
  ArrowRight, 
  CheckCircle2, 
  Loader2 
} from "lucide-react";

// Extracted outside render for memory efficiency
const USE_CASES = [
  {
    id: "saas",
    title: "B2B SaaS Metrics",
    description: "Track MRR, Churn, and Customer LTV.",
    icon: <CreditCard className="w-6 h-6 text-indigo-600" />,
    integrations: ["Stripe", "HubSpot"],
    color: "indigo"
  },
  {
    id: "ecommerce",
    title: "E-Commerce Growth",
    description: "Analyze ROAS, Cart Abandonment, and Sales.",
    icon: <Store className="w-6 h-6 text-emerald-600" />,
    integrations: ["Shopify", "Meta Ads"],
    color: "emerald"
  },
  {
    id: "marketing",
    title: "Marketing ROI",
    description: "Measure campaign performance and CAC.",
    icon: <TrendingUp className="w-6 h-6 text-rose-600" />,
    integrations: ["Google Ads", "Salesforce"],
    color: "rose"
  },
  {
    id: "product",
    title: "Product Analytics",
    description: "Understand user retention and feature usage.",
    icon: <Users className="w-6 h-6 text-blue-600" />,
    integrations: ["Mixpanel", "Segment"],
    color: "blue"
  }
];

export function OnboardingFlow() {
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Simulating an OAuth connection flow
  const handleConnect = async () => {
    setIsConnecting(true);
    // In production, this redirects to your backend endpoint that initiates Supabase OAuth
    // window.location.href = `/api/auth/connect?provider=${selectedProvider}`;
    
    setTimeout(() => {
      setIsConnecting(false);
      // Simulate successful connection and redirect to the generated dashboard
      window.location.href = "/dashboard/generated"; 
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        
        {/* Header */}
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome to DataOmen. What are we building today?
          </h2>
          <p className="mt-2 text-base text-slate-600 max-w-2xl mx-auto">
            Select your primary goal below. We'll automatically configure your AI agents and build your first dashboard in seconds.
          </p>
        </div>

        {/* Use Case Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10">
          {USE_CASES.map((useCase) => {
            const isSelected = selectedUseCase === useCase.id;
            return (
              <button
                key={useCase.id}
                onClick={() => setSelectedUseCase(useCase.id)}
                className={`relative flex flex-col items-start p-6 rounded-2xl border-2 transition-all duration-200 text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${useCase.color}-500 ${
                  isSelected 
                    ? `border-${useCase.color}-600 bg-${useCase.color}-50 shadow-md transform scale-[1.02]` 
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex justify-between w-full mb-4">
                  <div className={`p-3 rounded-xl ${isSelected ? `bg-${useCase.color}-100` : "bg-slate-100"}`}>
                    {useCase.icon}
                  </div>
                  {isSelected && (
                    <CheckCircle2 className={`w-6 h-6 text-${useCase.color}-600`} />
                  )}
                </div>
                
                <h3 className="text-xl font-bold text-slate-900 mb-1">
                  {useCase.title}
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  {useCase.description}
                </p>

                {/* Integration preview */}
                <div className="mt-auto pt-4 border-t border-slate-200/60 w-full flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Connects seamlessly with:
                  <span className="text-slate-700 font-bold ml-1">
                    {useCase.integrations.join(", ")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Area */}
        <div className={`transition-all duration-500 transform ${selectedUseCase ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Ready to generate your {USE_CASES.find(u => u.id === selectedUseCase)?.title} dashboard?
            </h3>
            <p className="text-slate-600 mb-8 max-w-xl mx-auto">
              Securely connect your primary data source. DataOmen only requires read-access, and we never train our core models on your proprietary data.
            </p>
            
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-70 disabled:cursor-not-allowed transition-colors w-full sm:w-auto min-w-[280px]"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting securely...
                </>
              ) : (
                <>
                  Connect {USE_CASES.find(u => u.id === selectedUseCase)?.integrations[0]} securely
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            
            <div className="mt-4 text-xs text-slate-500 flex items-center justify-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              256-bit AES encryption standard
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}