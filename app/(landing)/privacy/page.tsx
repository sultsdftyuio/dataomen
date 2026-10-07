import { ShieldCheck } from "lucide-react";

import {
  LegalDefinitions,
  LegalDocument,
  LegalEmail,
  LegalLink,
  LegalList,
  Term,
  type LegalSection,
} from "@/components/legal/legal-document";
import {
  ACCOUNT_DELETION_DAYS,
  PILOT_APPLICATION_RETENTION_DAYS,
  PUBLIC_SOURCE_RETENTION_DAYS,
  REMOVAL_REQUEST_RETENTION_DAYS,
  RESULT_EMAIL_RECORD_RETENTION_DAYS,
  operatorDescription,
} from "@/lib/legal/details";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

// This policy describes the product's current controls and the providers the
// code is configured to use. Update it whenever a provider, a public source, a
// retention period, or a tracking technology changes. It has not been reviewed
// by a lawyer; have counsel confirm the legal bases, transfer safeguards, and
// regional wording before a broad commercial launch.

export const metadata = publicPageMetadata(
  "/privacy",
  "Privacy Policy | Arcli",
  "How Arcli handles account information and selected public-source data.",
);

const summary = [
  "We collect what we need to run your account: your email, your website and matching brief, billing status, and technical logs. Card details go to our payment provider, not to us.",
  `We also collect limited content from selected public sources (a post’s text, public handle, link, and time) to judge whether it is relevant to a customer. We keep it for ${PUBLIC_SOURCE_RETENTION_DAYS} days by default.`,
  "We do not sell personal information, build advertising profiles, collect private messages or contact details, or send outreach to anyone.",
  "If a public post or account of yours appears in Arcli, you can ask us to remove it and stop collecting it.",
  "You can ask to see, correct, export, or delete your information at any time.",
];

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and what this covers",
    content: (
      <>
        <p>This policy applies to arcli.tech, the Arcli dashboard, and related services (the “Service”). Arcli is operated by {operatorDescription()} (“Arcli”, “we”, “us”), who decides how the information described here is used. For any privacy question or request, contact <LegalEmail subject="Privacy request" />.</p>
        <p>It covers two groups of people: customers and visitors who use the Service, and people whose public posts may be collected from supported public sources. If you are in the second group, the section on <LegalLink href="#public-source-data">public-source data</LegalLink> is written for you.</p>
        <p>Customers decide for themselves how they use a result after reviewing it. They are separately responsible for their own outreach, CRM, and legal obligations.</p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    content: (
      <>
        <p><Term>Account and workspace information.</Term> Your email address, authentication details, workspace name, role, and settings; your website URL; and the product description, matching brief, review decisions, feedback, and notes you provide.</p>
        <p><Term>Billing information.</Term> Our payment provider collects your card and billing details. We receive a customer and subscription identifier, your plan, its status, and billing dates. We do not receive or store your full card number.</p>
        <p><Term>Your public website.</Term> When you submit a website, we read its public pages to prepare your brief.</p>
        <p><Term>Pilot applications.</Term> If you request a coverage review, we collect your email, company website, a description of your offer and ideal customer, and any buyer-role or geography details you provide. We also keep a limited, pseudonymous rate-limit identifier to prevent abuse.</p>
        <p><Term>Selected public-source information.</Term> Limited content from supported public sources: a public post’s title and text, public handle, link, source name, and publication time. See the section on <LegalLink href="#public-source-data">public-source data</LegalLink>.</p>
        <p><Term>Usage and technical information.</Term> Logs needed to operate, secure, rate-limit, and troubleshoot the Service, such as IP address, browser and device type, pages requested, and timestamps. We also record aggregate product usage, such as a result being opened or marked done. These usage events never include post text, authors, or links.</p>
        <p><Term>Messages you send us.</Term> The content of support emails and privacy or removal requests, and the address you send them from.</p>
        <p><Term>Integrations.</Term> If you connect an integration, such as a CRM webhook, we store the connection details you provide and send it only what you choose to send.</p>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "How we use information and why",
    content: (
      <>
        <p>We use information only for the purposes below. Where the law requires a legal basis, the one we rely on is shown beside each purpose.</p>
        <LegalDefinitions
          items={[
            {
              term: "Providing the Service",
              description:
                "Creating and securing accounts, preparing your brief, retrieving and evaluating public discussions, showing results, and answering support requests. Basis: performing our contract with you.",
            },
            {
              term: "Billing",
              description:
                "Starting trials, processing subscriptions, and keeping payment records. Basis: performing our contract and meeting legal obligations.",
            },
            {
              term: "Public-source matching",
              description:
                "Collecting and assessing limited public posts for relevance to a customer’s product. Basis: our and our customers’ legitimate interests in researching public discussion, balanced by the safeguards described below.",
            },
            {
              term: "Security and abuse prevention",
              description:
                "Rate limiting, detecting misuse, investigating incidents, and enforcing our Terms. Basis: legitimate interests and legal obligations.",
            },
            {
              term: "Improving the Service",
              description:
                "Understanding in aggregate which features are used and where results are unhelpful. Basis: legitimate interests.",
            },
            {
              term: "Optional result emails",
              description:
                "Sending website-brief and scan-result emails if you turn them on. Basis: your consent, which you can withdraw in Settings at any time.",
            },
            {
              term: "Pilot applications",
              description:
                "Assessing source coverage, deciding whether a pilot is suitable, replying to you, and agreeing scope. Basis: steps taken at your request before a contract.",
            },
          ]}
        />
        <p>We use your account email for sign-in, recovery, security, billing, and other messages needed to operate your account. Applying for a pilot does not create a paid subscription or opt you into marketing emails.</p>
        <p>We do not sell personal information, use it for advertising, or use public-source personal data to train Arcli models. We do not make decisions about a person that have legal or similarly significant effects using automated processing alone.</p>
      </>
    ),
  },
  {
    id: "ai-processing",
    title: "AI-assisted processing",
    content: (
      <>
        <p>To prepare a brief, assess relevance, and draft a suggested, human-editable reply, we send content to an AI service provider: your website content and matching brief, and limited public post text. The provider processes it on our behalf to operate the Service.</p>
        <p>A match is a suggestion, not a fact about a person or a recommendation to contact them. Customers must review it, use the original public link, and make their own decision.</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share information with",
    content: (
      <>
        <p>We share information only with service providers that help us run the Service, and only what each one needs. The providers we currently use are:</p>
        <LegalDefinitions
          items={[
            { term: "Supabase", description: "Database and account authentication." },
            { term: "Vercel", description: "Hosting of the website and dashboard, and cookieless usage analytics." },
            { term: "DigitalOcean", description: "Hosting of our API and background processing." },
            { term: "Cloudflare", description: "Network security and content delivery." },
            { term: "OpenAI", description: "AI-assisted analysis and drafting, as described above." },
            { term: "Firecrawl", description: "Reading the public pages of the website you submit." },
            { term: "Resend", description: "Delivering emails. It receives the destination address and the message content." },
            {
              term: "Dodo Payments",
              description:
                "Payment processing as merchant of record. It handles your payment details under its own privacy policy.",
            },
          ]}
        />
        <p>We may also disclose information where the law requires it, to protect people or the Service from harm or misuse, or to a successor if the business is reorganised or sold, in which case this policy continues to apply to information already collected.</p>
        <p>Results that customers see include the public post’s text, public handle, and link, since reviewing the original source is the purpose of the Service. We do not sell or rent personal information to anyone.</p>
      </>
    ),
  },
  {
    id: "public-source-data",
    title: "Public-source data and people who are not customers",
    content: (
      <>
        <p>Arcli looks at selected public discussions so that a business can find conversations about problems its product may solve. If you posted publicly on a supported source, a limited copy of that post may be collected and shown to a customer for whom it appears relevant.</p>
        <p><Term>Sources.</Term> We collect only from configured public sources through their public interfaces. These currently include public discussion and developer platforms such as Hacker News, Stack Exchange, GitHub, Bluesky, Lemmy, and X. The list changes over time.</p>
        <p><Term>What we take.</Term> A post’s title and text, public handle, link, source name, and publication time.</p>
        <p><Term>What we do not take.</Term> Private accounts, private groups, direct messages, profile biographies, or contact-enrichment data. We redact clear email addresses and telephone numbers from text before storage, and exclude posts that clearly concern minors or sensitive personal topics.</p>
        <p><Term>How it is used.</Term> Only to assess whether the discussion may be relevant to a customer’s product and to show that customer the source. We do not contact authors. Any contact a customer makes is their own separate, human decision.</p>
        <p><Term>Notice.</Term> We do not hold contact details for authors, and obtaining them only to send a notice would mean collecting more personal data. We publish this policy instead.</p>
        <p><Term>Removal.</Term> If a public post or account of yours should not appear in Arcli, use our <LegalLink href="/privacy/remove">public-source data removal form</LegalLink> or email <LegalEmail subject="Public source data removal" /> with the public link. We confirm requests before acting, to protect people from fraudulent removals. Once a request is verified and completed, we delete matching records and suppress future collection of the same public post, handle, or link where technically possible.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    content: (
      <>
        <LegalDefinitions
          items={[
            {
              term: "Public-source content",
              description: `${PUBLIC_SOURCE_RETENTION_DAYS} days by default. When that period ends we delete the record and the related copies in lead briefs and buyer-language research.`,
            },
            {
              term: "Account and workspace data",
              description: `For as long as the account is active. After a verified request to close the account, we delete or anonymise it within ${ACCOUNT_DELETION_DAYS} days.`,
            },
            {
              term: "Billing records",
              description:
                "For as long as tax, accounting, and dispute-handling rules require. Our payment provider keeps its own records under its own policy.",
            },
            {
              term: "Removal requests",
              description: `${REMOVAL_REQUEST_RETENTION_DAYS} days after a request is resolved, we anonymise the requester’s email, rate-limit identifier, and free-form explanation. We keep only the suppression identity needed to avoid collecting the same item again.`,
            },
            {
              term: "Result-email records",
              description: `Delivery and preference records are kept for ${RESULT_EMAIL_RECORD_RETENTION_DAYS} days to honour your choice, troubleshoot delivery, and prevent duplicate messages.`,
            },
            {
              term: "Pilot applications",
              description: `${PILOT_APPLICATION_RETENTION_DAYS} days, unless the applicant becomes a customer or asks us to delete it sooner.`,
            },
            {
              term: "Technical logs",
              description: "A limited period needed for security, troubleshooting, and abuse prevention.",
            },
          ]}
        />
        <p>We may keep a small amount of information for longer where it is needed for security, to handle a dispute, or to meet a legal obligation.</p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your privacy rights",
    content: (
      <>
        <p>Depending on where you live, you may have the right to:</p>
        <LegalList
          items={[
            "ask what information we hold about you and receive a copy of it;",
            "have inaccurate information corrected;",
            "have your information deleted;",
            "object to or restrict how we use it, including our use of public-source content about you;",
            "receive information you gave us in a portable format;",
            "withdraw a consent you gave, without affecting what was done before;",
            "complain to the data protection authority where you live.",
          ]}
        />
        <p>To use any of these rights, email <LegalEmail subject="Privacy request" />. We may need to verify your identity before acting. We respond within one month, or tell you if we need longer where the law allows it. We do not charge for a request or treat you differently for making one.</p>
        <p><Term>California residents.</Term> We do not sell personal information or share it for cross-context behavioural advertising, and have not done so in the past 12 months. The categories we collect, their sources, and their purposes are described above.</p>
      </>
    ),
  },
  {
    id: "email-choices",
    title: "Email choices",
    content: (
      <>
        <p>Optional website-brief and scan-result emails are off until you turn them on in <LegalLink href="/settings#result-emails">Settings</LegalLink>, and you can turn them off there at any time. They report only website hosts and aggregate outcomes and contain no promotions.</p>
        <p>Turning them off stops future result messages and causes pending, unsent notifications to be skipped. An email already being sent cannot be recalled. If you change your account email, you must enable result emails again for the new address.</p>
        <p>Account, security, and billing messages are separate, because we need them to run your account.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and analytics",
    content: (
      <>
        <p>We use only the cookies and browser storage needed to run the Service, and cookieless analytics that do not track you across other sites. Our <LegalLink href="/cookies">Cookie Policy</LegalLink> lists them.</p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International processing",
    content: (
      <>
        <p>Arcli and its providers process information in countries other than your own, including the United States. Where the law requires it, we rely on appropriate safeguards for these transfers, such as standard contractual clauses agreed with the provider.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <>
        <p>We use technical and organisational measures designed to protect information from unauthorised access, loss, or misuse. These include encrypted connections to the Service, access rules that confine each workspace to its own data, limited operator access, and minimising and redacting public-source content before it is stored. Our <LegalLink href="/security">security practices</LegalLink> page describes the boundaries of the product.</p>
        <p>No system is completely secure. If a security incident is likely to affect you, we will tell you and the relevant authorities as the law requires.</p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children and sensitive information",
    content: (
      <>
        <p>Arcli is a business service and is not directed to children or intended for anyone under 18. Customers must not use the Service to target, profile, or contact minors.</p>
        <p>We also prohibit using Arcli to target people on the basis of sensitive personal data, including health, religion, ethnicity, political views, sexual orientation, gender identity, or disability.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    content: (
      <>
        <p>We may update this policy when the Service, our providers, or legal requirements change. The date at the top shows the latest version, and we will tell customers by email or in the dashboard before a change that materially affects how we use their information.</p>
        <p>Questions and requests can be sent to <LegalEmail subject="Privacy request" />.</p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      icon={ShieldCheck}
      title="Arcli Privacy Policy"
      intro={
        <p>Arcli helps businesses research potential prospects and relevant public conversations. This policy explains what we collect, why we use it, who we share it with, and how to ask us to remove public-source content.</p>
      }
      summary={summary}
      sections={sections}
      related={[
        { href: "/terms", label: "Terms of Service" },
        { href: "/cookies", label: "Cookie Policy" },
        { href: "/privacy/remove", label: "Removal request form" },
      ]}
    />
  );
}
