import { BlueprintHero } from '@/components/landing/blueprint-hero';
import { EngineSpecs } from '@/components/landing/engine-specs';
import { ModularPipeline } from '@/components/landing/modular-pipeline';
import { BrutalistCTA } from '@/components/landing/brutalist-cta';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-white text-slate-900 font-sans selection:bg-orange-500 selection:text-white">
      {/* Global Blueprint Grid */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.15]" 
           style={{ backgroundImage: 'linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)', backgroundSize: '4rem 4rem' }}>
      </div>

      <div className="relative z-10">
        <Navbar />
        <main>
          <BlueprintHero />
          <EngineSpecs />
          <ModularPipeline />
          <BrutalistCTA />
        </main>
        <Footer />
      </div>
    </div>
  );
}