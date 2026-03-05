'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function CTA() {
  return (
    <section className="py-32 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/20 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
        <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
          Ready to talk to your data?
        </h2>
        <p className="text-xl text-slate-400 mb-10">
          Join thousands of analysts saving hours every week. Create a free workspace and start chatting today.
        </p>
        <Link 
          href="/register" 
          className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black hover:bg-slate-200 rounded-xl font-bold text-lg transition-transform hover:scale-105"
        >
          <Sparkles className="w-5 h-5" />
          Get Started for Free
        </Link>
      </div>
    </section>
  );
}