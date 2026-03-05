'use client';

import Link from 'next/link';
import { TerminalSquare } from 'lucide-react';

export function CTA() {
  return (
    <section className="py-24 relative overflow-hidden bg-white border-t border-slate-200">
      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-4xl mx-auto p-10 md:p-20 rounded-3xl bg-indigo-600 shadow-2xl relative overflow-hidden">
          
          {/* Decorative background elements inside the CTA */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-black/10 rounded-full blur-2xl"></div>

          <div className="relative z-10">
            <TerminalSquare className="w-14 h-14 text-indigo-200 mx-auto mb-6" />
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6">
              Ready for Analytical Efficiency?
            </h2>
            <p className="text-xl text-indigo-100 mb-10 max-w-2xl mx-auto">
              Join the platform that treats logic as swappable modules and computation as a vectorized priority.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link 
                href="/register" 
                className="px-8 py-4 bg-white hover:bg-slate-50 text-indigo-700 rounded-lg font-bold transition-all shadow-md hover:shadow-lg"
              >
                Create Workspace
              </Link>
              <Link 
                href="https://github.com/your-repo" 
                target="_blank"
                className="px-8 py-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg font-bold border border-indigo-500 transition-all"
              >
                Read the Docs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}