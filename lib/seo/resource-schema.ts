import { createOgImageUrl } from "@/lib/og-image";
import { RESOURCE_LAST_MODIFIED, type ResourceGuide } from "@/lib/seo/resources";
import { SITE_URL } from "@/lib/site";

export function resourceStructuredData(guide: ResourceGuide) {
  const url = `${SITE_URL}${guide.path}`;
  const image = new URL(createOgImageUrl(guide.title), SITE_URL).toString();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: guide.title,
        description: guide.description,
        url,
        isPartOf: { "@type": "WebSite", name: "Arcli", url: SITE_URL },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Resources", item: `${SITE_URL}/resources` },
            { "@type": "ListItem", position: 3, name: guide.title, item: url },
          ],
        },
      },
      {
        "@type": "Article",
        headline: guide.title,
        description: guide.description,
        mainEntityOfPage: url,
        image: [image],
        dateModified: RESOURCE_LAST_MODIFIED.toISOString(),
        author: { "@type": "Organization", name: "Arcli", url: SITE_URL },
        publisher: { "@type": "Organization", name: "Arcli", url: SITE_URL },
      },
    ],
  };
}
