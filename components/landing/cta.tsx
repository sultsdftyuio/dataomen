'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function CTA() {
  return (
    <section className="py-32 relative overflow-hidden bg-slate-50 border-t border-slate-200">
      <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
        <div className="p-12 md:p-16 rounded-[2.5rem] bg-white border border-slate-200 shadow-2xl relative overflow-hidden">
          
          {/* Subtle decoration inside the CTA */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-100 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-100 rounded-full blur-3xl"></div>

          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6">
              Ready to talk to your data?
            </h2>
            <p className="text-xl text-slate-600 mb-10">
              Join teams saving hours every week. Deploy your first agent and start chatting today.
            </p>
            <Link 
              href="/register" 
              className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
            >
              <Sparkles className="w-5 h-5" />
              Get Started for Free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}