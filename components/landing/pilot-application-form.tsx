"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

type SubmissionState = "idle" | "submitting" | "received" | "error";

const fieldClass = "w-full rounded-lg border border-[#C8D9E8] bg-white px-3.5 py-3 text-sm text-[#0A1628] outline-none transition-colors placeholder:text-[#91A4B7] focus:border-[#1B6EBF] focus:ring-[3px] focus:ring-[#DBECFA]";
const labelClass = "mb-2 block text-sm font-semibold text-[#1E3A5F]";

export function PilotApplicationForm({ initialWebsiteUrl = "" }: { initialWebsiteUrl?: string }) {
  const [status, setStatus] = useState<SubmissionState>("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch("/api/pilot/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"), websiteUrl: form.get("websiteUrl"),
          offer: form.get("offer"), idealCustomer: form.get("idealCustomer"),
          buyerRole: form.get("buyerRole") || "", geography: form.get("geography") || "",
          companyFax: form.get("companyFax") || "",
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "We could not receive your application.");
      setStatus("received");
      formElement.reset();
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "We could not receive your application.");
    }
  }

  if (status === "received") return (
    <div className="rounded-xl border border-[#C8D9E8] bg-white p-8 shadow-[0_10px_30px_rgba(10,22,40,0.06)] sm:p-10" role="status">
      <span className="flex size-12 items-center justify-center rounded-full bg-[#D1FAE5] text-[#047857]"><CheckCircle2 className="size-6" /></span>
      <h2 className="pfd mt-6 text-3xl">Application received.</h2>
      <p className="mt-3 text-sm leading-7 text-[#546F8A]">We’ll review your market and contact you at the address you provided. A pilot starts only after we agree on coverage, scope, and terms.</p>
      <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#1B6EBF] hover:underline">Return to Arcli <ArrowRight className="size-4" /></Link>
    </div>
  );

  return (
    <form onSubmit={submit} className="rounded-xl border border-[#C8D9E8] bg-white p-6 shadow-[0_10px_30px_rgba(10,22,40,0.06)] sm:p-8">
      <h2 className="pfd text-[1.75rem] leading-tight">Request your coverage review</h2>
      <p className="mt-2 text-sm leading-6 text-[#546F8A]">Tell us enough to assess your market. We can refine the brief together later.</p>
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="pilot-website" className={labelClass}>Your company website *</label><input id="pilot-website" name="websiteUrl" type="url" required maxLength={2048} autoComplete="url" placeholder="https://yourcompany.com" defaultValue={initialWebsiteUrl} className={fieldClass} /></div>
        <div className="sm:col-span-2"><label htmlFor="pilot-email" className={labelClass}>Your work email *</label><input id="pilot-email" name="email" type="email" required maxLength={320} autoComplete="email" placeholder="you@yourcompany.com" className={fieldClass} /></div>
        <div className="sm:col-span-2"><label htmlFor="pilot-offer" className={labelClass}>What do you sell? *</label><textarea id="pilot-offer" name="offer" required minLength={10} maxLength={500} rows={3} placeholder="A short description of your product and the problem it solves" className={fieldClass} /></div>
        <div className="sm:col-span-2"><label htmlFor="pilot-customer" className={labelClass}>Which companies are a good fit? *</label><textarea id="pilot-customer" name="idealCustomer" required minLength={10} maxLength={700} rows={3} placeholder="Industry, size, stage, technology, or other must-have criteria" className={fieldClass} /></div>
        <div><label htmlFor="pilot-role" className={labelClass}>Typical buyer role <span className="font-normal text-[#7B8FA3]">(optional)</span></label><input id="pilot-role" name="buyerRole" maxLength={160} placeholder="e.g. Head of Sales" className={fieldClass} /></div>
        <div><label htmlFor="pilot-geography" className={labelClass}>Target geography <span className="font-normal text-[#7B8FA3]">(optional)</span></label><input id="pilot-geography" name="geography" maxLength={160} placeholder="e.g. US and Canada" className={fieldClass} /></div>
      </div>
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden"><label htmlFor="pilot-fax">Fax</label><input id="pilot-fax" name="companyFax" type="text" tabIndex={-1} autoComplete="off" /></div>
      {status === "error" && <p role="alert" className="mt-5 rounded-lg border border-[#FEE2E2] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{error} <a href="mailto:support@arcli.tech" className="font-semibold underline">Email us</a> if the problem continues.</p>}
      <button type="submit" disabled={status === "submitting"} className="mt-7 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1B6EBF] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(27,110,191,0.22)] transition-colors hover:bg-[#0F4F91] disabled:cursor-wait disabled:opacity-70 sm:w-auto">{status === "submitting" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{status === "submitting" ? "Sending application" : "Request coverage review"}</button>
      <p className="mt-5 text-xs leading-5 text-[#7B8FA3]">We use these details only to review and respond to your request. See our <Link href="/privacy" className="font-semibold text-[#1B6EBF] underline">Privacy Policy</Link>.</p>
    </form>
  );
}
