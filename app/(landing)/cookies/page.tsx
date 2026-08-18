import Link from "next/link";
import { ArrowLeft, Cookie } from "lucide-react";

export const metadata = {
  title: "Cookie Policy | Arcli",
  description: "How Arcli uses essential cookies and similar storage technologies.",
  alternates: { canonical: "/cookies" },
};

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        <article className="mt-10 space-y-9 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <header><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Cookie className="h-6 w-6" /></div><h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Arcli Cookie Policy</h1><p className="mt-3 text-sm text-slate-500">Last updated August 14, 2026</p></header>
          <section className="space-y-3 text-[15px] leading-7 text-slate-600"><h2 className="text-xl font-semibold text-slate-950">What we use</h2><p>Arcli uses essential cookies and similar browser storage to keep you signed in, protect your account and forms, remember necessary preferences, and operate the dashboard. Disabling essential storage can prevent the Service from working.</p></section>
          <section className="space-y-3 text-[15px] leading-7 text-slate-600"><h2 className="text-xl font-semibold text-slate-950">Analytics and advertising</h2><p>We do not use cookies to build advertising audiences or sell cross-site tracking data. If we add non-essential analytics or marketing technologies, we will update this policy and provide any consent choices required by applicable law before using them.</p></section>
          <section className="space-y-3 text-[15px] leading-7 text-slate-600"><h2 className="text-xl font-semibold text-slate-950">Your choices</h2><p>You can manage cookies in your browser settings. Removing cookies signs you out and may reset preferences. For privacy questions, see our <Link className="font-medium text-blue-700 underline underline-offset-4" href="/privacy">Privacy Policy</Link> or contact <a className="font-medium text-blue-700 underline underline-offset-4" href="mailto:support@arcli.tech">support@arcli.tech</a>.</p></section>
        </article>
      </div>
    </main>
  );
}
