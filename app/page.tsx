import { Hero } from '@/components/landing/hero';
import { TrustedBy } from '@/components/landing/trusted-by';
import { Features } from '@/components/landing/features';
import { FAQ } from '@/components/landing/faq';
import { CTA } from '@/components/landing/cta';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-50 font-sans selection:bg-purple-500/30 selection:text-purple-200">
      <Navbar />
      <main>
        <Hero />
        <TrustedBy />
        <Features />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}