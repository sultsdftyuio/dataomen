import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResourceGuide } from "@/components/resources/resource-guide";
import { createOgImageUrl } from "@/lib/og-image";
import { resourceBySlug, resourceGuides } from "@/lib/seo/resources";
import { SITE_URL } from "@/lib/site";

type ResourcePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return resourceGuides.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = resourceBySlug(slug);

  if (!guide) return {};

  const url = `${SITE_URL}${guide.path}`;
  const ogImageUrl = new URL(createOgImageUrl(guide.title), SITE_URL).toString();

  return {
    title: `${guide.title} | Arcli`,
    description: guide.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${guide.title} | Arcli`,
      description: guide.description,
      url,
      siteName: "Arcli",
      type: "article",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: guide.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${guide.title} | Arcli`,
      description: guide.description,
      images: [ogImageUrl],
    },
  };
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { slug } = await params;
  const guide = resourceBySlug(slug);

  if (!guide) notFound();

  return <ResourceGuide guide={guide} />;
}
