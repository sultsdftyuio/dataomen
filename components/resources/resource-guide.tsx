import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";

import Footer from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";
import { type ResourceGuide, resourceBySlug } from "@/lib/seo/resources";
import { SITE_URL } from "@/lib/site";

type ResourceGuideProps = {
  guide: ResourceGuide;
};

function resourceStructuredData(guide: ResourceGuide) {
  const url = `${SITE_URL}${guide.path}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: guide.title,
        description: guide.description,
        url,
        isPartOf: {
          "@type": "WebSite",
          name: "Arcli",
          url: SITE_URL,
        },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: SITE_URL,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Resources",
              item: `${SITE_URL}/resources`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: guide.title,
              item: url,
            },
          ],
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

export function ResourceGuide({ guide }: ResourceGuideProps) {
  const relatedGuides = guide.relatedSlugs
    .map(resourceBySlug)
    .filter((related): related is ResourceGuide => Boolean(related));
  const structuredData = JSON.stringify(resourceStructuredData(guide)).replace(/</g, "\\u003c");

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#0B1120]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      <Navbar />

      <article>
        <header className="border-b border-slate-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F0F7FF_100%)] px-6 pb-16 pt-36 sm:pb-20">
          <div className="mx-auto max-w-3xl">
            <nav aria-label="Breadcrumb" className="mb-7 flex items-center gap-2 text-sm text-slate-500">
              <Link href="/" className="transition-colors hover:text-[#1B6EBF]">Home</Link>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <Link href="/resources" className="transition-colors hover:text-[#1B6EBF]">Resources</Link>
            </nav>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1B6EBF]">{guide.eyebrow}</p>
            <h1 className="pfd mt-4 text-4xl font-semibold leading-[1.06] tracking-[-0.025em] text-[#0A1628] sm:text-5xl">
              {guide.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#1E3A5F]">{guide.summary}</p>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
          <div className="space-y-14">
            {guide.sections.map((section) => (
              <section key={section.title}>
                <h2 className="pfd text-3xl font-semibold leading-tight tracking-[-0.015em] text-[#0A1628]">
                  {section.title}
                </h2>

                {section.paragraphs ? (
                  <div className="mt-5 space-y-4 text-[17px] leading-8 text-slate-700">
                    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                ) : null}

                {section.bullets ? (
                  <ul className="mt-6 space-y-4">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 text-[17px] leading-7 text-slate-700">
                        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#047857]" aria-hidden="true" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {section.steps ? (
                  <ol className="mt-7 space-y-4">
                    {section.steps.map((step, index) => (
                      <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex gap-4">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EBF4FD] text-sm font-bold text-[#1B6EBF]">
                            {index + 1}
                          </span>
                          <div>
                            <h3 className="text-lg font-semibold tracking-tight text-[#0A1628]">{step.title}</h3>
                            <p className="mt-2 text-[16px] leading-7 text-slate-600">{step.description}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>
            ))}
          </div>

          <section className="mt-16 rounded-3xl border border-[#C8D9E8] bg-[#F0F7FF] p-7 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1B6EBF]">Put the research to work</p>
            <h2 className="pfd mt-3 text-3xl font-semibold tracking-[-0.015em] text-[#0A1628]">
              Turn buyer language into a reviewable prospect queue.
            </h2>
            <p className="mt-3 max-w-xl text-[16px] leading-7 text-[#1E3A5F]">
              Add your website, review the public evidence behind each candidate, and decide what deserves a human follow-up.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#1B6EBF] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0F4F91]"
            >
              Try Arcli <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <section className="mt-16" aria-labelledby="faq-heading">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1B6EBF]">Questions</p>
            <h2 id="faq-heading" className="pfd mt-3 text-3xl font-semibold tracking-[-0.015em] text-[#0A1628]">
              Frequently asked questions
            </h2>
            <dl className="mt-7 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
              {guide.faqs.map((faq) => (
                <div key={faq.question} className="py-6">
                  <dt className="text-lg font-semibold tracking-tight text-[#0A1628]">{faq.question}</dt>
                  <dd className="mt-3 text-[16px] leading-7 text-slate-600">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-16 border-t border-slate-200 pt-10" aria-labelledby="related-heading">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1B6EBF]">Keep learning</p>
            <h2 id="related-heading" className="pfd mt-3 text-3xl font-semibold tracking-[-0.015em] text-[#0A1628]">
              Related resources
            </h2>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {relatedGuides.map((related) => (
                <Link
                  key={related.slug}
                  href={related.path}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-[#3B9AE8] hover:bg-[#F6FAFE]"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#1B6EBF]">{related.eyebrow}</p>
                  <h3 className="mt-3 text-base font-semibold leading-6 text-[#0A1628]">{related.title}</h3>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#1B6EBF]">
                    Read guide <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </article>

      <Footer />
    </main>
  );
}
