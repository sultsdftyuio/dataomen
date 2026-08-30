import type { Metadata } from "next";

import { ResourceHub } from "@/components/resources/resource-hub";
import { createOgImageUrl } from "@/lib/og-image";
import { resourceGuides } from "@/lib/seo/resources";
import { SITE_URL } from "@/lib/site";

const PAGE_URL = `${SITE_URL}/resources`;
const description =
  "Practical guides to buyer intent, public conversation research, buyer language, and evidence-first B2B prospecting.";
const OG_IMAGE_URL = new URL(
  createOgImageUrl("Buyer intent and B2B prospecting resources"),
  SITE_URL,
).toString();

export const metadata: Metadata = {
  title: "Buyer Intent and B2B Prospecting Resources | Arcli",
  description,
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "Buyer Intent and B2B Prospecting Resources | Arcli",
    description,
    url: PAGE_URL,
    siteName: "Arcli",
    type: "website",
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Arcli buyer-intent and B2B prospecting resources",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Buyer Intent and B2B Prospecting Resources | Arcli",
    description,
    images: [OG_IMAGE_URL],
  },
};

export default function ResourcesPage() {
  return <ResourceHub guides={resourceGuides} />;
}
