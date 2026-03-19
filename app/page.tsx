"use client";

import React from "react";
import "../styles/globals.css";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { DeepDiveFeatures } from "@/components/landing/Deepdivefeatures";
import { AIAgents } from "@/components/landing/Aiagents";
import { IntegrationsAndSecurity } from "@/components/landing/Integrationsandsecurity";
import { FAQ } from "@/components/landing/faq";
import { CTA } from "@/components/landing/cta";
import { SeoLinkSilo } from "@/components/landing/seo-link-silo";
import  Footer  from "@/components/landing/footer";

/**
 * Arcli Landing Page
 *
 * Component structure (optimized for high-velocity conversion and SEO discovery):
 * Navbar                   ← Multi-tenant isolated navigation
 * Hero                     ← High-impact value proposition + conversion anchor
 * DeepDiveFeatures         ← Technical architecture deep-dive
 * AIAgents                 ← Autonomous "Arc" supervisor pipeline logic
 * IntegrationsAndSecurity  ← Enterprise-grade trust & secure hybrid connectivity
 * FAQ                      ← Objection handling + semantic context expansion
 * CTA                      ← High-velocity conversion final push
 * SeoLinkSilo              ← Internal linking strategy (crawler discovery & siloing)
 * Footer                   ← Global directory and legal
 */
export default function Page() {
  return (
    <main className="bg-neutral-950 text-slate-50 antialiased selection:bg-blue-500/30">
      <Navbar />
      
      {/* Compositional Layering: 
          We utilize a relative container with decorative background gradients 
          that reinforce the "Arc & Axis" brand concept without impacting 
          Cumulative Layout Shift (CLS).
      */}
      <div className="relative overflow-hidden">
        {/* Architectural Background Cues */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-30 z-0">
          <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px]" />
          <div className="absolute bottom-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/10 blur-[100px]" />
        </div>

        {/* Semantic Content Stack */}
        <section className="relative z-10">
          <Hero />
          <DeepDiveFeatures />
          <AIAgents />
          <IntegrationsAndSecurity />
          <FAQ />
          <CTA />
          <SeoLinkSilo />
        </section>
      </div>

      <Footer />
    </main>
  );
}