"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

import { upgradeToProPlan } from "@/app/actions/billing";

interface UpgradeButtonProps {
  /**
   * Optional product ID.
   * Kept for compatibility with WorkspaceHeader and future
   * multi-plan checkout flows.
   */
  productId?: string;

  /**
   * Optional className override.
   */
  className?: string;
}

export default function UpgradeButton({
  productId, // Reserved for future checkout variants
  className = "",
}: UpgradeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    // Prevent accidental double-clicks or duplicate requests.
    if (isLoading) return;

    try {
      setIsLoading(true);
      setError(null);

      // Reserved for future use when the server action accepts a product ID.
      void productId;

      const result = await upgradeToProPlan();

      if (result.status === "already_active") {
        window.location.reload();
        return;
      }

      if (!result.url) {
        throw new Error("Failed to generate checkout link.");
      }

      // Redirect to the hosted Dodo checkout.
      window.location.assign(result.url);
    } catch (err: unknown) {
      console.error("[Checkout UI Error]", err);

      const message =
        err instanceof Error
          ? err.message
          : "Unable to start checkout session. Please try again.";

      if (message.toLowerCase().includes("already has an active subscription")) {
        window.location.reload();
        return;
      }

      setError(message);
    } finally {
      // If navigation succeeds, the page unloads before this matters.
      // If it fails, this re-enables the button for retry.
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-disabled={isLoading}
        className={[
          "group inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5",
          "text-sm font-semibold text-white transition-all duration-200",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B6EBF]",
          isLoading
            ? "cursor-wait opacity-80"
            : "cursor-pointer hover:-translate-y-px active:translate-y-0",
          className,
        ].join(" ")}
        style={{
          background: isLoading
            ? "linear-gradient(135deg, #5797D6 0%, #2B73BB 100%)"
            : "linear-gradient(135deg, #1B6EBF 0%, #0F4F91 100%)",
          borderColor: "rgba(255,255,255,0.2)",
          boxShadow: isLoading
            ? "0 3px 10px rgba(27,110,191,0.16)"
            : "0 6px 16px rgba(27,110,191,0.24)",
        }}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Preparing Checkout...</span>
          </>
        ) : (
          <>
            <Sparkles
              className="h-4 w-4 text-amber-300"
              aria-hidden="true"
            />
            <span>Upgrade to Pro</span>
            <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
              $35/mo
            </span>
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </>
        )}
      </button>

      {error && (
        <p
          role="alert"
          className="animate-in slide-in-from-top-1 rounded-md border px-2.5 py-2 text-xs font-medium duration-200"
          style={{ color: "#B42318", backgroundColor: "#FFF6F5", borderColor: "#FECDCA" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
