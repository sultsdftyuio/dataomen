"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

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
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-disabled={isLoading}
        className={[
          "inline-flex items-center justify-center gap-2",
          "rounded-lg px-4 py-2",
          "text-sm font-semibold text-white",
          "shadow-sm transition-all",
          "focus-visible:outline focus-visible:outline-2",
          "focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
          isLoading
            ? "cursor-not-allowed bg-indigo-400 opacity-80 dark:bg-indigo-500/50"
            : "cursor-pointer bg-indigo-600 shadow-indigo-500/10 hover:bg-indigo-700 active:scale-[0.98]",
          className,
        ].join(" ")}
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
          </>
        )}
      </button>

      {error && (
        <p
          role="alert"
          className="animate-in slide-in-from-top-1 fade-in text-xs font-medium text-destructive duration-200 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
