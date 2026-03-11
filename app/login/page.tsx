"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Database, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ─── Shared Landing Page Design Tokens ─── */
const C = {
  navy:      "#0A1628",
  blue:      "#1B6EBF",
  blueMid:   "#2580D4",
  offWhite:  "#F6FAFE",
  rule:      "#DDE8F2",
  ruleDark:  "#C8D9E8",
  muted:     "#546F8A",
};

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // UI Simulation. Wire to your Supabase actions later.
    setTimeout(() => {
      setIsLoading(false);
      window.location.href = "/dashboard";
    }, 1500);
  };

  return (
    <div 
      className="min-h-screen flex flex-col justify-center items-center relative overflow-hidden"
      style={{ backgroundColor: C.offWhite, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* CSS Backgrounds from Landing Page */}
      <style dangerouslySetContent={{__html: `
        .dot-grid { background-image: radial-gradient(${C.ruleDark} 1px, transparent 1px); background-size: 24px 24px; }
        .pfd { font-family: 'Playfair Display', serif; }
      `}} />
      
      <div className="absolute inset-0 dot-grid opacity-60 z-0" />
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#EBF4FD] blur-[100px] z-0" />

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
          <h1 className="pfd text-3xl font-bold text-center mb-2" style={{ color: C.navy }}>Welcome back</h1>
          <p className="text-center" style={{ color: C.muted }}>Log in to access your autonomous workspace.</p>
        </div>

        {/* Auth Card */}
        <div 
          className="bg-white p-8 rounded-2xl shadow-xl"
          style={{ border: `1.5px solid ${C.ruleDark}`, boxShadow: "0 20px 40px rgba(10,22,40,0.06)" }}
        >
          <form onSubmit={handleLogin} className="space-y-5">
            
            <div className="space-y-2">
              <Label htmlFor="email" style={{ color: C.navy, fontWeight: 600 }}>Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="you@company.com" 
                required 
                disabled={isLoading}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" style={{ color: C.navy, fontWeight: 600 }}>Password</Label>
                <Link href="/forgot-password" style={{ color: C.blue, fontSize: "13px", fontWeight: 600 }} className="hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                required 
                disabled={isLoading}
                className="h-11 bg-slate-50/50"
                style={{ borderColor: C.rule }}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-bold transition-all mt-4"
              style={{ backgroundColor: C.navy, color: "#fff" }}
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Authenticating...</>
              ) : (
                <>Log In <ArrowRight className="ml-2 h-5 w-5" /></>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center mt-8 text-sm" style={{ color: C.muted }}>
          Don't have an account?{' '}
          <Link href="/register" style={{ color: C.blue, fontWeight: 700 }} className="hover:underline">
            Start your free trial
          </Link>
        </p>

      </div>
    </div>
  );
}