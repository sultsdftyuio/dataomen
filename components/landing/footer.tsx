// components/landing/footer.tsx
"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { seoPages } from '@/lib/seo/index';

// --- Types & Interfaces ---

interface NavigationLink {
  name: string;
  href: string;
}

interface NavigationSection {
  title: string;
  links: NavigationLink[];
}

interface SeoPageLink {
  slug: string;
  title: string;
}

interface GroupedSeoPages {
  [key: string]: SeoPageLink[];
}

// --- Data Configuration (Core Brand Links) ---

const BRAND_SECTIONS: NavigationSection[] = [
  {
    title: 'Product',
    links: [
      { name: 'Platform', href: '/platform' },
      { name: 'AI Agents', href: '/agents' },
      { name: 'Integrations', href: '/integrations' },
      { name: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { name: 'About', href: '/about' },
      { name: 'Blog', href: '/blog' },
      { name: 'Careers', href: '/careers' },
      { name: 'Press', href: '/press' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { name: 'Privacy Policy', href: '/privacy' },
      { name: 'Terms of Service', href: '/terms' },
      { name: 'Security', href: '/security' },
      { name: 'GDPR', href: '/gdpr' },
    ],
  },
  {
    title: 'Support',
    links: [
      { name: 'Documentation', href: '/docs' },
      { name: 'Status', href: '/status' },
      { name: 'Contact', href: '/contact' },
      { name: 'Community', href: '/community' },
    ],
  },
];

// --- Sub-Components ---

const LinkList: React.FC<{ section: NavigationSection }> = ({ section }) => (
  <div className="flex flex-col space-y-4">
    <h3 className="font-semibold text-zinc-900 text-base">
      {section.title}
    </h3>
    <ul className="flex flex-col space-y-3">
      {section.links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="transition-colors hover:text-blue-600 text-sm text-zinc-600"
          >
            {link.name}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

// --- Main Component ---

export default function Footer() {
  // Analytical Efficiency: Memoizing SEO grouping to prevent re-computations
  const groupedPages = useMemo(() => {
    const grouped: GroupedSeoPages = {};

    Object.entries(seoPages).forEach(([slug, data]) => {
      const type = data.type || 'resources'; // Fallback
      if (!grouped[type]) grouped[type] = [];

      // Clean up title logic (e.g., "Best AI | Arcli" -> "Best AI")
      const cleanTitle = data.title.split('|')[0].trim();
      grouped[type].push({ slug, title: cleanTitle });
    });

    return grouped;
  }, []);

  const seoColumns = useMemo(() => Object.keys(groupedPages).sort(), [groupedPages]);

  return (
    <footer className="w-full bg-white border-t border-zinc-200" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Arcli Footer and Site Navigation
      </h2>
      
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 lg:px-8">
        
        {/* Section 1: SEO Link Silo (Dynamic Content) */}
        {seoColumns.length > 0 && (
          <div className="mb-16">
            <div className="mb-10">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-2">
                Explore Arcli
              </h2>
              <p className="text-zinc-500 text-sm max-w-2xl">
                Discover how our autonomous AI agents adapt to your specific analytical needs, 
                datasets, and engineering workflows.
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-10">
              {seoColumns.map((type) => (
                <div key={type} className="flex flex-col space-y-4">
                  <h3 className="text-xs font-bold text-zinc-900 tracking-wider uppercase border-l-2 border-blue-600 pl-3">
                    {type.endsWith('s') ? type : `${type}s`}
                  </h3>
                  <ul className="flex flex-col space-y-3">
                    {groupedPages[type].map((page) => (
                      <li key={page.slug}>
                        <Link
                          href={`/${page.slug}`}
                          className="text-sm text-zinc-500 hover:text-blue-600 transition-colors duration-200 block"
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
        )}

        {/* Section 2: Brand & Core Navigation */}
        <div className="xl:grid xl:grid-cols-3 xl:gap-8 pt-12 pb-12 border-y border-zinc-200">
          <div className="space-y-6 xl:col-span-1">
            <Link href="/" className="inline-block">
              <span className="sr-only">Arcli</span>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
                  A
                </div>
                <span className="text-xl font-bold text-zinc-900">Arcli.</span>
              </div>
            </Link>
            <p className="text-sm text-zinc-600 leading-relaxed max-w-xs">
              The AI data analyst for modern teams. Ask questions. Get charts. Deploy agents. No SQL required.
            </p>
            <div className="flex gap-x-4">
              <Link 
                href="/register" 
                className="group flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                Start for free
                <ArrowRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
          
          <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <LinkList section={BRAND_SECTIONS[0]} />
              <div className="mt-10 md:mt-0">
                <LinkList section={BRAND_SECTIONS[1]} />
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <LinkList section={BRAND_SECTIONS[2]} />
              <div className="mt-10 md:mt-0">
                <LinkList section={BRAND_SECTIONS[3]} />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Bottom Copyright & Compliance */}
        <div className="mt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-xs text-zinc-500">
            <p>&copy; {new Date().getFullYear()} Arcli Technologies Inc.</p>
            <span className="hidden md:inline text-zinc-300">•</span>
            <p>Made with care for data teams worldwide.</p>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 border border-zinc-200">
            <ShieldCheck className="w-4 h-4 text-green-600" aria-hidden="true" />
            <span className="text-xs font-medium text-zinc-700 tracking-wide uppercase">
              SOC2 Type II Certified
            </span>
          </div>
        </div>
        
      </div>
    </footer>
  );
}