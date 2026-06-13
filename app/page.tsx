import React from "react";
import { redirect } from "next/navigation";
import "../styles/globals.css";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DeepDiveFeatures } from "@/components/landing/Deepdivefeatures";
import { IntegrationsAndSecurity } from "@/components/landing/Integrationsandsecurity";
import { Testimonials } from "@/components/landing/testimonials";
import { FAQ } from "@/components/landing/faq";
import { CTA } from "@/components/landing/cta";
import { SeoLinkSilo } from "@/components/landing/seo-link-silo";
import Footer from "@/components/landing/footer";
import { createClient } from "@/utils/supabase/server";

export default async function Page() {
  // Server-side redirect prevents auth flashes on the marketing page.
  // Using getUser() validates the JWT against Supabase Auth for strict security.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="bg-neutral-950 text-slate-50 antialiased selection:bg-blue-500/30">
      <Navbar />
      
      <div className="relative isolate overflow-hidden">
        {/* Decorative background gradients */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none opacity-30 z-0">
          <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px]" />
          <div className="absolute bottom-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/10 blur-[100px]" />
        </div>

        {/* Page Content */}
        <div className="relative z-10">
          <Hero />
          <HowItWorks />
          <DeepDiveFeatures />
          <IntegrationsAndSecurity />
          <Testimonials />
          <FAQ />
          <CTA />
        </div>
      </div>
      
      <SeoLinkSilo />
      <Footer />
    </main>
  );
}