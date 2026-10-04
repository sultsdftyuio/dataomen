import type { Metadata } from "next";

import { DEFAULT_OG_IMAGE_URL, SITE_URL } from "@/lib/site";

export function publicPageMetadata(path: string, title: string, description: string): Metadata {
  const url = new URL(path, SITE_URL).toString();

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Arcli",
      locale: "en_US",
      type: "website",
      images: [{
        url: DEFAULT_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Arcli prospect research with source-linked evidence",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE_URL],
    },
  };
}
