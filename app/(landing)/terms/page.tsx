import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import type { ReactNode } from "react";

export const metadata = {
  title: "Terms of Service | Arcli",
  description: "Terms and acceptable use rules for Arcli's public-conversation monitoring service.",
  alternates: { canonical: "/terms" },
};

const UPDATED_ON = "August 14, 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3"><h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2><div className="space-y-3 text-[15px] leading-7 text-slate-600">{children}</div></section>;
}

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        <header className="mt-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Scale className="h-6 w-6" /></div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Arcli Terms of Service</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated {UPDATED_ON}</p>
          <p className="mt-6 text-base leading-7 text-slate-600">These Terms govern your use of Arcli. By creating an account or using the Service, you agree to them.</p>
        </header>

        <article className="mt-8 space-y-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <Section title="1. The Service">
            <p>Arcli helps customers identify potentially relevant, publicly available conversations about the problem their product solves. It learns from information the customer supplies, checks selected public-source content, and presents a lead brief and optional suggested reply for human review.</p>
            <p>Arcli is not a data broker, contact-enrichment service, outreach automation tool, or guarantee of sales, leads, accuracy, availability, or results.</p>
          </Section>
          <Section title="2. Your account and information">
            <p>You must provide accurate account information, keep your credentials secure, and have authority to use any website, product information, or CRM connection you add to Arcli. You are responsible for activity under your account.</p>
          </Section>
          <Section title="3. Public-source content">
            <p>Arcli uses selected public sources through configured public interfaces. Public availability does not make content free of legal or platform restrictions. Source content remains subject to the source’s own terms and the rights of its authors.</p>
            <p>We may limit, remove, or stop collecting content or a source at any time to protect people, honour a removal request, comply with source requirements, or manage legal and security risk.</p>
          </Section>
          <Section title="4. Human review and outreach">
            <p>Arcli does not automatically send messages. A lead brief or suggested reply is only an assistive output. You must review the original public post and decide whether any outreach is appropriate.</p>
            <p>If you contact someone, you are responsible for the message, lawful basis, disclosures, opt-out handling, and compliance with anti-spam, privacy, consumer-protection, and platform rules that apply to you and the recipient.</p>
          </Section>
          <Section title="5. Acceptable use">
            <p>You must not use Arcli to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>send or facilitate automated, bulk, deceptive, or unsolicited outreach;</li>
              <li>target, profile, or contact minors;</li>
              <li>infer, target, or discriminate based on sensitive personal data, including health, religion, ethnicity, political views, sexual orientation, gender identity, or disability;</li>
              <li>export, resell, sublicense, or create a competing database from public-source content;</li>
              <li>circumvent source controls, scrape private content, identify anonymous people, or collect contact details from the Service;</li>
              <li>use the Service for unlawful, harmful, fraudulent, harassing, or rights-infringing activity.</li>
            </ul>
          </Section>
          <Section title="6. AI-assisted output">
            <p>AI-assisted summaries, scores, classifications, and suggested replies can be incomplete or wrong. They are not legal, compliance, employment, credit, health, or financial advice, and must not be the sole basis for a decision about a person.</p>
          </Section>
          <Section title="7. Privacy and removal requests">
            <p>Our <Link className="font-medium text-blue-700 underline underline-offset-4" href="/privacy">Privacy Policy</Link> explains how we handle information. A person can ask us to remove public-source content through our <Link className="font-medium text-blue-700 underline underline-offset-4" href="/privacy/remove">removal request form</Link>. Customers must not try to bypass or reverse a completed suppression.</p>
          </Section>
          <Section title="8. Suspension and termination">
            <p>We may suspend or terminate access where we reasonably believe these Terms, source requirements, applicable law, or another person’s rights may be violated. You may stop using Arcli at any time, subject to any applicable subscription terms.</p>
          </Section>
          <Section title="9. Changes, legal details, and contact">
            <p>We may update these Terms as the Service changes. The current date appears above. The Arcli operating legal entity and any subscription-specific governing law or dispute terms are identified in the applicable order form or invoice.</p>
            <p>Contact <a className="font-medium text-blue-700 underline underline-offset-4" href="mailto:support@arcli.tech">support@arcli.tech</a> with questions. These Terms require legal review before broad commercial launch to confirm the operating entity, registered address, governing law, and required consumer or regional provisions.</p>
          </Section>
        </article>
      </div>
    </main>
  );
}
