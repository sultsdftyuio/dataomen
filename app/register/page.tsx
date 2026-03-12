"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Database, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormState } from "react-dom";
import { registerAction } from "./actions";

/* ─── Shared Landing Page Design Tokens ─── */
const C = {
  navy:      "#0A1628",
  blue:      "#1B6EBF",
  offWhite:  "#F6FAFE",
  rule:      "#DDE8F2",
  ruleDark:  "#C8D9E8",
  muted:     "#546F8A",
  green:     "#10B981",
};

export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, {});
  const [isPending, setIsPending] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleSubmit = async (formData: FormData) => {
    setPasswordError("");
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

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
      {/* Fixed: Changed dangerouslySetContent to dangerouslySetInnerHTML */}
      <style dangerouslySetInnerHTML={{__html: `
        .dot-grid { background-image: radial-gradient(${C.ruleDark} 1px, transparent 1px); background-size: 24px 24px; }
        .pfd { font-family: 'Playfair Display', serif; }
      `}} />
      
      <div className="absolute inset-0 dot-grid opacity-60 z-0" />
      <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#F0F7FF] blur-[120px] z-0" />

      <div className="relative z-10 w-full max-w-md px-6">
        
        {/* Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-3 mb-6 transition-transform hover:scale-105">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Database size={20} color="#fff" />
            </div>
            <span className="pfd" style={{ fontSize: 28, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em" }}>
              Data<span style={{ color: C.blue }}>Omen</span>
            </span>
          </Link>
          <h1 className="pfd text-3xl font-bold text-center mb-2" style={{ color: C.navy }}>Start your free trial</h1>
          <p className="text-center" style={{ color: C.muted }}>Deploy your first AI agent in under 5 minutes.</p>
        </div>

        {/* Auth Card */}
        <div 
          className="bg-white p-8 rounded-2xl shadow-xl"
          style={{ border: `1.5px solid ${C.ruleDark}`, boxShadow: "0 20px 40px rgba(10,22,40,0.06)" }}
        >
          <form action={handleSubmit} className="space-y-5">
            {state?.error && (
              <div className="p-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg border border-red-100">
                {state.error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" style={{ color: C.navy, fontWeight: 600 }}>Full Name</Label>
              <Input 
                id="name" 
                name="name"
                placeholder="John Doe" 
                required 
                disabled={isPending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company" style={{ color: C.navy, fontWeight: 600 }}>Company Name</Label>
              <Input 
                id="company" 
                name="company"
                placeholder="Acme Corp" 
                required 
                disabled={isPending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" style={{ color: C.navy, fontWeight: 600 }}>Work Email</Label>
              <Input 
                id="email" 
                name="email"
                type="email" 
                placeholder="Enter your email" 
                required 
                disabled={isPending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" style={{ color: C.navy, fontWeight: 600 }}>Create Password</Label>
              <Input 
                id="password" 
                name="password"
                type="password" 
                placeholder="••••••••" 
                required 
                disabled={isPending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" style={{ color: C.navy, fontWeight: 600 }}>Confirm Password</Label>
              <Input 
                id="confirmPassword" 
                name="confirmPassword"
                type="password" 
                placeholder="••••••••" 
                required 
                disabled={isPending}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: passwordError ? "red" : C.rule }}
              />
              {(passwordError || state?.error) && (
                <p className="text-red-500 text-xs font-medium mt-1">{passwordError}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-bold transition-all mt-6"
              style={{ backgroundColor: C.blue, color: "#fff" }}
              disabled={isPending}
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