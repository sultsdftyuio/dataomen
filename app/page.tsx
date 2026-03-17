import React from "react";
import { Metadata } from "next";
import "../styles/globals.css";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { SocialProof } from "@/components/landing/Socialproof";
import { InteractiveDemo } from "@/components/landing/Interactivedemo";
import { UseCases } from "@/components/landing/Usecases";
import { DeepDiveFeatures } from "@/components/landing/Deepdivefeatures";
import { AIAgents } from "@/components/landing/Aiagents";
import { IntegrationsAndSecurity } from "@/components/landing/Integrationsandsecurity";
import { FAQ } from "@/components/landing/faq";
import { CTA } from "@/components/landing/cta";
import { SeoLinkSilo } from "@/components/landing/seo-link-silo";
import Footer from "@/components/landing/footer";

/**
 * Enterprise SEO & Metadata definitions.
 * Because this is now a Server Component, Next.js will inject these into the <head> 
 * during build time, maximizing web crawler discovery.
 */
export const metadata: Metadata = {
  title: "DataOmen | Your Autonomous Data Department",
  description: "Replace passive BI with an active, agentic AI system that plans, queries, diagnoses, and narrates your enterprise data.",
  openGraph: {
    title: "DataOmen | Your Autonomous Data Department",
    description: "The AI platform that autonomously acts as your entire data engineering and analytics team.",
    type: "website",
  }
};

/**
 * DataOmen Landing Page (Optimized Server Component)
 *
 * Architecture Note: 'use client' has been intentionally REMOVED. 
 * This file is now statically generated on the server. Client-side JS is only 
 * loaded for the specific interactive modules inside the component tree,
 * resulting in near-instant load times and perfect SEO scores.
 */
export default function Page() {
  return (
    <main className="bg-neutral-950 text-slate-50 antialiased selection:bg-blue-500/30 min-h-screen flex flex-col">
      <Navbar />
      
      {/* Compositional Layering: 
          We utilize a relative container with hardware-accelerated background gradients 
          and a subtle CSS grid that reinforces the "DataOmen" analytical brand concept 
          without impacting Cumulative Layout Shift (CLS) or framerate.
      */}
      <div className="relative flex-grow overflow-hidden">
        
        {/* Architectural Background Cues */}
        <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
          {/* Ambient AI Glows */}
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-900/15 blur-[120px] mix-blend-screen" />
          <div className="absolute bottom-[10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-violet-900/15 blur-[120px] mix-blend-screen" />
          
          {/* Analytical Grid Overlay 
              A highly performant CSS-only grid mask that fades out towards the bottom
          */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>

        {/* Semantic Content Stack */}
        <section className="relative z-10 flex flex-col gap-y-24 pb-20 pt-16 md:pt-24">
          <Hero />
          <SocialProof />
          <InteractiveDemo />
          <UseCases />
          <DeepDiveFeatures />
          <AIAgents />
          <IntegrationsAndSecurity />
          <FAQ />
          <CTA />
        </section>
      </div>

      {/* Pre-footer SEO Silo & Footer with backdrop isolation */}
      <div className="relative z-10 border-t border-white/5 bg-neutral-950/80 backdrop-blur-md">
        <SeoLinkSilo />
        <Footer />
      </div>
    </main>
  );
}