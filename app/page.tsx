import type { Metadata } from "next";

import { LandingHeader } from "@/components/landing/redesign/landing-header";
import { ProspectEvidence } from "@/components/landing/redesign/prospect-evidence";
import { ResearchWorkflow } from "@/components/landing/redesign/research-workflow";
import { LandingConversion } from "@/components/landing/redesign/landing-conversion";
import { DEFAULT_OG_IMAGE_URL, SITE_URL } from "@/lib/site";
import "./landing.css";

const description =
  "Know who to reach out to and why. Arcli turns your website into a targeting brief, then helps you review prospects with source-linked evidence.";

export const metadata: Metadata = {
  title: "Arcli | Know Who to Reach Out To and Why",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Arcli | Know Who to Reach Out To and Why",
    description,
    url: SITE_URL,
    siteName: "Arcli",
    type: "website",
    images: [
      {
        url: DEFAULT_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Arcli prospect research",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arcli | Know Who to Reach Out To and Why",
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
      "Website-led targeting brief",
      "Public-conversation matching on Pro",
      "Evidence-backed prospect review",
    ],
  },
];

export default function Page() {
  return (
    <main className="arcli-home" id="top">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingHeader />
      <ProspectEvidence />
      <ResearchWorkflow />
      <LandingConversion />
    </main>
  );
}
