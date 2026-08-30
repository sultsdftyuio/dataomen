import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";

import Footer from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";
import { type ResourceGuide } from "@/lib/seo/resources";
import { SITE_URL } from "@/lib/site";

type ResourceHubProps = {
  guides: readonly ResourceGuide[];
};

export function ResourceHub({ guides }: ResourceHubProps) {
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Arcli buyer-intent resources",
    description: "Practical guides to buyer intent, public conversation research, and B2B prospecting.",
    url: `${SITE_URL}/resources`,
    hasPart: guides.map((guide) => ({
      "@type": "WebPage",
      name: guide.title,
      url: `${SITE_URL}${guide.path}`,
    })),
  }).replace(/</g, "\\u003c");

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#0B1120]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      <Navbar />

      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F0F7FF_100%)] px-6 pb-16 pt-36 sm:pb-20">
        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C8D9E8] bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#1B6EBF]">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Arcli resources
          </span>
          <h1 className="pfd mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.06] tracking-[-0.025em] text-[#0A1628] sm:text-5xl">
            Practical guides to buyer intent and B2B prospecting.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#1E3A5F]">
            Learn how to find buyer language, assess public conversations, and build a prospecting workflow that stays useful to a real human.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <div className="grid gap-5 md:grid-cols-2">
          {guides.map((guide) => (
            <article key={guide.slug} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition-colors hover:border-[#3B9AE8]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1B6EBF]">{guide.eyebrow}</p>
              <h2 className="pfd mt-4 text-3xl font-semibold leading-tight tracking-[-0.015em] text-[#0A1628]">
                <Link href={guide.path} className="transition-colors hover:text-[#1B6EBF]">{guide.title}</Link>
              </h2>
              <p className="mt-4 text-[16px] leading-7 text-slate-600">{guide.description}</p>
              <Link href={guide.path} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#1B6EBF]">
                Read the guide <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

        <section className="mt-16 rounded-3xl border border-[#C8D9E8] bg-[#F0F7FF] p-8 sm:p-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1B6EBF]">A better starting point</p>
            <h2 className="pfd mt-3 text-3xl font-semibold tracking-[-0.015em] text-[#0A1628]">
              Start with evidence, then decide what deserves attention.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-[#1E3A5F]">
              Arcli helps teams turn their website and buyer language into a reviewable queue of public conversations. A match is a suggestion—not a reason to skip human judgment.
            </p>
            <ul className="mt-6 space-y-3 text-[16px] text-[#1E3A5F]">
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#047857]" aria-hidden="true" />See the original source behind a candidate.</li>
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#047857]" aria-hidden="true" />Review why it may fit before taking action.</li>
            </ul>
            <Link href="/register" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#1B6EBF] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0F4F91]">
              Try Arcli <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </section>

      <Footer />
    </main>
  );
}
