// components/billing/CheckoutButton.tsx

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";
import { Loader2, Zap, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckoutButtonProps {
  variantId: string; // The Lemon Squeezy Variant ID or Stripe Price ID
  className?: string;
  buttonText?: string;
  showTrustBadge?: boolean; // Phase 4: Transparency for solo founders
}

/**
 * High-performance, Indie-Hacker Optimized Checkout Button.
 * Orchestrates the secure handoff between Supabase Auth, your Python Backend, 
 * and the Lemon Squeezy Hosted Checkout.
 */
export const CheckoutButton: React.FC<CheckoutButtonProps> = ({
  variantId,
  className,
  buttonText = "Upgrade to DataFast Pro",
  showTrustBadge = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  const handleCheckout = async () => {
    setIsLoading(true);

    try {
      // 1. Validate Supabase Session
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session) {
        toast({
          title: "Authentication Required",
          description: "Please sign in or create an account to upgrade.",
          variant: "destructive",
        });
        return;
      }

      // 2. Request a secure, tenant-bound checkout URL from the Render backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          variant_id: variantId,
          // Return the user directly to their active dashboards upon success
          redirect_url: window.location.origin + "/dashboard?upgrade=success",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to initialize secure checkout session.");
      }

      const { checkout_url } = await response.json();

      // 3. Hand off the user to the Payment Processor
      if (checkout_url) {
        window.location.href = checkout_url;
      } else {
        throw new Error("No checkout URL returned from the billing server.");
      }

    } catch (error: any) {
      console.error("Checkout Error:", error);
      toast({
        title: "Checkout Initialization Failed",
        description: error.message || "An unexpected error occurred. Please try again or contact support@arcli.tech.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <Button
        onClick={handleCheckout}
        disabled={isLoading}
        size="lg"
        className="w-full sm:w-auto font-bold tracking-wide bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Provisioning Secure Checkout...
          </>
        ) : (
          <>
            <Zap className="mr-2 h-4 w-4 fill-current text-amber-300" />
            {buttonText}
          </>
        )}
      </Button>

      {/* Phase 4: The Transparency Badge (Crucial for Indie Hacker Conversions) */}
      {showTrustBadge && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>Flat rate. Cancel anytime. No hidden usage fees.</span>
        </div>
      )}
    </div>
  );
};