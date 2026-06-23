// app/components/UpgradeButton.tsx
"use client";

import { useState } from "react";
import { upgradeToProPlan } from "@/app/actions/billing"; // Adjust path if needed

export default function UpgradeButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Execute the Next.js Server Action
      const { url } = await upgradeToProPlan();
      
      // Redirect the user to Dodo's hosted checkout page
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("Failed to generate checkout link.");
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleUpgrade}
        disabled={isLoading}
        className={`px-6 py-3 font-semibold text-white rounded-lg transition-all ${
          isLoading 
            ? "bg-indigo-400 cursor-not-allowed" 
            : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
        }`}
      >
        {isLoading ? "Preparing Checkout..." : "Upgrade to Pro"}
      </button>
      
      {/* Surface errors to the user if the server action fails */}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}