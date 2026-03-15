// components/billing/CheckoutButton.tsx

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";
import { Loader2, CreditCard } from "lucide-react";

interface CheckoutButtonProps {
  variantId: string; // The Lemon Squeezy Variant ID (e.g., from your Pro product)
  className?: string;
  buttonText?: string;
}

/**
 * High-performance Checkout Button.
 * Orchestrates the handoff between Supabase Auth, your Render Backend, 
 * and the Lemon Squeezy Hosted Checkout.
 */
export const CheckoutButton: React.FC<CheckoutButtonProps> = ({
  variantId,
  className,
  buttonText = "Upgrade to Pro",
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  const handleCheckout = async () => {
    setIsLoading(true);

    try {
      // 1. Get the authenticated session from Supabase
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to upgrade your account.",
          variant: "destructive",
        });
        return;
      }

      // 2. Request a secure checkout URL from the Render backend
      // Note: This assumes you've added a matching route to your Python API
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          variant_id: variantId,
          redirect_url: window.location.origin + "/dashboard/billing?success=true",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to initialize checkout.");
      }

      const { checkout_url } = await response.json();

      // 3. Hand off the user to Lemon Squeezy
      if (checkout_url) {
        window.location.href = checkout_url;
      } else {
        throw new Error("No checkout URL returned from server.");
      }

    } catch (error: any) {
      console.error("Checkout Error:", error);
      toast({
        title: "Checkout Failed",
        description: error.message || "An unexpected error occurred during checkout.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleCheckout}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <CreditCard className="mr-2 h-4 w-4" />
          {buttonText}
        </>
      )}
    </Button>
  );
};