import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED_ON } from "@/lib/legal/details";

const LINK_CLASS = "font-medium text-blue-700 underline underline-offset-4";

export type LegalSection = {
  /** Stable anchor, used by the table of contents and by links from other pages. */
  id: string;
  title: string;
  content: ReactNode;
};

type LegalDocumentProps = {
  icon: LucideIcon;
  title: string;
  intro: ReactNode;
  /** Plain-language highlights. A convenience only; the sections are what apply. */
  summary: ReactNode[];
  sections: LegalSection[];
  /** Links to the companion documents, shown under the article. */
  related: Array<{ href: string; label: string }>;
};

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={LINK_CLASS} href={href}>
      {children}
    </Link>
  );
}

export function LegalEmail({ subject }: { subject?: string }) {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";

  return (
    <a className={LINK_CLASS} href={`mailto:${LEGAL_CONTACT_EMAIL}${query}`}>
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

/** Lead-in label for a paragraph that defines or names something. */
export function Term({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-800">{children}</strong>;
}

/**
 * A two-column list of name and explanation that stacks on narrow screens.
 * Used instead of a table so long explanations stay readable on a phone.
 */
export function LegalDefinitions({
  items,
}: {
  items: Array<{ term: ReactNode; description: ReactNode }>;
}) {
  return (
    <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
      {items.map((item, index) => (
        <div key={index} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4">
          <dt className="font-semibold text-slate-800">{item.term}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Shared layout for the legal pages: header, plain-language summary, table of
 * contents, and numbered sections with stable anchors.
 */
export function LegalDocument({
  icon: Icon,
  title,
  intro,
  summary,
  sections,
  related,
}: LegalDocumentProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <header className="mt-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Icon className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated {LEGAL_UPDATED_ON}</p>
          <div className="mt-6 space-y-3 text-base leading-7 text-slate-600">{intro}</div>
        </header>

        <section
          aria-labelledby="legal-summary"
          className="mt-8 rounded-3xl border border-blue-100 bg-blue-50/60 p-7 sm:p-10"
        >
          <h2 id="legal-summary" className="text-lg font-semibold tracking-tight text-slate-950">
            The short version
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-slate-700">
            {summary.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            This summary is here to help you find your way around. It does not replace the full text below.
          </p>
        </section>

        <nav
          aria-label="Contents"
          className="mt-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"
        >
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Contents</h2>
          <ol className="mt-4 grid gap-x-8 gap-y-2 text-[15px] leading-6 sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a
                  className="text-slate-600 underline-offset-4 hover:text-blue-700 hover:underline"
                  href={`#${section.id}`}
                >
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="mt-8 space-y-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-8 space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                {index + 1}. {section.title}
              </h2>
              <div className="space-y-3 text-[15px] leading-7 text-slate-600">{section.content}</div>
            </section>
          ))}
        </article>

        <p className="mt-6 text-sm leading-6 text-slate-500">
          See also:{" "}
          {related.map((item, index) => (
            <span key={item.href}>
              {index > 0 ? " · " : ""}
              <Link href={item.href} className="underline underline-offset-4 hover:text-slate-700">
                {item.label}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </main>
  );
}
