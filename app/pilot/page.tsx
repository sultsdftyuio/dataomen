import type { Metadata } from "next";
import { ArrowLeft, BadgeCheck, FileSearch, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { PilotApplicationForm } from "@/components/landing/pilot-application-form";
import { normalizeWebsite } from "@/components/landing/redesign/website-link";
import { Navbar } from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Request a Prospect Coverage Review | Arcli",
  description: "Tell Arcli what you sell and who you want to reach. We will assess whether a reviewed prospect pilot can serve your market.",
  robots: { index: false, follow: true },
};

const points = [
  { icon: FileSearch, title: "We check the market", copy: "We look for credible account sources and enough potential fit for your brief." },
  { icon: BadgeCheck, title: "We agree on scope", copy: "A pilot starts only when the targeting, review work, and commercial terms make sense." },
  { icon: ShieldCheck, title: "You keep the decision", copy: "Every delivered item is for your review. Arcli does not send outreach for you." },
];

export default async function PilotPage({ searchParams }: { searchParams: Promise<{ website?: string }> }) {
  const { website } = await searchParams;
  const initialWebsiteUrl = normalizeWebsite(website ?? "") ?? "";
  return (
    <main className="min-h-screen bg-[#F6FAFE] text-[#0A1628]">
      <Navbar />
      <div className="relative overflow-hidden border-b border-[#DDE8F2] bg-[linear-gradient(180deg,#FFFFFF_0%,#F4F8FF_100%)] px-6 pb-12 pt-28 sm:pt-32">
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(27,110,191,0.17) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        <div className="relative mx-auto max-w-6xl"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1B6EBF] hover:underline"><ArrowLeft className="size-4" /> Back to Arcli</Link><p className="mt-8 text-xs font-bold uppercase tracking-[.12em] text-[#1B6EBF]">Founding prospect pilot</p><h1 className="pfd mt-3 max-w-3xl text-[clamp(2.5rem,5vw,4.4rem)] leading-[1.08] tracking-[-.025em]">Let’s see what your market can support.</h1><p className="mt-5 max-w-2xl text-base leading-8 text-[#546F8A]">Share your website and the customers you want to reach. We’ll review the fit and source coverage before discussing a pilot. Applying does not start a subscription.</p></div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[.78fr_1.22fr] lg:gap-14 lg:py-16">
        <aside className="lg:pt-4"><h2 className="pfd text-2xl leading-tight text-[#0A1628]">What happens next</h2><div className="mt-7 space-y-6">{points.map(({ icon: Icon, title, copy }) => <div key={title} className="flex gap-3.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EBF4FD] text-[#1B6EBF]"><Icon className="size-4" /></span><div><h3 className="text-sm font-semibold text-[#0A1628]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#546F8A]">{copy}</p></div></div>)}</div><div className="mt-9 rounded-lg border border-[#DDE8F2] bg-white p-5 text-sm leading-6 text-[#546F8A]">The pilot has no public weekly volume guarantee. We’ll agree on a realistic scope after reviewing your market.</div></aside>
        <PilotApplicationForm initialWebsiteUrl={initialWebsiteUrl} />
      </div>
      <Footer />
    </main>
  );
}
