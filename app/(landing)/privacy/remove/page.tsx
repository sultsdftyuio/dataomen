import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { RemovalRequestForm } from "./removal-request-form";

export const metadata = {
  title: "Remove public-source data | Arcli",
  description: "Request removal or suppression of public-source data from Arcli.",
};

export default function PublicDataRemovalPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/privacy" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" /> Back to privacy
        </Link>
        <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck className="h-6 w-6" /></div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Request public-source data removal</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">Arcli only monitors selected public discussions. If a public post or account should not appear in Arcli, ask us to remove it and stop collecting the matching public record.</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">We confirm requests before acting to protect people from fraudulent removals. This form is for public-source content, not customer account data.</p>
        </div>
        <div className="mt-6"><RemovalRequestForm /></div>
        <p className="mt-6 text-sm leading-6 text-slate-600">Prefer email? Contact <a className="font-medium text-blue-700 underline underline-offset-4" href="mailto:support@arcli.tech?subject=Public%20source%20data%20removal">support@arcli.tech</a> with the public link.</p>
      </div>
    </main>
  );
}
