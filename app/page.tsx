import React from "react";
import { redirect } from "next/navigation";
import "../styles/globals.css";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DeepDiveFeatures } from "@/components/landing/Deepdivefeatures";
import { Campaigns } from "@/components/landing/Campaigns"; 
import { Testimonials } from "@/components/landing/testimonials";
import Pricing from "@/components/landing/Pricing"; 
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
    // ALIGNED: Switched base to match exact custom text color (#0B1120) and a sharper selection highlight
    <main className="bg-[#FAFAFA] text-[#0B1120] font-sans antialiased selection:bg-blue-500/20 selection:text-blue-900">
      <Navbar />
      
      <div className="relative isolate overflow-hidden">
        
        {/* AESTHETIC UPGRADE:
          Replaced the "floaty" blurred background blobs with a highly precise, 
          structural dot-grid to match the "deterministic engineering" brand promise.
        */}
        <div 
          aria-hidden="true" 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)',
            backgroundSize: '32px 32px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 10%, transparent 90%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 10%, transparent 90%)'
          }}
        />

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