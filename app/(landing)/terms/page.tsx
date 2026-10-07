import { Scale } from "lucide-react";

import {
  LegalDocument,
  LegalEmail,
  LegalLink,
  LegalList,
  Term,
  type LegalSection,
} from "@/components/legal/legal-document";
import { PRO_MONTHLY_PRICE, PRO_TRIAL_DAYS } from "@/lib/entitlements";
import {
  ACCOUNT_DELETION_DAYS,
  LEGAL_COURTS,
  LEGAL_GOVERNING_LAW,
  LIABILITY_CAP_FLOOR_USD,
  PRICE_CHANGE_NOTICE_DAYS,
  PUBLIC_SOURCE_RETENTION_DAYS,
  TERMS_CHANGE_NOTICE_DAYS,
  operatorDescription,
} from "@/lib/legal/details";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

// These Terms describe how the product behaves today (trial length, billing,
// retention, cancellation). They have not been reviewed by a lawyer; have
// counsel confirm them before a broad commercial launch.

export const metadata = publicPageMetadata(
  "/terms",
  "Terms of Service | Arcli",
  "Terms and acceptable use rules for Arcli's prospect research and public-conversation service.",
);

const summary = [
  "Arcli finds public conversations and prospects that may be relevant to your product and shows you the evidence. You review every result and decide what to do with it. Arcli never sends outreach for you.",
  `Pro costs $${PRO_MONTHLY_PRICE} per month. New workspaces get one ${PRO_TRIAL_DAYS}-day free trial. A card is required to start it, and it is charged automatically when the trial ends unless you cancel first.`,
  "You can cancel at any time and keep access until the end of the period you have paid for. Payments are non-refundable.",
  "You are responsible for any outreach you choose to do and for following the privacy, anti-spam, and platform rules that apply to it.",
  "AI-assisted results can be wrong, results vary by market, and our liability to you is limited.",
];

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement and who we are",
    content: (
      <>
        <p>These Terms of Service (the “Terms”) are an agreement between you and Arcli. Arcli is operated by {operatorDescription()} (“Arcli”, “we”, “us”). The operator’s legal name and business address are available on request from <LegalEmail />.</p>
        <p>The Terms cover arcli.tech, the Arcli dashboard, and related services (the “Service”). By creating an account or using the Service you agree to them. If you do not agree, do not use the Service.</p>
        <p>The Service is intended for business use. You must be at least 18 years old. If you use the Service for a company or other organisation, you confirm that you are authorised to accept these Terms for it, and “you” means that organisation.</p>
      </>
    ),
  },
  {
    id: "service",
    title: "The Service",
    content: (
      <>
        <p>Arcli helps customers research potentially relevant accounts and public conversations. It learns from information you supply, checks selected public sources, and presents evidence and possible next steps for human review.</p>
        <p>Arcli is not a data broker, a contact-enrichment service, or an outreach automation tool. It does not guarantee sales, leads, a number of matches, accuracy, or results. How useful it is depends on your market and on what is being discussed publicly.</p>
        <p><Term>Plans.</Term> The Free plan prepares a brief from your website. The Pro plan covers self-serve scanning of supported public conversations. Any assisted prospect pilot is a separate arrangement with its own agreed scope and commercial terms; where those terms conflict with these Terms, the pilot terms apply to the pilot.</p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and workspaces",
    content: (
      <>
        <p>You must provide accurate account information and keep it up to date. Keep your credentials and API keys secure, and do not share a login between people. You are responsible for activity under your account and in your workspace.</p>
        <p>You must have authority to use any website, product information, or integration you add to Arcli. Workspace owners and admins control billing for their workspace.</p>
        <p>Tell us promptly at <LegalEmail /> if you believe your account has been accessed without permission.</p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Plans, free trial, and billing",
    content: (
      <>
        <p><Term>Price.</Term> Pro is a monthly subscription at ${PRO_MONTHLY_PRICE} per month, or the price shown to you at checkout, billed in advance. Prices exclude taxes unless stated; any applicable sales tax or VAT is added at checkout.</p>
        <p><Term>Payment provider.</Term> Payments are handled by Dodo Payments, which acts as the merchant of record: it sells the subscription to you, collects payment, calculates and remits tax, and issues your receipt. Its name may appear on your card statement. We do not receive or store your full card number.</p>
        <p><Term>Free trial.</Term> A workspace subscribing to Pro for the first time receives one {PRO_TRIAL_DAYS}-day free trial. A valid payment card is required to start it. Unless you cancel before the trial ends, your card is charged the first monthly fee automatically when it ends. The trial is available once per workspace and customer, and we may refuse or end a trial that we reasonably believe is being abused, for example through repeated sign-ups.</p>
        <p><Term>Renewal.</Term> Your subscription renews automatically each month, and you authorise the recurring charge until you cancel.</p>
        <p><Term>Failed payments.</Term> If a payment fails, Pro features are paused until you update your payment method. If the payment is not resolved, the subscription may be cancelled.</p>
        <p><Term>Price changes.</Term> We may change the price of Pro. We will give you at least {PRICE_CHANGE_NOTICE_DAYS} days’ notice by email, and the new price applies from your next billing period after the notice. You can cancel before it takes effect.</p>
      </>
    ),
  },
  {
    id: "cancellation-refunds",
    title: "Cancellation and refunds",
    content: (
      <>
        <p>You can cancel at any time from your workspace settings. Cancelling stops future charges. Pro access continues until the end of the trial or of the billing period you have already paid for, and the workspace then returns to the Free plan. You can resume a cancelled subscription before that date.</p>
        <p><Term>All payments are final and non-refundable.</Term> We do not provide refunds or credits for partial billing periods, unused time, a trial that converted because it was not cancelled in time, or results you find unsatisfactory, except where a refund is required by applicable law.</p>
        <p>If you think a charge is a mistake, contact <LegalEmail subject="Billing question" /> first so we can look into it. We may suspend a workspace while a payment dispute or chargeback on its subscription is unresolved.</p>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    content: (
      <>
        <p>You keep ownership of what you provide to Arcli, such as your website details, product description, matching brief, review decisions, and notes (“Your Content”).</p>
        <p>You give us a non-exclusive, worldwide licence to host, process, and display Your Content only as needed to provide, secure, and improve the Service for you. You confirm you have the rights needed to give us that licence.</p>
        <p>If you send us feedback or suggestions, we may use them without restriction or payment.</p>
      </>
    ),
  },
  {
    id: "public-source-content",
    title: "Public-source content",
    content: (
      <>
        <p>Arcli uses selected public sources through configured public interfaces. Public availability does not make content free of legal or platform restrictions. Source content remains subject to the source’s own terms and to the rights of its authors, and nothing in these Terms transfers ownership of it to you.</p>
        <p>We keep public-source content for a limited time, {PUBLIC_SOURCE_RETENTION_DAYS} days by default, after which matches based on it are deleted. We may also limit, remove, or stop collecting content or a source at any time to protect people, honour a removal request, comply with source requirements, or manage legal and security risk. Results you saw earlier may therefore stop being available.</p>
      </>
    ),
  },
  {
    id: "human-review",
    title: "Human review and outreach",
    content: (
      <>
        <p>Arcli does not automatically send messages. A prospect file, lead brief, or suggested reply is only an assistive output. You must review its cited sources and decide whether any outreach is appropriate.</p>
        <p>If you contact someone, you are responsible for the message, your lawful basis, disclosures, opt-out handling, and compliance with the anti-spam, privacy, consumer-protection, and platform rules that apply to you and to the recipient.</p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You must not use Arcli to:</p>
        <LegalList
          items={[
            "send or facilitate automated, bulk, deceptive, or unsolicited outreach;",
            "target, profile, or contact minors;",
            "infer, target, or discriminate based on sensitive personal data, including health, religion, ethnicity, political views, sexual orientation, gender identity, or disability;",
            "export, resell, sublicense, or create a competing database from public-source content;",
            "circumvent source controls, scrape private content, identify anonymous people, or collect contact details from the Service;",
            "carry out unlawful, harmful, fraudulent, harassing, or rights-infringing activity.",
          ]}
        />
        <p>You also must not:</p>
        <LegalList
          items={[
            "copy, scrape, reverse engineer, or build a competing product from the Service, except where the law does not allow this restriction;",
            "bypass plan limits, rate limits, or access controls, or create accounts to obtain additional free trials or free scans;",
            "resell or share access to the Service outside your organisation;",
            "probe, scan, or test the security of the Service without our written permission, or interfere with its operation;",
            "upload malicious code or content you have no right to use.",
          ]}
        />
      </>
    ),
  },
  {
    id: "ai-output",
    title: "AI-assisted output",
    content: (
      <>
        <p>Arcli uses AI services to summarise, score, classify, and draft. This output can be incomplete, out of date, or wrong, and similar inputs can produce different results. A match is a suggestion, not a statement of fact about a person or company.</p>
        <p>AI-assisted output is not legal, compliance, employment, credit, health, or financial advice, and must not be the sole basis for a decision about a person.</p>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "Integrations and third-party services",
    content: (
      <>
        <p>You may connect Arcli to services you control, such as a CRM webhook. You are responsible for the destination you configure, for what you send to it, and for your agreement with that provider. We are not responsible for third-party services or public sources, which are governed by their own terms.</p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Our intellectual property",
    content: (
      <>
        <p>We and our licensors own the Service, including its software, design, and branding. While you comply with these Terms, we give you a limited, non-exclusive, non-transferable right to use the Service for your internal business purposes. All other rights are reserved.</p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy and removal requests",
    content: (
      <>
        <p>Our <LegalLink href="/privacy">Privacy Policy</LegalLink> explains how we handle information, and our <LegalLink href="/cookies">Cookie Policy</LegalLink> explains what we store in your browser. A person can ask us to remove public-source content through our <LegalLink href="/privacy/remove">removal request form</LegalLink>. You must not try to bypass or reverse a completed removal.</p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes to the Service",
    content: (
      <>
        <p>We work to keep the Service available, but we do not promise uninterrupted or error-free operation and do not offer a service-level commitment. The Service depends on public sources and third-party providers that can change, limit, or withdraw access without notice.</p>
        <p>We may add, change, or remove features and supported sources. If a change materially reduces what your paid plan includes, we will tell you in advance where reasonably possible, and you can cancel as described above.</p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    content: (
      <>
        <p>You may stop using Arcli at any time. To close your account and delete your workspace, email <LegalEmail subject="Close my account" />. Closing an account does not by itself cancel a subscription, so cancel it in your workspace settings first.</p>
        <p>We may suspend or terminate access where we reasonably believe these Terms, source requirements, applicable law, or another person’s rights are being or may be violated, where a payment is overdue or disputed, or where it is needed to protect the Service or other people. Where reasonable, we will tell you why and give you a chance to fix the problem first.</p>
        <p>When an account is closed, your right to use the Service ends. We delete or anonymise your workspace data within {ACCOUNT_DELETION_DAYS} days of a verified closure request, except for records we need to keep for billing, security, dispute handling, or legal reasons. Sections that by their nature should continue after termination, including those on payment, intellectual property, disclaimers, liability, indemnity, and disputes, continue to apply.</p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: (
      <>
        <p>To the fullest extent permitted by law, the Service is provided “as is” and “as available”, without warranties of any kind, whether express, implied, or statutory, including warranties of merchantability, fitness for a particular purpose, accuracy, and non-infringement.</p>
        <p>We do not warrant that public-source content is accurate, complete, current, or lawful to use for your purpose, that a person or company identified in a result is interested in your product, or that the Service will produce any particular commercial outcome.</p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: (
      <>
        <p>To the fullest extent permitted by law, we are not liable for indirect, incidental, special, consequential, or punitive loss, or for loss of profits, revenue, business, goodwill, or data, even if we were told the loss was possible.</p>
        <p>Our total liability for all claims relating to the Service is limited to the greater of the amount you paid for the Service in the 12 months before the event giving rise to the claim and USD {LIABILITY_CAP_FLOOR_USD}.</p>
        <p>Nothing in these Terms limits liability that cannot be limited under applicable law, such as liability for fraud or for death or personal injury caused by negligence.</p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Your responsibility for claims",
    content: (
      <>
        <p>You agree to compensate us for losses, costs, and reasonable legal fees arising from a third-party claim caused by your outreach or other use of results, Your Content, or your breach of these Terms or of the law. We will tell you about such a claim promptly and cooperate reasonably in its defence.</p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law and disputes",
    content: (
      <>
        <p>If you have a complaint, contact <LegalEmail /> first. We will try in good faith to resolve it within 30 days before either of us starts formal proceedings.</p>
        <p>These Terms are governed by {LEGAL_GOVERNING_LAW}. Subject to the next paragraph, {LEGAL_COURTS} have exclusive jurisdiction over any dispute relating to these Terms or the Service.</p>
        <p>If you are a consumer, this does not remove protections or the right to bring proceedings that the mandatory law of your country of residence gives you.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    content: (
      <>
        <p>We may update these Terms as the Service changes. The date at the top shows the latest version. For a change that materially affects your rights or obligations, we will notify you by email or in the dashboard at least {TERMS_CHANGE_NOTICE_DAYS} days before it takes effect. Continuing to use the Service after that date means you accept the updated Terms. If you do not accept them, you can cancel before they take effect.</p>
      </>
    ),
  },
  {
    id: "general",
    title: "General",
    content: (
      <>
        <p>These Terms, together with the policies they link to and any separate pilot terms, are the whole agreement between us about the Service. If part of them is found unenforceable, the rest continues to apply. If we do not enforce a term, we can still enforce it later.</p>
        <p>You may not transfer your rights under these Terms without our consent. We may transfer ours as part of a reorganisation or a sale of the business, and will tell you if that happens.</p>
        <p>Neither of us is liable for a delay or failure caused by events beyond reasonable control, such as outages at an infrastructure provider or a public source. We send notices to the email address on your account; you can send notices to <LegalEmail />. These Terms are written in English, and the English version applies if a translation differs.</p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <>
        <p>Questions about these Terms can be sent to <LegalEmail />.</p>
      </>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocument
      icon={Scale}
      title="Arcli Terms of Service"
      intro={
        <p>These Terms govern your use of Arcli. Please read them before creating an account or starting a subscription.</p>
      }
      summary={summary}
      sections={sections}
      related={[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/cookies", label: "Cookie Policy" },
        { href: "/security", label: "Security practices" },
      ]}
    />
  );
}
