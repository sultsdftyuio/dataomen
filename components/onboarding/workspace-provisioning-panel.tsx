"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { useAsyncProvisioning } from "@/hooks/useAsyncProvisioning";

export function WorkspaceProvisioningPanel() {
  const router = useRouter();
  const { status, message } = useAsyncProvisioning();

  // Automatically redirect when the backend signals READY
  useEffect(() => {
    if (status === "READY") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  const isReady = status === "READY";
  const isFailed = status === "FAILED";

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-slate-900 p-6">
      <div className="max-w-md w-full flex flex-col items-center text-center">
        
        {isFailed ? (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-rose-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Setup took too long</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              We couldn't confirm the workspace mapping in time. Your account data is safe.
            </p>
            <button
              onClick={handleRetry}
              className="mt-6 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors shadow-sm"
            >
              Retry connection
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {/* The Casual Dot Bounce */}
            <div className="flex items-center gap-2 mb-8">
              <div className="h-3 w-3 rounded-full bg-blue-500 animate-[bounce_1s_infinite_-0.3s]" />
              <div className="h-3 w-3 rounded-full bg-blue-500 animate-[bounce_1s_infinite_-0.15s]" />
              <div className="h-3 w-3 rounded-full bg-blue-500 animate-[bounce_1s_infinite]" />
            </div>

            {/* Status Text */}
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {isReady ? "Workspace secured." : "Warming up the engines..."}
            </h1>
            
            {/* Live Message from Backend */}
            <p className="mt-3 text-sm font-medium text-slate-500 animate-pulse">
              {message || "Preparing your environment"}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}