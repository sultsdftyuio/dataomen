"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormState } from "react-dom";
import { resetPassword } from "./actions";
import { Logo } from "@/components/ui/logo";

/* ─── Shared Landing Page Design Tokens ─── */
const C = {
  navy: "#0A1628",
  blue: "#1B6EBF",
  offWhite: "#F6FAFE",
  rule: "#DDE8F2",
  ruleDark: "#C8D9E8",
  muted: "#546F8A",
  green: "#10B981",
};

/**
 * ForgotPasswordPage Component
 * Optimized for clarity and brand consistency. 
 * Replaces generic "DataOmen" branding with "arcli".
 */
export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(resetPassword, {});
  const [isPending, setIsPending] = useState(false);
  const searchParams = useSearchParams();
  const showRecoveryLinkError = searchParams.get("error") === "recovery_link_invalid";

  const handleSubmit = async (formData: FormData) => {
    setIsPending(true);
    try {
      await formAction(formData);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center relative overflow-hidden py-12"
      style={{ backgroundColor: C.offWhite, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
        .dot-grid { background-image: radial-gradient(${C.ruleDark} 1px, transparent 1px); background-size: 24px 24px; }
        .pfd { font-family: 'Playfair Display', serif; }
      `}} />

      {/* Decorative Background Elements */}
      <div className="absolute inset-0 dot-grid opacity-60 z-0" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#F0F7FF] blur-[120px] z-0" />

      <div className="relative z-10 w-full max-w-md px-6">

        {/* Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="mb-6 transition-transform hover:scale-105">
            <Logo className="h-10 w-auto" />
          </Link>
          <h1 className="pfd text-3xl font-bold text-center mb-2" style={{ color: C.navy }}>
            Reset Password
          </h1>
          <p className="text-center px-4" style={{ color: C.muted }}>
            Enter your email and we&apos;ll send you a secure link to get back into <span className="font-semibold" style={{ color: C.navy }}>arcli</span>.
          </p>
        </div>

        {/* Auth Card */}
        <div
          className="bg-white p-8 rounded-2xl shadow-xl"
          style={{ border: `1.5px solid ${C.ruleDark}`, boxShadow: "0 20px 40px rgba(10,22,40,0.06)" }}
        >
          <form action={handleSubmit} className="space-y-6">
            {showRecoveryLinkError && (
              <div className="p-3 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg border border-amber-100">
                Your recovery link is invalid or expired. Request a new one below.
              </div>
            )}

            {/* Action State Feedback */}
            {state?.error && (
              <div className="p-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg border border-red-100">
                {state.error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" style={{ color: C.navy, fontWeight: 600 }}>Work Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@company.com"
                required
                disabled={isPending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-bold transition-all"
              style={{ backgroundColor: C.navy, color: "#fff" }}
              disabled={isPending}
            >
              {isPending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sending Link...</>
              ) : (
                <>Send Recovery Link <ArrowRight className="ml-2 h-5 w-5" /></>
              )}
            </Button>

            {/* Security Assurance */}
            <div className="flex items-center justify-center gap-2 text-xs font-medium" style={{ color: C.muted }}>
              <MailCheck size={14} style={{ color: C.green }} />
              <span>Standard encryption enabled</span>
            </div>
          </form>
        </div>

        {/* Footer Link */}
        <p className="text-center mt-8 text-sm" style={{ color: C.muted }}>
          Remember your password?{' '}
          <Link href="/login" style={{ color: C.navy, fontWeight: 700 }} className="hover:underline">
            Back to login
          </Link>
        </p>

      </div>
    </div>
  );
}