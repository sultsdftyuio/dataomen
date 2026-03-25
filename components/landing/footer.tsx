// components/landing/footer.tsx
"use client";

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// --- Types & Interfaces ---

interface NavigationLink {
  name: string;
  href: string;
}

interface NavigationSection {
  title: string;
  links: NavigationLink[];
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
      { name: 'Contact', href: 'mailto:support@arcli.tech' },
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

/**
 * Global Footer Component
 * Optimized for clean UI, minimal DOM size, and focused PageRank distribution.
 */
export default function Footer() {
  return (
    <footer className="w-full bg-white border-t border-zinc-200" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Arcli Footer and Site Navigation
      </h2>
      
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 lg:px-8">
        
        {/* Section 1: Brand & Core Navigation */}
        <div className="xl:grid xl:grid-cols-3 xl:gap-8 pb-12 border-b border-zinc-200">
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

        {/* Section 2: Bottom Copyright & Compliance */}
        <div className="mt-8 flex flex-col items-center justify-center md:flex-row md:justify-between gap-4">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-xs text-zinc-500">
            <p>&copy; {new Date().getFullYear()} Arcli Technologies Inc.</p>
            <span className="hidden md:inline text-zinc-300">•</span>
            <p>Made with care for data teams worldwide.</p>
          </div>
        </div>
        
      </div>
    </footer>
  );
}