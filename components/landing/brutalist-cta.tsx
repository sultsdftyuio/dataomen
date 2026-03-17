'use client';

import Link from 'next/link';

export function BrutalistCTA() {
  return (
    <section className="bg-orange-500 py-32 border-b-2 border-slate-900 relative overflow-hidden">
      {/* Decorative background text */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 text-[15rem] font-black text-orange-600/50 whitespace-nowrap pointer-events-none select-none uppercase tracking-tighter">
        INSIGHTS
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <h2 className="text-5xl md:text-7xl font-black text-slate-900 uppercase tracking-tighter mb-8">
          Stop Guessing.<br/>Start Knowing.
        </h2>
        <p className="text-2xl text-slate-900 font-medium mb-12 max-w-2xl mx-auto">
          Give your team an AI data analyst. Connect your data in seconds and turn complex metrics into clear business decisions today.
        </p>
        
        <div className="flex flex-col sm:flex-row justify-center gap-6">
          <Link 
            href="/register" 
            className="px-10 py-6 bg-slate-900 text-white text-xl font-black uppercase tracking-widest border-4 border-slate-900 hover:bg-white hover:text-slate-900 transition-colors shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-2 hover:translate-y-2"
          >
            Start For Free
          </Link>
          <Link 
            href="#demo" 
            className="px-10 py-6 bg-transparent text-slate-900 text-xl font-black uppercase tracking-widest border-4 border-slate-900 hover:bg-slate-900 hover:text-white transition-colors"
          >
            Try The Playground
          </Link>
        </div>
      </div>
    </section>
  );
}