"use client";

/**
 * Arclis Landing Page
 *
 * Component structure (optimized for conversion):
 *   Navbar
 *   Hero              ← sharpened headline + Book Demo CTA
 *   SocialProof       ← stats + testimonials  [NEW]
 *   InteractiveDemo   ← live query playground  [NEW]
 *   UseCases          ← built for modern teams [NEW]
 *   DeepDiveFeatures  ← engine + monitoring
 *   AIAgents          ← supervisor pipeline
 *   IntegrationsAndSecurity
 *   FAQ
 *   CTA
 *   Footer
 */

import "../styles/globals.css";

import { Navbar }                  from "@/components/landing/navbar";
import { Hero }                    from "@/components/landing/hero";
import { SocialProof }             from "@/components/landing/Socialproof";
import { InteractiveDemo }         from "@/components/landing/Interactivedemo";
import { UseCases }                from "@/components/landing/Usecases";
import { DeepDiveFeatures }        from "@/components/landing/Deepdivefeatures";
import { AIAgents }                from "@/components/landing/Aiagents";
import { IntegrationsAndSecurity } from "@/components/landing/Integrationsandsecurity";
import { FAQ }                     from "@/components/landing/faq";
import { CTA }                     from "@/components/landing/cta";
import { Footer }                  from "@/components/landing/footer";

export default function Page() {
  return (
    <main>
      <Navbar />
      <Hero />
      <SocialProof />
      <InteractiveDemo />
      <UseCases />
      <DeepDiveFeatures />
      <AIAgents />
      <IntegrationsAndSecurity />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}