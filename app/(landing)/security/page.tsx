import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { createOgImageUrl } from "@/lib/og-image";
import { SITE_URL } from "@/lib/site";

const PAGE_URL = `${SITE_URL}/security`;
const description =
  "How Arcli protects workspaces and handles selected public-source information for evidence-first prospect discovery.";
const OG_IMAGE_URL = new URL(
  createOgImageUrl("Security and public-source data practices", "security"),
  SITE_URL,
).toString();

export const metadata: Metadata = {
  title: "Security and Public-Source Data Practices | Arcli",
  description,
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "Security and Public-Source Data Practices | Arcli",
    description,
    url: PAGE_URL,
    siteName: "Arcli",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Arcli security and public-source data practices",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Security and Public-Source Data Practices | Arcli",
    description,
    images: [OG_IMAGE_URL],
  },
};

const practices = [
  {
    title: "Workspace-scoped access",
    description:
      "Arcli is designed so a workspace can access its own settings, discovery results, and review decisions—not another workspace's information.",
  },
  {
    title: "Public-source boundaries",
    description:
      "Arcli is intended for supported public sources and public discussions. It does not collect private groups, direct messages, or private profiles as part of the discovery workflow.",
  },
  {
    title: "Human review before action",
    description:
      "A match is a reviewable suggestion with source evidence. Arcli does not send messages from a candidate queue or make an automated decision about a person.",
  },
  {
    title: "Removal and suppression requests",
    description:
      "People can request removal of a public-source record. Arcli uses a suppression identity where technically possible to avoid collecting the same item again.",
  },
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <header className="mt-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Arcli trust center</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Security and public-source data practices</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Arcli helps businesses review relevant public conversations about problems their product may solve. This page explains the operating boundaries behind that workflow.
          </p>
        </header>

        <article className="mt-8 space-y-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">How Arcli approaches prospect discovery</h2>
            <p className="mt-4 text-[16px] leading-7 text-slate-600">
              Arcli is built for evidence-first research. A customer supplies a website and matching brief; Arcli evaluates selected public discussions for possible relevance, preserves the source link and matching reason, and leaves the final judgment to a person.
            </p>
          </section>

          <section className="grid gap-5 sm:grid-cols-2">
            {practices.map((practice) => (
              <div key={practice.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <h3 className="text-lg font-semibold tracking-tight text-slate-900">{practice.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{practice.description}</p>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-2xl font-semibold tracking-tight">What Arcli does not do</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[16px] leading-7 text-slate-600">
              <li>It does not read private conversations or private communities.</li>
              <li>It does not automatically send cold outreach from a candidate queue.</li>
              <li>It does not treat a public post as proof that someone wants to buy.</li>
              <li>It does not use sensitive personal data for prospect targeting.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold tracking-tight">Questions, removal requests, and policy details</h2>
            <p className="mt-4 text-[16px] leading-7 text-slate-600">
              Read our <Link href="/privacy" className="font-medium text-blue-700 underline underline-offset-4">Privacy Policy</Link> for details on information handling and our <Link href="/privacy/remove" className="font-medium text-blue-700 underline underline-offset-4">public-source removal form</Link> to request removal. For security questions, contact <a className="font-medium text-blue-700 underline underline-offset-4" href="mailto:support@arcli.tech">support@arcli.tech</a>.
            </p>
          </section>
        </article>

        <p className="mt-6 text-center text-sm text-slate-500">Last updated August 30, 2026</p>
      </div>
    </main>
  );
}
