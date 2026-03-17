"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormState } from "react-dom";
import { registerAction } from "./actions";
import { createClient } from "@/utils/supabase/client";
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
 * RegisterPage Component
 * * Optimized for high conversion by reducing friction. 
 * Only captures essential credentials (Email/Password) and provides Google OAuth.
 */
export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, {});
  const [isPending, setIsPending] = useState(false);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const supabase = createClient();

  const handleEmailSubmit = async (formData: FormData) => {
    setIsPending(true);
    try {
      await formAction(formData);
    } finally {
      setIsPending(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGooglePending(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google Auth Error:", error);
      setIsGooglePending(false);
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

      <div className="absolute inset-0 dot-grid opacity-60 z-0" />
      <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#F0F7FF] blur-[120px] z-0" />

      <div className="relative z-10 w-full max-w-md px-6">

        {/* Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="mb-6 transition-transform hover:scale-105">
            <Logo className="h-10 w-auto" />
          </Link>
          <h1 className="pfd text-3xl font-bold text-center mb-2" style={{ color: C.navy }}>
            Get Started
          </h1>
          <p className="text-center" style={{ color: C.muted }}>
            Deploy your first AI agent on <span className="font-semibold" style={{ color: C.navy }}>arcli.tech</span>
          </p>
        </div>

        {/* Auth Card */}
        <div
          className="bg-white p-8 rounded-2xl shadow-xl"
          style={{ border: `1.5px solid ${C.ruleDark}`, boxShadow: "0 20px 40px rgba(10,22,40,0.06)" }}
        >
          {/* Google Auth Provider */}
          <Button
            variant="outline"
            className="w-full h-12 mb-6 font-semibold flex items-center justify-center gap-3 border-2"
            onClick={handleGoogleLogin}
            disabled={isPending || isGooglePending}
          >
            {isGooglePending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" style={{ borderColor: C.rule }} />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">Or with email</span>
            </div>
          </div>

          <form action={handleEmailSubmit} className="space-y-5">
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
                disabled={isPending || isGooglePending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" style={{ color: C.navy, fontWeight: 600 }}>Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                disabled={isPending || isGooglePending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-bold transition-all mt-6"
              style={{ backgroundColor: C.blue, color: "#fff" }}
              disabled={isPending || isGooglePending}
            >
              {isPending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Creating Account...</>
              ) : (
                <>Create Account <ArrowRight className="ml-2 h-5 w-5" /></>
              )}
            </Button>

            <div className="pt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-medium" style={{ color: C.muted }}>
              <span className="flex items-center gap-1"><CheckCircle2 size={14} color={C.green} /> 14-day free trial</span>
              <span className="flex items-center gap-1"><CheckCircle2 size={14} color={C.green} /> No credit card required</span>
            </div>
          </form>
        </div>

        <p className="text-center mt-8 text-sm" style={{ color: C.muted }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: C.navy, fontWeight: 700 }} className="hover:underline">
            Log in here
          </Link>
        </p>

      </div>
    </div>
  );
}