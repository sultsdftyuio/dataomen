import Link from "next/link";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export const metadata = {
  title: "Privacy Policy | Arcli",
  description: "How Arcli handles account information and selected public-source data.",
};

const UPDATED_ON = "August 14, 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-slate-600">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <header className="mt-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck className="h-6 w-6" /></div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Arcli Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated {UPDATED_ON}</p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600">Arcli helps businesses find relevant public conversations about problems their product may solve. This policy explains what we collect, why we use it, and how to ask us to remove public-source content.</p>
        </header>

        <article className="mt-8 space-y-10 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <Section title="1. Who this policy covers">
            <p>This policy applies to arcli.tech, the Arcli dashboard, and related services (the “Service”). “Arcli”, “we”, and “us” mean the operator of arcli.tech. For a privacy question, contact <a className="font-medium text-blue-700 underline underline-offset-4" href="mailto:support@arcli.tech">support@arcli.tech</a>.</p>
            <p>Customers using Arcli decide how they use a lead after reviewing it. They remain responsible for their own outreach, CRM, and legal obligations.</p>
          </Section>

          <Section title="2. Information we collect">
            <p><strong className="font-semibold text-slate-800">Account and workspace information.</strong> This includes account details, authentication information, billing information provided to a payment provider, your website URL, and the product description or matching brief you provide.</p>
            <p><strong className="font-semibold text-slate-800">Selected public-source information.</strong> We collect limited content from supported public sources: a public post’s title and text, public handle, link, source name, and publication time. We use it only to assess whether the discussion may be relevant to a customer’s product.</p>
            <p>We do not collect private accounts, private groups, direct messages, profile biographies, or contact-enrichment data. We redact clear email addresses and telephone numbers from text before storage, and exclude posts that clearly concern minors or sensitive personal topics.</p>
            <p><strong className="font-semibold text-slate-800">Service and security information.</strong> We collect technical logs needed to operate, secure, rate-limit, and troubleshoot the Service.</p>
          </Section>

          <Section title="3. How we use information">
            <p>We use information to provide the Service, create and secure accounts, process subscriptions, understand the product a customer wants to monitor, retrieve and evaluate relevant public discussions, maintain source and rate-limit controls, and respond to support or privacy requests.</p>
            <p>Arcli does not sell public-source personal data or use it to train Arcli models. We do not send messages to people from within Arcli. Any customer outreach is a separate, human-controlled action outside the Service.</p>
          </Section>

          <Section title="4. AI-assisted matching">
            <p>Arcli may send a limited public post and the customer’s matching brief to an AI service provider to assess relevance and create a suggested, human-editable response. We use these providers to operate the Service, not to make an automated decision with legal or similarly significant effects about an individual.</p>
            <p>A match is a suggestion, not a fact or a recommendation to contact someone. Customers must review it, use the original public link, and make their own decision.</p>
          </Section>

          <Section title="5. Sharing and public-source rules">
            <p>We share information only with service providers that help us host, secure, authenticate, process payments, or provide AI-assisted matching, and when legally required. We do not sell or rent personal information.</p>
            <p>We limit collection to configured public providers and their permitted public interfaces. We may turn off a source, refuse content, or remove data when source terms, a privacy request, security concerns, or applicable law require it.</p>
          </Section>

          <Section title="6. Retention and deletion">
            <p>Our default public-source retention period is 30 days. When that period ends, Arcli deletes the public-source record and the related copies in lead briefs and buyer-language research. We may retain a small amount of operational information for security, dispute handling, or legal obligations where necessary.</p>
            <p>After a removal request is resolved, we anonymise the requester’s email, rate-limit identifier, and free-form explanation after 90 days while keeping only the public-source suppression identity needed to avoid collecting the same item again.</p>
            <p>We retain customer account and workspace data for as long as the account is active and for a limited period afterwards as needed to provide the Service, meet legal obligations, resolve disputes, and enforce agreements.</p>
          </Section>

          <Section title="7. Your choices and privacy rights">
            <p>Depending on where you live, you may have rights to request access, correction, deletion, objection, restriction, or portability. We may need to verify your identity before acting on a request.</p>
            <p>If a public post or public account should not appear in Arcli, use our <Link className="font-medium text-blue-700 underline underline-offset-4" href="/privacy/remove">public-source data removal form</Link>. Once we verify and complete a request, we delete matching records and suppress future collection of the same public post, handle, or link where technically possible.</p>
          </Section>

          <Section title="8. International processing and security">
            <p>Arcli and its providers may process information in countries other than your own. Where required, we use appropriate safeguards for international transfers. No system is completely secure, but we use technical and organisational measures designed to protect information from unauthorised access, loss, or misuse.</p>
          </Section>

          <Section title="9. Children and sensitive information">
            <p>Arcli is not directed to children. Do not use the Service to target, profile, or contact minors. We also prohibit use of Arcli for sensitive-personal-data targeting, including health, religion, ethnicity, political views, sexual orientation, gender identity, or disability.</p>
          </Section>

          <Section title="10. Changes and contact">
            <p>We may update this policy when the Service or legal requirements change. We will post the updated date here. Questions or requests can be sent to <a className="font-medium text-blue-700 underline underline-offset-4" href="mailto:support@arcli.tech">support@arcli.tech</a>.</p>
            <p className="text-sm text-slate-500">This policy is written to describe the product’s current controls. It should be reviewed by counsel before a broad commercial launch, including confirmation of the operating legal entity, registered address, and jurisdiction-specific legal bases.</p>
          </Section>
        </article>

        <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><ExternalLink className="h-4 w-4" /> See also our <Link href="/terms" className="underline underline-offset-4">Terms of Service</Link>.</p>
      </div>
    </main>
  );
}
