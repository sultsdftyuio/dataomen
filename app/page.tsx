import type { Metadata } from "next";
import "../styles/globals.css";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { PublicSources } from "@/components/landing/public-sources";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DeepDiveFeatures } from "@/components/landing/Deepdivefeatures";
import Pricing from "@/components/landing/Pricing"; 
import { FAQ } from "@/components/landing/faq";
import { CTA } from "@/components/landing/cta";
import Footer from "@/components/landing/footer";
import { DEFAULT_OG_IMAGE_URL, SITE_URL } from "@/lib/site";

const description =
  "Find public conversations where potential B2B buyers describe the problem you solve, then review the evidence before you reach out.";

export const metadata: Metadata = {
  title: "Arcli | Buyer Intent Discovery for B2B Founders",
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Arcli | Buyer Intent Discovery for B2B Founders",
    description,
    url: SITE_URL,
    siteName: "Arcli",
    type: "website",
    images: [
      {
        url: DEFAULT_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Arcli helps B2B founders review buyer-intent evidence from public conversations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arcli | Buyer Intent Discovery for B2B Founders",
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Arcli",
    url: SITE_URL,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Arcli",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description,
    featureList: [
      "Website-led buyer-language research",
      "Public-conversation matching",
      "Evidence-backed prospect review",
    ],
  },
];

export default function Page() {
  return (
    // ALIGNED: Switched base to match exact custom text color (#0B1120) and a sharper selection highlight
    <main className="bg-[#FAFAFA] text-[#0B1120] font-sans antialiased selection:bg-blue-500/20 selection:text-blue-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
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
          <PublicSources />
          <HowItWorks />
          <DeepDiveFeatures />
          <Pricing />
          <FAQ />
          <CTA />
        </div>
      </div>
      
      <Footer />
    </main>
  );
}
