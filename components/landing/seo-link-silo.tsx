import Link from 'next/link';
// Updated import path to match your architecture
import { seoPages } from '@/lib/seo/index';

// 1. Computation (Execution): Group the pages by type at build time.
// This is stateless and runs on the server, ensuring 0ms client-side overhead.
function groupSeoPagesByType() {
  const grouped: Record<string, Array<{ slug: string; title: string }>> = {};

  Object.entries(seoPages).forEach(([slug, data]) => {
    const type = data.type || 'resources'; // Fallback
    if (!grouped[type]) {
      grouped[type] = [];
    }
    // Clean up the title (e.g., "Best AI Data Analysis | DataOmen" -> "Best AI Data Analysis")
    const cleanTitle = data.title.split('|')[0].trim();
    grouped[type].push({ slug, title: cleanTitle });
  });

  return grouped;
}

export function SeoLinkSilo() {
  const groupedPages = groupSeoPagesByType();
  const columns = Object.keys(groupedPages).sort();

  // If there are no SEO pages, don't render the section to prevent empty gaps
  if (columns.length === 0) return null;

  return (
    <section className="border-t border-white/10 bg-neutral-950 py-16">
      <div className="container px-4 max-w-6xl mx-auto">
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-2">Explore DataOmen</h2>
          <p className="text-neutral-400 text-sm">
            Discover how our autonomous data department adapts to your specific analytical needs, features, and workflows.
          </p>
        </div>

        {/* 2. Interaction (Frontend): Responsive, semantic grid for crawler accessibility */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {columns.map((type) => (
            <div key={type} className="flex flex-col space-y-4">
              <h3 className="text-sm font-semibold text-white tracking-wider uppercase">
                {/* Pluralize the category name cleanly */}
                {type.endsWith('s') ? type : `${type}s`}
              </h3>
              <ul className="flex flex-col space-y-3">
                {groupedPages[type].map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/${page.slug}`}
                      className="text-sm text-neutral-400 hover:text-blue-400 transition-colors duration-200"
                    >
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}