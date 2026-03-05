'use client';

export function TrustedBy() {
  return (
    <section className="py-10 border-y border-white/5 bg-white/[0.02]">
      <div className="container mx-auto px-4 text-center">
        <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mb-6">
          Trusted by data-driven teams
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
          {/* Replace with actual SVG logos in production */}
          <div className="text-xl font-bold text-white">Acme Corp</div>
          <div className="text-xl font-bold text-white">Globex</div>
          <div className="text-xl font-bold text-white">Soylent</div>
          <div className="text-xl font-bold text-white">Initech</div>
          <div className="text-xl font-bold text-white">Umbrella</div>
        </div>
      </div>
    </section>
  );
}