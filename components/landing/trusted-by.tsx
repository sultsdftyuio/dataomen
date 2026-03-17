'use client';

import React, { useMemo } from 'react';

/**
 * Arcli TrustedBy Component
 * Architecture: Modular Social Proof Layer.
 * Strategy: Establish credibility through high-velocity brand associations.
 * Constraints: Strictly adheres to original Tailwind styling and layout.
 */

interface BrandLogo {
  name: string;
}

const BRANDS: BrandLogo[] = [
  { name: "Nexus" },
  { name: "Quantum" },
  { name: "Vertex" },
  { name: "GlobalTech" },
  { name: "Acme Corp" }
];

export function TrustedBy() {
  /**
   * Analytical Efficiency: Memoizing the brand list to prevent 
   * unnecessary re-computations in a high-performance SaaS environment.
   */
  const brandList = useMemo(() => BRANDS, []);

  return (
    <section className="py-10 border-y border-white/5 bg-white/[0.02]">
      <div className="container mx-auto px-4 text-center">
        <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mb-6">
          Trusted by high-growth teams running Arcli
        </p>
        
        <div 
          className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500"
          role="list"
          aria-label="Partner and Customer Logos"
        >
          {brandList.map((brand) => (
            <div 
              key={brand.name} 
              className="text-xl font-bold text-white tracking-tight"
              role="listitem"
            >
              {brand.name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}