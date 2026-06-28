import React from "react";
import { redirect } from "next/navigation";
import "../styles/globals.css";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DeepDiveFeatures } from "@/components/landing/Deepdivefeatures";
import Campaigns from "@/components/landing/Campaigns"; // Integrating the new Campaigns component
import { Testimonials } from "@/components/landing/testimonials";
import Pricing from "@/components/landing/Pricing"; // Integrating the new Pricing component
import { FAQ } from "@/components/landing/faq";
import { CTA } from "@/components/landing/cta";
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
    // FIX: Switched to a light theme to match the Arcli branding and component designs
    <main className="bg-[#FAFCFF] text-slate-900 antialiased selection:bg-blue-100 selection:text-[#1B6EBF]">
      <Navbar />
      
      <div className="relative isolate overflow-hidden">
        {/* Decorative background gradients optimized for light mode */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none opacity-60 z-0">
          <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-100/50 blur-[120px]" />
          <div className="absolute bottom-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-sky-100/50 blur-[100px]" />
        </div>

        {/* Page Content Flow */}
        <div className="relative z-10 flex flex-col">
          <Hero />
          <HowItWorks />
          <DeepDiveFeatures />
          <Campaigns />
          <Testimonials />
          <Pricing />
          <FAQ />
          <CTA />
        </div>
      </div>
      
      <Footer />
    </main>
  );
}